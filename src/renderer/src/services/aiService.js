import { completeChat } from './openRouterEngine.js';
import { compileSystemPrompt, detectSkill, SKILL_HINTS, isBuildIntent } from './rulesEngine.js';
import { extractFiles, extractCommands } from './fileParser.js';
import { looksLikeGuideDump } from './chatPresentation.js';

const HARD_CONTRACT = `OUTPUT CONTRACT (non-negotiable):
1. Your job is to WRITE FILES into Forge's Code tab — not to plan, tutorialize, or tell the user to open VS Code/Cursor.
2. Emit every source file as:
<<<FILE path="relative/path.ext">>>
...complete file contents...
<<<END FILE>>>
3. Forbidden in the response body (except inside FILE blocks): "Thinking Process", long architecture essays, step-by-step guides, "open VS Code", "create a folder", pseudo-code outlines without FILE blocks.
4. After FILE blocks, add at most 6 short lines: Cause/summary + what you built. No source in that prose.
5. ALWAYS ship a working interactive frontend that Forge Preview + GitHub Pages can open immediately:
   - Required: index.html + styles.css + app.js (complete professional product UI — not a generic "Built with Forge AI" landing).
   - Match the user's request EXACTLY (clone X/Twitter, dashboard, SaaS, etc.). If they uploaded screenshots/images, treat them as the visual source of truth and recreate layout, colors, density, and components.
   - Also emit backend/API files when full-stack is requested (routes, package.json, schema, auth).
6. Obey every enabled user Automations/rules. Remember the user's brief across the whole build — do not invent a different product.
7. Links/buttons in the UI must work inside an iframe (use # anchors / JS handlers; never navigate top window away).`;

const RETRY_USER = `FAILURE: your previous reply had ZERO <<<FILE path="...">>> blocks, only a guide, OR the UI does not match the user's request/reference images.
That is unacceptable in Forge AI.

Re-emit the FULL working project NOW using only FILE blocks.
MUST include: index.html + styles.css + app.js that visually and functionally match the user's prompt and any attached reference images (e.g. X/Twitter clone = timeline, sidebar, compose, likes — NOT a generic Forge landing page).
Also include backend files if they asked full-stack.
No Thinking Process. No VS Code instructions. No essays.`;

export async function runForgePrompt({
  apiKey,
  apiKeys,
  model,
  rules,
  history,
  prompt,
  contextFiles,
  attachments,
  onToken,
  signal,
  provider,
  localBaseUrl
}) {
  const skill = detectSkill(prompt) || (isBuildIntent(prompt) ? 'build' : null);
  const imageAttachments = (attachments || []).filter((a) => a.kind === 'image' && a.dataUrl);
  const codingModel = preferCodingModel(model, skill, { hasImages: imageAttachments.length > 0 });
  const fidelity = buildFidelityBrief(prompt, attachments);
  const extra = [
    HARD_CONTRACT,
    fidelity,
    skill ? `SKILL MODE: ${skill}\n${SKILL_HINTS[skill]}` : SKILL_HINTS.build
  ].join('\n\n');

  const contextBlock = (contextFiles || [])
    .filter((file) => file && typeof file.content === 'string' && !String(file.content).startsWith('data:'))
    .map((file) => `FILE ${file.path}\n${file.content}`)
    .join('\n\n---\n\n');
  const textAttachments = (attachments || []).filter((a) => a.kind === 'text' || a.kind === 'binary');
  const attachBlock = textAttachments
    .map((file) => `ATTACHED FILE ${file.path || file.name}\n${file.content || ''}`)
    .join('\n\n---\n\n');

  // Never feed prior Thinking Process dumps back into the model — keep user briefs verbatim
  const historyMessages = (history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-14)
    .map((m) => {
      if (m.role === 'user') return { role: 'user', content: clip(m.content, 6000) };
      const files = extractFiles(m.content || '');
      if (files.length) {
        return {
          role: 'assistant',
          content: `Built ${files.length} files:\n${files
            .slice(0, 20)
            .map((f) => `- ${f.path}`)
            .join('\n')}`
        };
      }
      return { role: 'assistant', content: clip(stripHistoryNoise(m.content), 800) };
    });

  const textParts = [
    'USER BRIEF (execute this exactly):\n',
    prompt || '(see attached files / reference images)',
    imageAttachments.length
      ? `\n\nREFERENCE IMAGES ATTACHED (${imageAttachments.length}): recreate this UI pixel-faithfully in index.html/styles.css/app.js.`
      : '',
    '\n\nRespond with <<<FILE>>> blocks only. Do not guide — build the product they asked for.',
    attachBlock ? `\n\nUSER ATTACHMENTS:\n${attachBlock}` : '',
    contextBlock ? `\n\nATTACHED WORKSPACE CONTEXT:\n${contextBlock}` : ''
  ].join('');

  let userContent = textParts;
  if (imageAttachments.length) {
    userContent = [
      { type: 'text', text: textParts },
      ...imageAttachments.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
    ];
  }

  const baseMessages = [
    { role: 'system', content: compileSystemPrompt(rules, extra) },
    ...historyMessages,
    { role: 'user', content: userContent }
  ];

  const providerOpts = { provider: provider || 'openrouter', localBaseUrl };

  let text = await completeChat({
    apiKey,
    apiKeys,
    model: codingModel,
    messages: baseMessages,
    stream: true,
    onToken,
    signal,
    maxTokens: 12288,
    ...providerOpts
  });

  let files = extractFiles(text);
  let retried = false;

  if (!files.length || looksLikeGuideDump(text) || !hasPreviewableUi(files)) {
    retried = true;
    onToken?.('\n', `${text}\n`);
    text = await completeChat({
      apiKey,
      apiKeys,
      model: provider === 'local' ? codingModel : 'qwen/qwen3-coder:free',
      messages: [
        ...baseMessages,
        { role: 'assistant', content: clip(text, 1500) },
        { role: 'user', content: RETRY_USER }
      ],
      stream: true,
      onToken: (token, full) => onToken?.(token, full),
      signal,
      maxTokens: 12288,
      ...providerOpts
    });
    files = extractFiles(text);
  }

  // Last-chance parse: fenced path: files often appear without <<<FILE>>>
  if (!files.length) {
    files = extractFiles(coerceFenceFiles(text));
    if (files.length) text = coerceFenceFiles(text);
  }

  return {
    text,
    files,
    commands: extractCommands(text),
    skill,
    retried,
    failedDelivery: !files.length
  };
}

function preferCodingModel(model, skill, { hasImages } = {}) {
  // Vision-capable free models when user attaches reference screenshots
  if (hasImages) {
    if (model && /gemini|gpt-4o|claude|vision|llama-3\.2|qwen2\.5-vl|pixtral/i.test(model)) return model;
    return 'google/gemini-2.0-flash-exp:free';
  }
  if (skill === 'build' || skill === 'debug' || skill === 'review' || skill === 'deploy') {
    if (!model || /deepseek-r1|reasoning|r1/i.test(model) || model === 'openrouter/free') {
      return 'qwen/qwen3-coder:free';
    }
  }
  if (/deepseek-r1/i.test(model || '')) return 'qwen/qwen3-coder:free';
  return model || 'qwen/qwen3-coder:free';
}

function buildFidelityBrief(prompt = '', attachments = []) {
  const images = (attachments || []).filter((a) => a.kind === 'image');
  const lines = [
    'PRODUCT FIDELITY:',
    `- Deliver the product described in the user brief — not a generic template.`,
    images.length
      ? `- ${images.length} reference image(s) attached (${images.map((i) => i.name || 'image').join(', ')}). Match layout, chrome, typography, and density.`
      : '- No reference images — still match the written request precisely.',
    /\b(x|twitter)\b/i.test(prompt)
      ? '- X/Twitter clone checklist: left nav, main timeline, right sidebar trends, tweet cards, compose, like/repost/reply affordances, dark theme.'
      : null
  ].filter(Boolean);
  return lines.join('\n');
}

function coerceFenceFiles(text = '') {
  // Turn ```tsx path/to/file blocks into FILE markers when model used fences only
  return String(text).replace(/```([^\n]+)\n([\s\S]*?)```/g, (all, meta, body) => {
    const path = meta.trim().replace(/^(tsx?|jsx?|json|css|html|md|prisma|env)\s+/i, '').trim();
    if (!path || !/[./]/.test(path) || /\s/.test(path)) return all;
    return `<<<FILE path="${path}">>>\n${body}<<<END FILE>>>`;
  });
}

function stripHistoryNoise(text = '') {
  return String(text || '')
    .replace(/Thinking Process:[\s\S]*?(?=\n\n[A-Z]|$)/i, '')
    .replace(/<<<FILE[\s\S]*?<<<END FILE>>>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
}

function clip(text, n) {
  const s = String(text || '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Guidance-only path — answers clearly, does NOT emit FILE blocks or build. */
function hasPreviewableUi(files = []) {
  const html = files.find((f) => /(^|\/)index\.html$/i.test(f.path) || /\.html$/i.test(f.path));
  if (!html) return false;
  const c = String(html.content || '');
  if (/Project files are arranged|files are in the Code tab|Deployed with Forge AI/i.test(c)) return false;
  // Generic Forge landing alone is not a successful product build
  if (/Built with Forge AI/i.test(c) && c.length < 3500 && !/(timeline|tweet|sidebar|dashboard|checkout)/i.test(c)) {
    return false;
  }
  return c.length > 600 && /<(main|section|nav|header|button|form)/i.test(c);
}

export async function runGuidePrompt({
  apiKey,
  apiKeys,
  model,
  rules,
  history,
  prompt,
  contextFiles,
  signal,
  onToken,
  provider,
  localBaseUrl
}) {
  const contextBlock = (contextFiles || [])
    .filter((file) => file && typeof file.content === 'string' && !String(file.content).startsWith('data:'))
    .slice(0, 8)
    .map((file) => `FILE ${file.path}\n${String(file.content).slice(0, 2000)}`)
    .join('\n\n---\n\n');

  const historyMessages = (history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-8)
    .map((m) => ({ role: m.role, content: clip(m.content, 2000) }));

  const system = [
    'You are Forge AI in GUIDANCE mode.',
    'The user asked for explanation or advice — answer clearly in prose.',
    'Do NOT emit <<<FILE>>> blocks. Do NOT build an app. Do NOT tell them to open VS Code.',
    'If they later ask to build, they will switch to execute mode automatically.',
    compileSystemPrompt(rules, 'MODE: guidance only')
  ].join('\n\n');

  const text = await completeChat({
    apiKey,
    apiKeys,
    model: model || 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [
      { role: 'system', content: system },
      ...historyMessages,
      {
        role: 'user',
        content: [prompt, contextBlock ? `\n\nWorkspace context:\n${contextBlock}` : ''].join('')
      }
    ],
    stream: true,
    onToken,
    signal,
    maxTokens: 4096,
    provider: provider || 'openrouter',
    localBaseUrl
  });
  return { text, files: [], mode: 'guide' };
}
