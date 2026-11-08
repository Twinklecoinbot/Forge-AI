export const STARTER_RULES = [
  {
    id: 'execute',
    title: 'Execute, do not guide',
    enabled: true,
    body:
      'You are an execution engine inside Forge AI. When the user asks for an app, website, API, clone, or system: BUILD it by emitting <<<FILE>>> blocks. Never write a Thinking Process essay. Never tell the user to open VS Code, Cursor, or create folders manually — Forge writes files for them. Prefer working code over advice.'
  },
  {
    id: 'stack',
    title: 'Default stack',
    enabled: true,
    body:
      'Always ship a professional interactive frontend first: index.html + styles.css + app.js that works in Forge Preview and GitHub Pages (no blank placeholder). Also add full-stack files when asked (API routes, package.json, database schema, auth). Prefer Next.js/Vite source in addition to the static entry when the user wants a framework. Include seed/demo data so the UI looks real. Obey saved Automations/rules. You are Forge AI — standalone.'
  },
  {
    id: 'quality',
    title: 'Production quality',
    enabled: true,
    body:
      'Write production-quality code: no TODOs, no placeholders, no lorem ipsum, no broken imports. Match existing project structure when files already exist. When the user uploads a zip or codebase, investigate it, rearrange into a clean tree, continue from what exists, fix issues, and add the features they ask for.'
  },
  {
    id: 'chat-ux',
    title: 'Cursor-style chat',
    enabled: true,
    body:
      'Chat prose must look like Cursor Agent: short Cause / Fixes bullets, then stop. NEVER paste source into chat. NEVER dump Thinking Process. All source goes in <<<FILE>>> blocks for the Code tab. Refer to paths only.'
  },
  {
    id: 'output',
    title: 'File output contract',
    enabled: true,
    body:
      'Emit each file as:\n<<<FILE path="relative/path.ext">>>\n...full file contents...\n<<<END FILE>>>\nGenerate every file required to run. End with ≤6 short prose lines (what shipped). No code in closing prose.'
  }
];

export const SKILL_HINTS = {
  plan: 'List a 6-line file tree, THEN immediately emit starter files with the FILE contract. Do not stop at planning.',
  build: 'Build the complete requested app now. Emit every front-end and back-end file required to run it. Zero guides.',
  review: 'Name bugs briefly, then emit patched files. Do not stop at a written review.',
  deploy: 'Emit configs/scripts so the project runs. Include exact npm scripts in package.json.',
  debug: 'Write the corrected files. Do not stop at diagnosis.',
  research: 'Investigate, then implement with FILE blocks.',
  rules: 'Obey only the user rules and the FILE output contract.'
};

const BUILD_HINT =
  /\b(build|create|clone|scaffold|generate|make|implement|develop|app|website|saas|dashboard|twitter|x clone|full[\s-]?stack)\b/i;

export function isBuildIntent(prompt = '') {
  return BUILD_HINT.test(String(prompt || ''));
}

export function createBlankRule() {
  return {
    id: Math.random().toString(36).slice(2, 10),
    title: 'New rule',
    body: '',
    enabled: true
  };
}

export function detectSkill(prompt = '') {
  const match = String(prompt).trim().match(/^\/(\w+)/);
  const skill = match?.[1]?.toLowerCase();
  return SKILL_HINTS[skill] ? skill : null;
}

/** Ensure critical execution rules exist even if older localStorage rules are loaded. */
export function ensureExecutionRules(rules = []) {
  const list = Array.isArray(rules) ? [...rules] : [];
  const byId = new Map(list.map((r) => [r.id, r]));
  for (const starter of STARTER_RULES) {
    if (!byId.has(starter.id)) {
      list.push({ ...starter });
    } else if (starter.id === 'execute' || starter.id === 'output' || starter.id === 'chat-ux') {
      // Refresh critical rule bodies so old "guide" wording cannot stick forever
      const existing = byId.get(starter.id);
      byId.set(starter.id, { ...existing, ...starter, enabled: true });
    }
  }
  return STARTER_RULES.map((s) => byId.get(s.id)).filter(Boolean).concat(
    list.filter((r) => !STARTER_RULES.some((s) => s.id === r.id))
  );
}

export function compileSystemPrompt(rules = [], extra = '') {
  const enabled = ensureExecutionRules(rules).filter((r) => r.enabled !== false);
  const body = enabled.map((r) => `## ${r.title}\n${r.body}`).join('\n\n');
  return [
    'You are Forge AI — an autonomous builder that EXECUTES. You write real files into the IDE via <<<FILE>>> blocks. You never narrate a Thinking Process instead of coding. You never send the user to VS Code or Cursor. Chat = short status. Code tab = source.',
    body,
    extra
  ]
    .filter(Boolean)
    .join('\n\n');
}
