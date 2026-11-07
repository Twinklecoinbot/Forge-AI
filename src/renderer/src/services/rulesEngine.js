export const STARTER_RULES = [
  {
    id: 'stack',
    title: 'Default stack',
    enabled: true,
    body:
      'Unless the user specifies otherwise, generate modern React + Vite + Tailwind CSS apps with clean components, accessible markup, and a professional visual system. Include package.json and README when scaffolding a project. You are Forge AI — a standalone self-hosted engine. Never require Cursor IDE, VS Code extensions, or Cursor permissions.'
  },
  {
    id: 'quality',
    title: 'Production quality',
    enabled: true,
    body:
      'Write production-quality code: no TODOs, no placeholders, no lorem ipsum, no broken imports. Keep functions focused. Match existing project structure when files already exist. When the user uploads a zip or existing codebase, investigate it, rearrange into a clean tree, continue from what exists, fix issues, and add features they ask for.'
  },
  {
    id: 'chat-ux',
    title: 'Chat progress UX',
    enabled: true,
    body:
      'In the visible chat prose (outside FILE blocks): write short stage updates only — what you are building, what you finished, and clear next steps. Do NOT paste full source into chat prose. Put all code exclusively inside <<<FILE>>> blocks so the IDE Code tab receives them.'
  },
  {
    id: 'output',
    title: 'File output contract',
    enabled: true,
    body:
      'When creating or updating files, emit each file as:\n<<<FILE path="relative/path.ext">>>\n...full file contents...\n<<<END FILE>>>\nDo not wrap the whole response in a single markdown fence. End with a brief Done + Next steps section in prose (no code).'
  }
];

export const SKILL_HINTS = {
  plan: 'Work in plan mode first: architecture, file tree, languages, and implementation order. Then generate only the starter files needed for slice 1.',
  build: 'Build the complete requested app now. Generate every file required to run it.',
  review: 'Review the attached workspace. Name bugs and gaps, then emit patched files using the output contract.',
  deploy: 'Make the current project hostable. Include configs needed for GitHub Pages or a static live preview, plus README deploy steps.',
  debug: 'Reproduce the likely failure from the files, then write the corrected files. Do not stop at diagnosis.',
  research: 'Investigate files, collect evidence, then implement the fix or feature.',
  rules: 'Obey only the user rules below and the output contract.'
};

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

export function compileSystemPrompt(rules = [], extra = '') {
  const enabled = (rules || []).filter((r) => r.enabled !== false);
  const body = enabled.map((r) => `## ${r.title}\n${r.body}`).join('\n\n');
  return [
    'You are Forge AI, an independent professional full-stack coding command center. You plan, investigate uploaded apps/zips, rearrange files, build, review, deploy, and iterate. You do not depend on Cursor or any other IDE.',
    body,
    extra
  ]
    .filter(Boolean)
    .join('\n\n');
}
