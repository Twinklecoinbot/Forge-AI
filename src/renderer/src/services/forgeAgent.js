/**
 * Forge Agent — Cursor-style execution loop.
 * Guide mode → answers only. Execute mode → build/arrange/preview/deploy.
 */
import { runForgePrompt, runGuidePrompt } from './aiService.js';
import { isBuildIntent } from './rulesEngine.js';
import { extractFiles, previewHtml, projectNameFromPrompt } from './fileParser.js';
import { fileChangeStats } from './chatPresentation.js';
import { resolveIntentMode, statusLineForStage } from './intentMode.js';

const CONTINUE_BUILD = `Continue the same project. Emit ONLY the remaining missing files as <<<FILE>>> blocks. Do not repeat files already listed. No Thinking Process. No guides.`;

export function wantsDeploy(prompt = '') {
  return /(?:^|\s)\/deploy\b|deploy|publish|github pages|live link|host it|push to git/i.test(
    String(prompt || '')
  );
}

export function createAgentStages(mode = 'execute') {
  if (mode === 'guide') {
    return [
      { id: 'analyze', label: 'Thinking…', status: 'pending' },
      { id: 'guide', label: 'Answering…', status: 'pending' }
    ];
  }
  return [
    { id: 'analyze', label: 'Thinking…', status: 'pending' },
    { id: 'build', label: 'Building…', status: 'pending' },
    { id: 'arrange', label: 'Arranging files…', status: 'pending' },
    { id: 'preview', label: 'Opening preview…', status: 'pending' },
    { id: 'deploy', label: 'Deploy…', status: 'pending' }
  ];
}

function setStage(stages, id, status, label) {
  return stages.map((s) => (s.id === id ? { ...s, status, label: label || s.label } : s));
}

export async function runForgeAgent({
  apiKey,
  apiKeys,
  model,
  rules,
  history,
  prompt,
  contextFiles,
  attachments,
  previousFiles = [],
  githubConnected = false,
  signal,
  onProgress,
  deploy,
  mode: modeOverride
}) {
  const intent = resolveIntentMode(prompt);
  const mode = modeOverride || intent.mode;
  let stages = createAgentStages(mode);

  const emit = (patch = {}) => {
    const files = patch.files || [];
    const display =
      patch.display ||
      statusLineForStage(stages, files) ||
      (patch.busy ? 'Working…' : '');
    onProgress?.({
      stages,
      text: patch.text || '',
      files,
      display,
      previewUrl: patch.previewUrl || '',
      deployResult: patch.deployResult || null,
      changes: patch.changes || [],
      activity: patch.activity || '',
      mode
    });
  };

  // —— Guide path (no FILE build) ——
  if (mode === 'guide') {
    stages = setStage(stages, 'analyze', 'active', 'Thinking…');
    emit({ display: 'Thinking…', busy: true });
    stages = setStage(stages, 'analyze', 'done', 'Thought');
    stages = setStage(stages, 'guide', 'active', 'Answering…');
    emit({ display: 'Answering…', busy: true });

    const guide = await runGuidePrompt({
      apiKey,
      apiKeys,
      model,
      rules,
      history,
      prompt,
      contextFiles,
      signal,
      onToken: (_t, full) => {
        // Stream short prose only — still no code fences dumped raw if huge
        const clipped = String(full || '').slice(0, 6000);
        emit({ text: clipped, display: clipped, busy: true });
      }
    });

    stages = setStage(stages, 'guide', 'done', 'Answered');
    emit({ text: guide.text, display: guide.text, busy: false });
    return {
      ok: true,
      mode: 'guide',
      failedDelivery: false,
      text: guide.text,
      files: [],
      stages,
      changes: [],
      previewUrl: '',
      deployResult: null,
      projectName: null,
      skill: intent.skill,
      display: guide.text,
      activity: 'Finished guidance'
    };
  }

  // —— Execute path ——
  stages = setStage(stages, 'analyze', 'active', 'Thinking…');
  emit({ display: 'Thinking…', busy: true });
  const skill = intent.skill || 'build';
  const shouldDeploy = wantsDeploy(prompt) || skill === 'deploy';
  const projectName = slugName(projectNameFromPrompt(prompt));
  stages = setStage(stages, 'analyze', 'done', 'Thought');
  emit({
    display: `Building **${projectName}**…`,
    activity: 'Explored workspace',
    busy: true
  });

  stages = setStage(stages, 'build', 'active', 'Building…');
  emit({ display: 'Building…', busy: true });

  const buildResult = await runForgePrompt({
    apiKey,
    apiKeys,
    model,
    rules,
    history,
    prompt,
    contextFiles,
    attachments,
    signal,
    onToken: (_t, full) => {
      const partial = extractFiles(full);
      emit({
        text: full,
        files: partial,
        display: statusLineForStage(
          setStage(stages, 'build', 'active', partial.length ? `Building… ${partial.length} files` : 'Building…'),
          partial
        ),
        activity: partial.length ? `Writing ${partial.length} files into Code` : 'Building in background',
        busy: true
      });
    }
  });

  let files = arrangeProjectFiles(buildResult.files || [], projectName);
  let text = buildResult.text || '';

  if (isBuildIntent(prompt) && files.length > 0 && files.length < 6 && !signal?.aborted) {
    stages = setStage(stages, 'build', 'active', `Building… ${files.length} files`);
    emit({ files, display: `Building… ${files.length} files`, busy: true });
    const cont = await runForgePrompt({
      apiKey,
      apiKeys,
      model,
      rules,
      history: [
        ...(history || []),
        { role: 'user', content: prompt },
        { role: 'assistant', content: `Already wrote:\n${files.map((f) => `- ${f.path}`).join('\n')}` }
      ],
      prompt: CONTINUE_BUILD,
      contextFiles: files.slice(0, 20),
      attachments: [],
      signal,
      onToken: (_t, full) => {
        const partial = extractFiles(full);
        const merged = mergeFiles(files, partial);
        emit({
          text: full,
          files: merged,
          display: `Building… ${merged.length} files`,
          busy: true
        });
      }
    });
    files = arrangeProjectFiles(mergeFiles(files, cont.files || []), projectName);
    text = `${text}\n\n${cont.text || ''}`.trim();
  }

  if (!files.length) {
    stages = setStage(stages, 'build', 'done', 'Build failed — no files');
    stages = setStage(stages, 'arrange', 'pending');
    stages = setStage(stages, 'preview', 'pending');
    stages = setStage(stages, 'deploy', 'done', 'Deploy skipped');
    const display =
      '**Cause:** No files landed in Code (model guided instead of building).\n**Next:** Retry — Agent will force the FILE contract again.';
    emit({ text, files: [], display });
    return {
      ok: false,
      mode: 'execute',
      failedDelivery: true,
      text,
      files: [],
      stages,
      changes: [],
      previewUrl: '',
      deployResult: null,
      projectName,
      skill,
      display,
      activity: 'Finished 0 files'
    };
  }

  stages = setStage(stages, 'build', 'done', `Built ${files.length} files`);
  emit({
    text,
    files,
    display: `Built ${files.length} files into Code`,
    activity: `Edited ${files.length} files`,
    busy: true
  });

  stages = setStage(stages, 'arrange', 'active', 'Arranging files…');
  emit({ files, display: 'Arranging files…', busy: true });
  files = arrangeProjectFiles(files, projectName);
  const changes = fileChangeStats(files, previousFiles);
  const totals = sumChanges(changes);
  stages = setStage(stages, 'arrange', 'done', `Arranged ${files.length} paths`);
  emit({
    files,
    changes,
    text,
    display: `Arranged ${files.length} files`,
    activity: `Edited ${files.length} files +${totals.added} -${totals.removed}`,
    busy: true
  });

  stages = setStage(stages, 'preview', 'active', 'Opening preview…');
  emit({ files, changes, display: 'Opening preview…', busy: true });
  let previewUrl = '';
  const html = previewHtml(files);
  if (html && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      if (typeof window !== 'undefined' && window.__forgePreviewUrl) {
        URL.revokeObjectURL(window.__forgePreviewUrl);
      }
    } catch {
      /* ignore */
    }
    previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    if (typeof window !== 'undefined') window.__forgePreviewUrl = previewUrl;
  }
  stages = setStage(stages, 'preview', 'done', previewUrl ? 'Preview ready' : 'Preview via Code');
  emit({
    files,
    changes,
    previewUrl,
    text,
    display: previewUrl ? 'Preview ready — open Preview tab' : 'Files ready in Code',
    busy: true
  });

  let deployResult = null;
  if (!shouldDeploy) {
    stages = setStage(stages, 'deploy', 'done', 'Deploy not requested');
  } else if (!githubConnected || typeof deploy !== 'function') {
    stages = setStage(stages, 'deploy', 'done', 'Connect GitHub to deploy');
  } else {
    stages = setStage(stages, 'deploy', 'active', 'Deploying…');
    emit({ files, changes, previewUrl, display: 'Deploying to GitHub…', busy: true });
    try {
      deployResult = await deploy({ name: projectName, files, isPrivate: false });
      if (deployResult?.live) previewUrl = deployResult.live;
      stages = setStage(stages, 'deploy', 'done', deployResult?.live ? 'Live URL ready' : 'Published');
    } catch (error) {
      stages = setStage(stages, 'deploy', 'done', `Deploy error: ${error.message}`);
    }
  }

  const display = buildAgentDisplay({ projectName, files, previewUrl, deployResult, totals });
  emit({
    files,
    changes,
    previewUrl,
    deployResult,
    text,
    display,
    activity: `Finished · edited ${files.length} files +${totals.added} -${totals.removed}`,
    busy: false
  });

  return {
    ok: true,
    mode: 'execute',
    failedDelivery: false,
    text,
    files,
    stages,
    changes,
    previewUrl,
    deployResult,
    projectName,
    skill,
    display,
    activity: `Finished · edited ${files.length} files +${totals.added} -${totals.removed}`
  };
}

export function arrangeProjectFiles(files = [], projectName = 'forge-app') {
  const map = new Map();
  for (const file of files || []) {
    if (!file?.path || typeof file.content !== 'string') continue;
    let path = String(file.path)
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
    path = path.replace(/^([A-Za-z]:\/)?Users\/[^/]+\/(Desktop|Documents)\//i, '');
    if (!path || path.startsWith('http')) continue;
    map.set(path, { path, content: file.content });
  }

  const paths = [...map.keys()];
  const hasHtml = paths.some((p) => /(^|\/)index\.html$/i.test(p) || p.endsWith('.html'));
  const hasPkg = paths.some((p) => /(^|\/)package\.json$/i.test(p));
  if (!hasHtml) {
    map.set('index.html', {
      path: 'index.html',
      content: defaultPreviewHtml(projectName, hasPkg)
    });
  }
  if (!paths.some((p) => /(^|\/)README\.md$/i.test(p))) {
    map.set('README.md', {
      path: 'README.md',
      content: `# ${projectName}\n\nBuilt with Forge AI Agent.\n\n## Run\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`
    });
  }

  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function mergeFiles(base = [], incoming = []) {
  const map = new Map(base.map((f) => [f.path, f]));
  incoming.forEach((f) => {
    if (f?.path) map.set(f.path, f);
  });
  return [...map.values()];
}

function sumChanges(changes = []) {
  return changes.reduce(
    (acc, c) => ({ added: acc.added + (c.added || 0), removed: acc.removed + (c.removed || 0) }),
    { added: 0, removed: 0 }
  );
}

function buildAgentDisplay({ projectName, files, previewUrl, deployResult, totals }) {
  const lines = [
    `Built **${projectName}** · ${files.length} files in Code`,
    totals ? `Changes **+${totals.added}** **-${totals.removed}**` : null,
    previewUrl ? `Preview ready — open the Preview tab` : null,
    deployResult?.live ? `Live: \`${deployResult.live}\`` : null,
    deployResult?.repo?.html_url ? `Repo: \`${deployResult.repo.html_url}\`` : null
  ].filter(Boolean);
  return lines.join('\n');
}

function defaultPreviewHtml(name, hasPkg) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(name)}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:#000; color:#e7e9ea;
      min-height:100vh; display:grid; place-items:center; }
    .card { max-width:440px; padding:28px; border:1px solid #2f3336; border-radius:16px; }
    h1 { margin:0 0 8px; font-size:22px; }
    p { margin:0; color:#71767b; line-height:1.5; font-size:14px; }
    code { color:#1d9bf0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(name)}</h1>
    <p>${
      hasPkg
        ? 'Project files are in the Code tab. Preview updates as the agent writes HTML. For full frameworks run <code>npm install && npm run dev</code>.'
        : 'Project files are arranged in the Code tab. This preview updates when the agent changes files.'
    }</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugName(name = 'forge-app') {
  return (
    String(name || 'forge-app')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'forge-app'
  );
}
