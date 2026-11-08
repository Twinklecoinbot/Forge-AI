import { detectSkill, isBuildIntent } from './rulesEngine.js';

/**
 * Resolve guide vs execute so Forge does not mix modes.
 * - Guidance / explain / how-to (without build words) → guide
 * - Build / develop / create / fix / deploy → execute
 * - Default for Forge → execute
 */
export function resolveIntentMode(prompt = '') {
  const text = String(prompt || '').trim();
  const skill = detectSkill(text);

  if (skill === 'build' || skill === 'deploy' || skill === 'debug' || skill === 'fix' || skill === 'review') {
    return { mode: 'execute', skill: skill === 'fix' ? 'debug' : skill || 'build' };
  }
  if (skill === 'plan') {
    // /plan still ships starter files (execute-lite), not a long essay
    return { mode: 'execute', skill: 'plan' };
  }
  if (skill === 'rules' || skill === 'research') {
    return { mode: isBuildIntent(text) ? 'execute' : 'guide', skill };
  }

  // Natural-language bug reports → self-heal / debug execute
  if (
    /\b(fix|bug|broken|error|crash|not working|doesn'?t work|self[\s-]?heal|repair|patch)\b/i.test(text) &&
    !isGuideIntent(text)
  ) {
    return { mode: 'execute', skill: 'debug' };
  }

  if (isGuideIntent(text) && !isBuildIntent(text)) {
    return { mode: 'guide', skill: null };
  }
  if (isBuildIntent(text)) {
    return { mode: 'execute', skill: 'build' };
  }
  // Short pure questions → guide
  if (/^(why|what|how|when|where|who|can you explain|explain)\b/i.test(text) && text.length < 220) {
    return { mode: 'guide', skill: null };
  }
  return { mode: 'execute', skill: 'build' };
}

export function isGuideIntent(prompt = '') {
  const t = String(prompt || '');
  return (
    /(?:^|\s)\/(help|guide|explain|ask)\b/i.test(t) ||
    /\b(guidance|guide me|explain|how (do|does|to|can) i|what does|tell me how|walk me through)\b/i.test(t)
  );
}

export function statusLineForStage(stages = [], files = []) {
  const active = stages.find((s) => s.status === 'active');
  const done = stages.filter((s) => s.status === 'done');
  if (active?.id === 'analyze') return 'Thinking…';
  if (active?.id === 'build') {
    return files.length ? `Building… ${files.length} file${files.length === 1 ? '' : 's'}` : 'Building…';
  }
  if (active?.id === 'arrange') return 'Arranging project files…';
  if (active?.id === 'preview') return 'Opening local preview…';
  if (active?.id === 'deploy') return 'Deploying to GitHub…';
  if (done.length && !active) {
    const last = done[done.length - 1];
    return last?.label || 'Done';
  }
  return 'Working…';
}
