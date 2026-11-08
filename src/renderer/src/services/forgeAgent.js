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
  mode: modeOverride,
  provider,
  localBaseUrl
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
      provider,
      localBaseUrl,
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
    provider,
    localBaseUrl,
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
      provider,
      localBaseUrl,
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
  const htmlEntry = [...map.values()].find((f) => /(^|\/)index\.html$/i.test(f.path) || /\.html$/i.test(f.path));
  const stub =
    htmlEntry &&
    /Project files are arranged|files are in the Code tab|Deployed with Forge AI|Built with Forge AI/i.test(
      htmlEntry.content || ''
    ) &&
    !/(twitter|x\.com|feed|timeline|tweet)/i.test(htmlEntry.content || '');
  // Never overwrite a model-authored UI with the generic Forge landing — that caused wrong previews
  if (!htmlEntry) {
    map.set('index.html', { path: 'index.html', content: defaultPreviewHtml(projectName) });
    if (![...map.keys()].some((p) => /(^|\/)styles\.css$/i.test(p))) {
      map.set('styles.css', { path: 'styles.css', content: defaultPreviewCss() });
    }
    if (![...map.keys()].some((p) => /(^|\/)app\.js$/i.test(p))) {
      map.set('app.js', { path: 'app.js', content: defaultPreviewJs(projectName) });
    }
  } else if (stub && String(htmlEntry.content || '').length < 1200) {
    map.set(htmlEntry.path || 'index.html', {
      path: htmlEntry.path || 'index.html',
      content: defaultPreviewHtml(projectName)
    });
  }
  if (!paths.some((p) => /(^|\/)README\.md$/i.test(p))) {
    map.set('README.md', {
      path: 'README.md',
      content: `# ${projectName}\n\nBuilt with Forge AI Agent.\n\nOpen \`index.html\` (Preview tab) or deploy for a live URL.\n\n## Dev\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`
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

function defaultPreviewHtml(name) {
  const title = escapeHtml(prettyName(name));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body>
  <div class="bg"></div>
  <header class="top">
    <a class="brand" href="#">${title}</a>
    <nav>
      <a href="#features">Features</a>
      <a href="#work">Product</a>
      <a href="#cta" class="btn btn-sm">Get started</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <p class="eyebrow">Built with Forge AI</p>
      <h1>${title}</h1>
      <p class="lede">A working product surface you can click, navigate, and iterate — Preview updates as the agent ships more files.</p>
      <div class="actions">
        <button class="btn" id="primary-cta" type="button">Launch demo</button>
        <a class="btn btn-ghost" href="#features">See features</a>
      </div>
      <p class="status" id="status">Ready</p>
    </section>
    <section id="features" class="grid">
      <article><h3>Interactive UI</h3><p>Real buttons, navigation, and state — not a placeholder card.</p></article>
      <article><h3>Live preview</h3><p>Opens inside Forge Preview and on GitHub Pages after deploy.</p></article>
      <article><h3>Full-stack ready</h3><p>Extend with API routes and data layers from the Code tab.</p></article>
    </section>
    <section id="work" class="panel">
      <h2>Try it</h2>
      <form id="demo-form" class="form">
        <label>Your name<input name="name" placeholder="Alex" required/></label>
        <label>Goal<textarea name="goal" rows="3" placeholder="What should this app do?"></textarea></label>
        <button class="btn" type="submit">Save locally</button>
      </form>
      <ul id="notes" class="notes"></ul>
    </section>
    <section id="cta" class="cta">
      <h2>Ship the next version in chat</h2>
      <p>Ask Forge to refine this UI, add auth, or wire a backend — files update here automatically.</p>
    </section>
  </main>
  <footer><span>${title}</span><span id="clock"></span></footer>
  <script src="app.js"></script>
</body>
</html>`;
}

function defaultPreviewCss() {
  return `:root {
  color-scheme: dark;
  --bg: #0b0d10;
  --panel: #12161c;
  --line: #243041;
  --text: #e8eef7;
  --muted: #8b9bb0;
  --accent: #3d8bfd;
  --accent-2: #20c997;
  --radius: 16px;
  --font: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; }
.bg {
  position: fixed; inset: 0; z-index: -1;
  background:
    radial-gradient(900px 500px at 15% -10%, rgba(61,139,253,.28), transparent 60%),
    radial-gradient(700px 420px at 90% 10%, rgba(32,201,151,.18), transparent 55%),
    linear-gradient(180deg, #0b0d10, #0a1018 50%, #07090c);
}
.top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px clamp(16px, 4vw, 48px); border-bottom: 1px solid var(--line);
  backdrop-filter: blur(10px); position: sticky; top: 0; background: rgba(11,13,16,.72);
}
.brand { color: var(--text); text-decoration: none; font-weight: 700; letter-spacing: -.02em; }
nav { display: flex; gap: 16px; align-items: center; }
nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
nav a:hover { color: var(--text); }
main { width: min(1080px, 100%); margin: 0 auto; padding: 28px 16px 80px; }
.hero { padding: 56px 0 40px; }
.eyebrow { color: var(--accent-2); text-transform: uppercase; letter-spacing: .12em; font-size: 12px; margin: 0 0 12px; }
.hero h1 { margin: 0 0 14px; font-size: clamp(2rem, 5vw, 3.4rem); letter-spacing: -.04em; line-height: 1.05; max-width: 14ch; }
.lede { margin: 0 0 24px; color: var(--muted); font-size: 1.05rem; max-width: 54ch; line-height: 1.6; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn {
  appearance: none; border: 0; border-radius: 999px; padding: 12px 18px; font-weight: 600;
  background: linear-gradient(135deg, var(--accent), #6aa8ff); color: #041018; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items: center; justify-content: center;
}
.btn:hover { filter: brightness(1.05); }
.btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--line); }
.btn-sm { padding: 8px 12px; font-size: 13px; }
.status { margin-top: 14px; color: var(--accent-2); font-size: 13px; min-height: 1.2em; }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 18px 0 36px; }
.grid article, .panel, .cta {
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--line); border-radius: var(--radius); padding: 20px;
}
.grid h3, .panel h2, .cta h2 { margin: 0 0 8px; letter-spacing: -.02em; }
.grid p, .cta p { margin: 0; color: var(--muted); line-height: 1.55; }
.form { display: grid; gap: 12px; margin-top: 12px; }
label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
input, textarea {
  width: 100%; border-radius: 12px; border: 1px solid var(--line); background: #0a0e14;
  color: var(--text); padding: 10px 12px; font: inherit;
}
.notes { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 8px; }
.notes li {
  border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: #0a0e14; font-size: 14px;
}
footer {
  border-top: 1px solid var(--line); padding: 16px clamp(16px, 4vw, 48px);
  display: flex; justify-content: space-between; color: var(--muted); font-size: 12px;
}
@media (max-width: 640px) {
  nav a:not(.btn) { display: none; }
}`;
}

function defaultPreviewJs(name) {
  const title = JSON.stringify(prettyName(name));
  return `(() => {
  const status = document.getElementById('status');
  const clock = document.getElementById('clock');
  const notes = document.getElementById('notes');
  const form = document.getElementById('demo-form');
  const cta = document.getElementById('primary-cta');
  const key = 'forge-preview-notes:' + ${title};

  const setStatus = (msg) => { if (status) status.textContent = msg; };
  const tick = () => { if (clock) clock.textContent = new Date().toLocaleString(); };
  tick();
  setInterval(tick, 1000);

  const load = () => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  };
  const save = (items) => localStorage.setItem(key, JSON.stringify(items.slice(0, 20)));
  const render = () => {
    if (!notes) return;
    const items = load();
    notes.innerHTML = items.length
      ? items.map((n) => '<li><strong>' + escapeHtml(n.name) + '</strong> — ' + escapeHtml(n.goal || '') + '</li>').join('')
      : '<li>No notes yet — submit the form.</li>';
  };
  const escapeHtml = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  cta?.addEventListener('click', () => {
    setStatus('Demo launched · ' + new Date().toLocaleTimeString());
    document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' });
  });
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const entry = { name: String(data.get('name') || 'Guest'), goal: String(data.get('goal') || '') };
    const next = [entry, ...load()];
    save(next);
    form.reset();
    render();
    setStatus('Saved locally · ' + entry.name);
  });
  render();
  setStatus('Interactive preview ready');
})();`;
}

function prettyName(name = 'Forge App') {
  return String(name || 'Forge App')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Forge App';
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
