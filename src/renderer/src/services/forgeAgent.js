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

const FORCE_UI_BUILD = `CRITICAL UI REBUILD — previous files were a generic/wrong frontend (or missing a real product UI).

Rebuild ONLY these files to match the USER BRIEF and any REFERENCE IMAGES exactly:
<<<FILE path="index.html">>>
<<<FILE path="styles.css">>>
<<<FILE path="app.js">>>

Rules:
- Recreate the product the user asked for (e.g. X/Twitter clone = left nav, timeline, trends, compose, tweet cards — dark theme).
- Do NOT emit a "Built with Forge AI" marketing landing page.
- Make every control interactive in-browser (no top-window navigation).
- Full HTML/CSS/JS contents inside FILE blocks. No essays.`;

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

  // Analyze reference images / bug report before writing files
  let enrichedPrompt = prompt;
  const imageCount = (attachments || []).filter((a) => a.kind === 'image' && a.dataUrl).length;
  if (imageCount > 0 && !signal?.aborted) {
    stages = setStage(stages, 'analyze', 'active', 'Reading reference images…');
    emit({ display: 'Analyzing uploaded images / references…', activity: 'Vision analysis', busy: true });
    try {
      const { describeReferenceImages } = await import('./aiService.js');
      const visionBrief = await describeReferenceImages({
        apiKey,
        apiKeys,
        attachments,
        prompt,
        signal,
        provider,
        localBaseUrl
      });
      if (visionBrief) {
        enrichedPrompt = `${prompt}\n\nVISUAL SPEC FROM REFERENCE IMAGES (match exactly):\n${visionBrief}`;
      }
    } catch {
      /* continue without vision brief */
    }
  }

  // Debug / self-heal: prefer patching existing workspace files
  if ((skill === 'debug' || skill === 'fix') && previousFiles?.length) {
    enrichedPrompt = `${enrichedPrompt}\n\nSELF-HEAL MODE: Inspect the workspace files below (already in context), find the bug the user described, and emit patched <<<FILE>>> blocks for every broken file. Keep working frontend (index.html/styles.css/app.js). Do not rebuild an unrelated product.`;
  }

  const projectName = productSlug(enrichedPrompt, attachments);

  stages = setStage(stages, 'analyze', 'done', 'Thought');
  emit({
    display: skill === 'debug' || skill === 'fix' ? `Fixing **${projectName}**…` : `Building **${projectName}**…`,
    activity: imageCount ? `Analyzed ${imageCount} reference image(s)` : 'Explored workspace',
    busy: true
  });

  stages = setStage(stages, 'build', 'active', skill === 'debug' || skill === 'fix' ? 'Fixing…' : 'Building…');
  emit({ display: skill === 'debug' || skill === 'fix' ? 'Finding and fixing…' : 'Building…', busy: true });

  const buildResult = await runForgePrompt({
    apiKey,
    apiKeys,
    model,
    rules,
    history,
    prompt: enrichedPrompt,
    contextFiles: previousFiles?.length
      ? [...(contextFiles || []), ...previousFiles.filter((f) => isLikelyPatchTarget(f.path))].slice(0, 24)
      : contextFiles,
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

  let files = arrangeProjectFiles(buildResult.files || [], projectName, {
    prompt: enrichedPrompt,
    attachments,
    allowGenericFallback: false
  });
  let text = buildResult.text || '';

  if (isBuildIntent(prompt) && files.length > 0 && files.length < 8 && !signal?.aborted) {
    stages = setStage(stages, 'build', 'active', `Building… ${files.length} files`);
    emit({ files, display: `Building… ${files.length} files`, busy: true });
    const cont = await runForgePrompt({
      apiKey,
      apiKeys,
      model,
      rules,
      history: [
        ...(history || []),
        { role: 'user', content: enrichedPrompt },
        { role: 'assistant', content: `Already wrote:\n${files.map((f) => `- ${f.path}`).join('\n')}` }
      ],
      prompt: CONTINUE_BUILD,
      contextFiles: files.slice(0, 20),
      attachments, // keep reference images on continue
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
    files = arrangeProjectFiles(mergeFiles(files, cont.files || []), projectName, {
      prompt: enrichedPrompt,
      attachments,
      allowGenericFallback: false
    });
    text = `${text}\n\n${cont.text || ''}`.trim();
  }

  // If UI still doesn't match the request (generic Forge landing / too thin), force a dedicated UI pass
  if (!signal?.aborted && needsUiFidelityPass(files, enrichedPrompt, attachments)) {
    stages = setStage(stages, 'build', 'active', 'Rebuilding UI to match request…');
    emit({
      files,
      display: 'Rebuilding frontend to match your prompt / references…',
      activity: 'UI fidelity pass',
      busy: true
    });
    const uiPass = await runForgePrompt({
      apiKey,
      apiKeys,
      model,
      rules,
      history: [
        ...(history || []),
        { role: 'user', content: enrichedPrompt },
        {
          role: 'assistant',
          content: `Wrong UI shipped earlier (${files.map((f) => f.path).join(', ')}). Rebuilding product UI now.`
        }
      ],
      prompt: `${FORCE_UI_BUILD}\n\nUSER BRIEF:\n${enrichedPrompt}`,
      contextFiles: files.filter((f) => /\.(html|css|js)$/i.test(f.path)).slice(0, 6),
      attachments,
      signal,
      provider,
      localBaseUrl,
      onToken: (_t, full) => {
        const partial = extractFiles(full);
        const merged = mergeFiles(files, partial);
        emit({
          text: full,
          files: merged,
          display: `Rebuilding UI… ${partial.length || 0} files`,
          busy: true
        });
      }
    });
    files = arrangeProjectFiles(mergeFiles(files, uiPass.files || []), projectName, {
      prompt: enrichedPrompt,
      attachments,
      allowGenericFallback: false
    });
    text = `${text}\n\n${uiPass.text || ''}`.trim();
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
  files = arrangeProjectFiles(files, projectName, {
    prompt: enrichedPrompt,
    attachments,
    allowGenericFallback: false
  });
  if (needsUiFidelityPass(files, enrichedPrompt, attachments)) {
    const rescued = rescueProductUi(enrichedPrompt, attachments, projectName);
    if (rescued.length) {
      files = arrangeProjectFiles(mergeFiles(files.filter((f) => !isGenericForgeLanding(f.content || '')), rescued), projectName, {
        prompt: enrichedPrompt,
        attachments,
        allowGenericFallback: false
      });
    }
  }
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
      // Only swap Preview to live when Pages actually serves the app (not GitHub 404)
      if (deployResult?.pagesReady && deployResult?.live) {
        previewUrl = deployResult.live;
      } else if (deployResult?.live) {
        // Keep local Generated blob interactive; Live URL is stored for when Pages finishes
        stages = setStage(stages, 'deploy', 'active', 'Waiting for Pages…');
      }
      stages = setStage(
        stages,
        'deploy',
        'done',
        deployResult?.pagesReady
          ? 'Live URL ready'
          : deployResult?.live
            ? 'Published · Pages still building'
            : 'Published'
      );
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

export function arrangeProjectFiles(files = [], projectName = 'forge-app', opts = {}) {
  const { prompt = '', attachments = [], allowGenericFallback = false } = opts;
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
  const wantsSpecificUi = isSpecificProductRequest(prompt, attachments);
  const stub = htmlEntry && isGenericForgeLanding(htmlEntry.content || '');

  // Never inject the generic Forge marketing page for clone/reference builds —
  // that was the root cause of "built something I didn't ask for".
  if (!htmlEntry && allowGenericFallback && !wantsSpecificUi) {
    map.set('index.html', { path: 'index.html', content: defaultPreviewHtml(projectName) });
    if (![...map.keys()].some((p) => /(^|\/)styles\.css$/i.test(p))) {
      map.set('styles.css', { path: 'styles.css', content: defaultPreviewCss() });
    }
    if (![...map.keys()].some((p) => /(^|\/)app\.js$/i.test(p))) {
      map.set('app.js', { path: 'app.js', content: defaultPreviewJs(projectName) });
    }
  } else if (stub && !wantsSpecificUi && allowGenericFallback && String(htmlEntry.content || '').length < 900) {
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

export function isGenericForgeLanding(content = '') {
  const c = String(content || '');
  if (/Project files are arranged|files are in the Code tab|Deployed with Forge AI/i.test(c)) return true;
  if (/Built with Forge AI/i.test(c) && !/(timeline|tweet|whats happening|for you|following|sidebar nav)/i.test(c)) {
    return true;
  }
  return false;
}

export function isSpecificProductRequest(prompt = '', attachments = []) {
  const t = String(prompt || '');
  if ((attachments || []).some((a) => a.kind === 'image')) return true;
  return /\b(clone|twitter|\bx\b|instagram|youtube|dashboard|saas|ecommerce|shop|chat app|messenger)\b/i.test(t);
}

export function needsUiFidelityPass(files = [], prompt = '', attachments = []) {
  const html = files.find((f) => /(^|\/)index\.html$/i.test(f.path));
  if (!html) return isSpecificProductRequest(prompt, attachments) || isBuildIntent(prompt);
  if (isGenericForgeLanding(html.content)) return true;
  if (String(html.content || '').length < 1200 && isSpecificProductRequest(prompt, attachments)) return true;
  if (/\b(twitter|\bx\b)\b/i.test(prompt) && !/(timeline|tweet|whats happening|for you)/i.test(html.content || '')) {
    return true;
  }
  // Any image-referenced product that still looks like a thin marketing page
  if ((attachments || []).some((a) => a.kind === 'image') && isGenericForgeLanding(html.content)) return true;
  if ((attachments || []).some((a) => a.kind === 'image') && String(html.content || '').length < 2500) return true;
  return false;
}

function isLikelyPatchTarget(path = '') {
  return /\.(html?|css|js|jsx|ts|tsx|json|md|py|go|rs|java|php)$/i.test(path);
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
  const liveReady = Boolean(deployResult?.pagesReady && deployResult?.live);
  const lines = [
    `Built **${projectName}** · ${files.length} files in Code`,
    totals ? `Changes **+${totals.added}** **-${totals.removed}**` : null,
    previewUrl ? `Preview ready — open the Preview tab` : null,
    liveReady ? `Live: \`${deployResult.live}\`` : deployResult?.live ? `Pages building: \`${deployResult.live}\` (Preview stays on Generated until it loads)` : null,
    deployResult?.repo?.html_url ? `Repo: \`${deployResult.repo.html_url}\`` : null
  ].filter(Boolean);
  return lines.join('\n');
}

function productSlug(prompt = '', attachments = []) {
  const t = String(prompt || '');
  const userPart = t.split('\n\nVISUAL SPEC')[0];
  if (
    /\b(twitter|x\.com)\b/i.test(t) ||
    (/\bclone\b/i.test(t) && /\bx\b/i.test(t)) ||
    /\bwhat'?s happening\b/i.test(t) ||
    (/\bfor you\b/i.test(t) && /\b(premium|grok|timeline)\b/i.test(t))
  ) {
    return 'x-clone';
  }
  return slugName(projectNameFromPrompt(userPart));
}

/** Last resort when the model ships the generic Forge landing instead of the requested product. */
function rescueProductUi(prompt = '', attachments = [], projectName = 'app') {
  const t = String(prompt || '');
  const hasImage = (attachments || []).some((a) => a.kind === 'image');
  const wantsX =
    /\b(twitter|x\.com|\bx\b|clone)\b/i.test(t) ||
    /\b(what'?s happening|for you|subscribe to premium|grok)\b/i.test(t) ||
    (hasImage && /\b(timeline|feed|tweet|for you|premium|notifications)\b/i.test(t));
  if (!wantsX && !hasImage) return [];
  if (wantsX) {
    return [
      { path: 'index.html', content: xCloneHtml() },
      { path: 'styles.css', content: xCloneCss() },
      { path: 'app.js', content: xCloneJs() }
    ];
  }
  return [];
}

function xCloneHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>X</title>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body>
  <div class="app">
    <aside class="nav">
      <div class="logo">𝕏</div>
      <button class="nav-item active" data-tab="home">Home</button>
      <button class="nav-item" data-tab="explore">Explore</button>
      <button class="nav-item" data-tab="notifications">Notifications</button>
      <button class="nav-item" data-tab="messages">Messages</button>
      <button class="nav-item" data-tab="grok">Grok</button>
      <button class="post-btn" id="open-composer">Post</button>
      <div class="me"><strong>You</strong><span>@you</span></div>
    </aside>
    <main>
      <div class="tabs">
        <button class="tab active" data-feed="foryou">For you</button>
        <button class="tab" data-feed="following">Following</button>
      </div>
      <form class="composer" id="composer">
        <div class="avatar">Y</div>
        <div class="composer-body">
          <textarea id="compose-text" placeholder="What's happening?" maxlength="280"></textarea>
          <div class="composer-bar">
            <span id="count">0 / 280</span>
            <button type="submit">Post</button>
          </div>
        </div>
      </form>
      <section id="feed"></section>
    </main>
    <aside class="rail">
      <input class="search" id="search" placeholder="Search"/>
      <div class="card">
        <h3>Subscribe to Premium</h3>
        <p>Get rid of ads and unlock more features.</p>
        <button type="button" id="premium">Subscribe</button>
      </div>
      <div class="card">
        <h3>Today's News</h3>
        <ul id="news"></ul>
      </div>
    </aside>
  </div>
  <script src="app.js"></script>
</body>
</html>`;
}

function xCloneCss() {
  return `:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #000; color: #e7e9ea; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.app { display: grid; grid-template-columns: 260px minmax(0, 600px) 340px; min-height: 100vh; max-width: 1280px; margin: 0 auto; }
.nav { padding: 12px 16px; position: sticky; top: 0; height: 100vh; }
.logo { font-size: 28px; padding: 8px 12px; }
.nav-item, .post-btn, .tab, .composer-bar button, .card button { border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.nav-item { display: flex; width: 100%; text-align: left; padding: 12px 16px; border-radius: 999px; font-size: 18px; }
.nav-item.active, .nav-item:hover { background: #181818; }
.post-btn, .composer-bar button, .card button { background: #e7e9ea; color: #000; border-radius: 999px; font-weight: 700; padding: 12px 18px; }
.post-btn { width: 90%; margin-top: 12px; }
.me { margin-top: 24px; padding: 12px; border-radius: 16px; }
.me span { display: block; color: #71767b; font-size: 13px; }
main { border-left: 1px solid #2f3336; border-right: 1px solid #2f3336; min-height: 100vh; }
.tabs { display: flex; border-bottom: 1px solid #2f3336; position: sticky; top: 0; background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
.tab { flex: 1; padding: 16px; color: #71767b; }
.tab.active { color: #e7e9ea; box-shadow: inset 0 -3px #1d9bf0; }
.composer { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #2f3336; }
.avatar { width: 40px; height: 40px; border-radius: 999px; background: #1d9bf0; display: grid; place-items: center; font-weight: 700; }
textarea { width: 100%; min-height: 64px; resize: vertical; background: transparent; color: inherit; border: 0; font: inherit; font-size: 18px; outline: none; }
.composer-bar { display: flex; justify-content: flex-end; align-items: center; gap: 12px; color: #71767b; font-size: 13px; }
.composer-bar button { padding: 8px 16px; }
.post { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #2f3336; }
.post h4 { margin: 0; font-size: 15px; }
.post h4 span { color: #71767b; font-weight: 400; }
.post p { margin: 4px 0 8px; line-height: 1.4; }
.actions { display: flex; gap: 18px; color: #71767b; font-size: 13px; }
.actions button { background: none; border: 0; color: inherit; cursor: pointer; }
.actions button.liked { color: #f91880; }
.rail { padding: 8px 16px; }
.search { width: 100%; background: #202327; border: 0; color: inherit; border-radius: 999px; padding: 12px 16px; margin: 6px 0 16px; }
.card { background: #16181c; border-radius: 16px; padding: 16px; margin-bottom: 16px; }
.card h3 { margin: 0 0 8px; }
.card p, .card li { color: #e7e9ea; font-size: 14px; }
.card ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.hidden { display: none; }
@media (max-width: 1000px) { .app { grid-template-columns: 72px minmax(0,1fr); } .rail, .nav-item { font-size: 0; } .logo { font-size: 24px; } }`;
}

function xCloneJs() {
  return `(() => {
  const seed = [
    { id: 1, name: 'Forge', handle: '@forge', text: 'Ship the product, not a placeholder landing page.', likes: 128, liked: false, feed: 'foryou' },
    { id: 2, name: 'Design', handle: '@design', text: 'Three columns: nav, timeline, news. Dark theme. Real buttons.', likes: 86, liked: false, feed: 'foryou' },
    { id: 3, name: 'Following', handle: '@follows', text: 'This post shows on Following.', likes: 12, liked: false, feed: 'following' }
  ];
  const news = ['Markets move after hours', 'New creator tools roll out', 'Local events trending near you'];
  let posts = seed.slice();
  let feed = 'foryou';
  const feedEl = document.getElementById('feed');
  const textEl = document.getElementById('compose-text');
  const countEl = document.getElementById('count');
  const newsEl = document.getElementById('news');
  news.forEach((n) => { const li = document.createElement('li'); li.textContent = n; newsEl.appendChild(li); });
  const render = () => {
    const q = (document.getElementById('search').value || '').toLowerCase();
    feedEl.innerHTML = posts.filter((p) => (feed === 'following' ? p.feed === 'following' || p.mine : true) && (!q || (p.text + p.name).toLowerCase().includes(q))).map((p) => \`
      <article class="post" data-id="\${p.id}">
        <div class="avatar">\${p.name.slice(0,1)}</div>
        <div>
          <h4>\${p.name} <span>\${p.handle}</span></h4>
          <p>\${p.text}</p>
          <div class="actions">
            <button data-act="reply">Reply</button>
            <button data-act="repost">Repost</button>
            <button data-act="like" class="\${p.liked ? 'liked' : ''}">Like \${p.likes}</button>
          </div>
        </div>
      </article>\`).join('') || '<p style="padding:16px;color:#71767b">No posts</p>';
  };
  document.getElementById('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text) return;
    posts.unshift({ id: Date.now(), name: 'You', handle: '@you', text, likes: 0, liked: false, feed, mine: true });
    textEl.value = '';
    countEl.textContent = '0 / 280';
    render();
  });
  textEl.addEventListener('input', () => { countEl.textContent = textEl.value.length + ' / 280'; });
  feedEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const post = e.target.closest('.post');
    if (!btn || !post) return;
    const item = posts.find((p) => String(p.id) === post.dataset.id);
    if (!item) return;
    if (btn.dataset.act === 'like') { item.liked = !item.liked; item.likes += item.liked ? 1 : -1; }
    if (btn.dataset.act === 'repost') item.text = item.text;
    if (btn.dataset.act === 'reply') textEl.value = '@' + item.handle.replace('@','') + ' ';
    render();
  });
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    feed = tab.dataset.feed;
    render();
  }));
  document.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
    n.classList.add('active');
    document.querySelector('main').dataset.view = n.dataset.tab;
  }));
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('premium').addEventListener('click', () => alert('Premium is a demo toggle in this preview.'));
  document.getElementById('open-composer').addEventListener('click', () => textEl.focus());
  render();
})();`;
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
