import { completeChat } from './openRouterEngine.js';
import { bridge } from './bridge.js';
import { createBlankRule } from './rulesEngine.js';

const RULES_KEY = 'forge_rules';
const RULES_LEGACY = 'forge.rules';

/**
 * Read accepted training pairs and ask OpenRouter to refine a coding-style rule.
 * Merges into existing rules — never deletes user rules.
 * Persists to localStorage + Electron userData (via bridge.saveSettings).
 */
export async function refineSystemRules({ apiKey, apiKeys, systemRules, currentRules }) {
  const dataset = await bridge.readTrainingDataset({ action: 'accepted', limit: 40 });
  const accepted = dataset.records || [];
  if (!accepted.length) {
    return {
      ok: false,
      skipped: true,
      reason: 'No accepted training pairs yet',
      rules: currentRules || [],
      prompt: systemRules || ''
    };
  }

  const samples = accepted
    .slice(-12)
    .map((row, i) => {
      const user = row.messages?.find((m) => m.role === 'user')?.content || '';
      const assistant = row.messages?.find((m) => m.role === 'assistant')?.content || '';
      return `SAMPLE ${i + 1}\nUSER:\n${clip(user, 900)}\nASSISTANT:\n${clip(assistant, 1400)}`;
    })
    .join('\n\n---\n\n');

  const current =
    systemRules ||
    (Array.isArray(currentRules)
      ? currentRules
          .filter((r) => r.enabled !== false)
          .map((r) => `- ${r.title}: ${r.body}`)
          .join('\n')
      : '');

  const refinePrompt = `You are refining Forge AI system rules so the assistant matches this developer's coding style.

Current rules:
${current || '(none)'}

Accepted interactions (user liked / kept this output):
${samples}

Return ONLY 5 concise bullet points that capture:
1) preferred languages/stacks and file layout
2) naming / structure / design patterns they favor
3) UI/UX and styling preferences
4) how they want prompts answered (always prefer building files over guiding)
5) common edits they make vs what to avoid

Format exactly:
- bullet one
- bullet two
- bullet three
- bullet four
- bullet five`;

  const text = await completeChat({
    apiKey,
    apiKeys,
    model: 'openrouter/free',
    messages: [
      {
        role: 'system',
        content: 'Extract durable coding preferences. Output exactly 5 markdown bullets. No preamble.'
      },
      { role: 'user', content: refinePrompt }
    ],
    stream: false
  });

  const bullets = parseBullets(text);
  if (bullets.length < 3) {
    return { ok: false, reason: 'Could not parse refined rules', raw: text, rules: currentRules || [] };
  }

  const refinedRule = {
    ...createBlankRule(),
    id: 'learned-style',
    title: 'Learned coding style',
    body: bullets.map((b) => `- ${b}`).join('\n'),
    enabled: true,
    learned: true,
    updatedAt: Date.now()
  };

  const nextRules = mergeLearnedRule(currentRules || [], refinedRule);
  persistRules(nextRules);
  await persistRulesDurable(nextRules);

  return {
    ok: true,
    prompt: refinedRule.body,
    rules: nextRules,
    bullets,
    samplesUsed: accepted.length
  };
}

export function loadPersistedRules(fallback = []) {
  try {
    const raw = localStorage.getItem(RULES_KEY) || localStorage.getItem(RULES_LEGACY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Prefer localStorage (fast), then durable Electron settings, then starter. */
export function resolveRules(loaded, fallback = []) {
  const local = loadPersistedRules(null);
  if (local) return local;
  if (Array.isArray(loaded?.rules) && loaded.rules.length) return loaded.rules;
  return fallback;
}

export function persistRules(rules) {
  const json = JSON.stringify(rules || []);
  localStorage.setItem(RULES_KEY, json);
  localStorage.setItem(RULES_LEGACY, json);
}

/** Durable copy in Electron userData / web settings — survives secret logout. */
export async function persistRulesDurable(rules) {
  persistRules(rules);
  try {
    await bridge.saveSettings({ rules: rules || [], rulesUpdatedAt: Date.now() });
  } catch {
    /* localStorage already written */
  }
}

export function rulesFromSettings(loaded, fallback = []) {
  return resolveRules(loaded, fallback);
}

function mergeLearnedRule(rules, learned) {
  // Only replace the learned-style slot — never drop user rules
  const without = (rules || []).filter((r) => r.id !== 'learned-style');
  return [learned, ...without];
}

function parseBullets(text = '') {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((line) => line && !/^here are|^output|^refined/i.test(line))
    .slice(0, 5);
}

function clip(text, n) {
  const s = String(text || '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
