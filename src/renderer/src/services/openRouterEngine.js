const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_LOCAL_BASE = 'http://127.0.0.1:11434';

/** Free router first. A single free model such as North Mini Code often returns "Provider returned error". */
export const FREE_ROUTER_MODEL = 'openrouter/free';
export const CODING_FREE_MODEL = FREE_ROUTER_MODEL;
export const VISION_FREE_MODEL = 'google/gemma-4-31b-it:free';

const RETIRED_FREE_MODEL = /qwen3-coder:free|gemini-2\.0-flash|llama-3\.2-11b-vision|llama-3\.3-70b-instruct:free|deepseek-r1:free|nemotron-3-nano-30b/i;

export const DEFAULT_MODELS = [
  { id: FREE_ROUTER_MODEL, label: 'OpenRouter Free Auto', tier: 'free', skill: 'auto' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', tier: 'free', skill: 'fast' },
  { id: VISION_FREE_MODEL, label: 'Gemma 4 31B (vision)', tier: 'free', skill: 'vision' },
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (vision)', tier: 'free', skill: 'vision' },
  { id: 'cohere/north-mini-code:free', label: 'North Mini Code (often unavailable)', tier: 'free', skill: 'coding' }
];

export function resolveWorkingModel(model, { hasImages = false, provider = 'openrouter' } = {}) {
  if (provider === 'local') return model || '';
  if (!model || RETIRED_FREE_MODEL.test(model) || /north-mini-code/i.test(model)) {
    return hasImages ? VISION_FREE_MODEL : FREE_ROUTER_MODEL;
  }
  return model;
}

export function explainModelError(message = '') {
  const text = String(message || 'Request failed');
  if (/provider returned error/i.test(text)) {
    return 'The free provider behind that model is down (Provider returned error). Forge tries the next free model instead of stopping on the first one. Stay on OpenRouter online. This PC does not have enough RAM or disk to run an 8B or 27B model locally.';
  }
  if (/not available for free|no endpoints|is not a valid model/i.test(text)) {
    return 'OpenRouter refused that model on the free tier. Forge tries another free model that is still listed. Local Ollama is a separate path and is only used when a model is installed and the PC has enough free RAM and disk.';
  }
  return text;
}

/** Rough RAM a local model needs once loaded. File size alone is not enough. */
export function localModelRamNeedGB(model = '') {
  const n = String(model).toLowerCase();
  const match = n.match(/(\d+(?:\.\d+)?)\s*b\b/);
  const size = match ? Number(match[1]) : 0;
  if (/70b|72b/.test(n) || size >= 65) return 40;
  if (/27b|32b|34b/.test(n) || (size >= 20 && size < 65)) return 18;
  if (/14b/.test(n) || (size >= 12 && size < 20)) return 10;
  if (/8b|7b|9b|q4_k_m|dolphin/.test(n) || (size >= 6 && size < 12)) return 6.5;
  if (size > 0 && size <= 4) return 3;
  return 6;
}

export async function readMachineCapacity() {
  try {
    if (typeof window !== 'undefined' && window.forgeAPI?.machineCapacity) {
      return await window.forgeAPI.machineCapacity();
    }
  } catch {
    /* browser preview has no capacity probe */
  }
  return null;
}

async function fitLocalModels(list, root) {
  const kept = [];
  const refused = [];
  for (const model of list) {
    const why = await refuseLocalModel(model.id);
    if (why) refused.push(why);
    else kept.push(model);
  }
  if (kept.length) return { ok: true, models: kept, baseUrl: root, refused };
  return {
    ok: false,
    models: [],
    baseUrl: root,
    error: refused[0] || 'No installed local model fits this PC. Forge did not start one.'
  };
}

export async function refuseLocalModel(model) {
  const capacity = await readMachineCapacity();
  const need = localModelRamNeedGB(model);
  if (!capacity) {
    return `Forge will not start ${model || 'a local model'} until it can read this PC's free RAM and disk.`;
  }
  if (capacity.totalRamGB < need) {
    return `This PC has ${capacity.totalRamGB} GB of RAM. ${model} needs about ${need} GB once loaded, so Forge will not run it.`;
  }
  if (capacity.freeRamGB != null && capacity.freeRamGB < 1.5) {
    return `Only ${capacity.freeRamGB} GB of RAM is free. Forge will not start ${model} while the PC is this full.`;
  }
  if (capacity.freeDiskGB != null && capacity.freeDiskGB < 2) {
    return `Only ${capacity.freeDiskGB} GB of disk is free. Forge will not start ${model}.`;
  }
  return null;
}

/**
 * Unified chat completion: OpenRouter (online) or local OpenAI-compatible / Ollama server.
 * Default remains OpenRouter so existing setups keep working.
 */
export async function completeChat({
  apiKey,
  apiKeys,
  model,
  messages,
  stream = true,
  onToken,
  signal,
  maxTokens = 8192,
  provider = 'openrouter',
  localBaseUrl = DEFAULT_LOCAL_BASE
}) {
  if (provider === 'local') {
    return requestLocalCompletion({
      baseUrl: localBaseUrl || DEFAULT_LOCAL_BASE,
      model,
      messages,
      stream,
      onToken,
      signal,
      maxTokens
    });
  }

  const keys = unique([apiKey, ...(apiKeys || [])].filter(Boolean));
  if (!keys.length) throw new Error('Add your OpenRouter API key in Customize to run the engine.');
  const hasImages = messagesHaveImages(messages);
  const requested = resolveWorkingModel(model, { hasImages, provider: 'openrouter' });
  const models = unique(
    (hasImages
      ? [
          requested,
          VISION_FREE_MODEL,
          'google/gemma-4-26b-a4b-it:free',
          'nvidia/nemotron-3.5-super-vl:free',
          FREE_ROUTER_MODEL
        ]
      : [
          requested,
          FREE_ROUTER_MODEL,
          'nvidia/nemotron-3.5-lightning:free',
          VISION_FREE_MODEL,
          'cohere/north-mini-code:free'
        ]
    ).filter(Boolean)
  );
  let lastError = null;
  for (const key of keys) {
    for (const currentModel of models) {
      if (signal?.aborted) throw new DOMException('Generation stopped.', 'AbortError');
      try {
        return await requestCompletion({
          apiKey: key,
          model: currentModel,
          messages: messagesForModel(messages, currentModel),
          stream,
          onToken,
          signal,
          maxTokens
        });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        lastError = error;
        const msg = String(error.message || '').toLowerCase();
        if (/401|403|429|402|rate|quota|limit|unauthorized|user not found/.test(msg) && !/not available for free|no endpoints|not a valid model/.test(msg)) {
          break;
        }
        if (/model|not found|unavailable|no endpoints|404|not available|provider returned error/.test(msg)) continue;
        throw error;
      }
    }
  }
  throw new Error(explainModelError(lastError?.message || 'OpenRouter request failed.'));
}

/** Detect models on a local Ollama / OpenAI-compatible server. */
export async function detectLocalModels(baseUrl = DEFAULT_LOCAL_BASE) {
  const root = String(baseUrl || DEFAULT_LOCAL_BASE).replace(/\/$/, '');
  const errors = [];
  // Ollama native tags
  try {
    const res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const list = (data.models || []).map((m) => ({
        id: m.name || m.model,
        label: `${m.name || m.model} (local)`,
        tier: 'local',
        skill: 'local'
      }));
      if (list.length) return fitLocalModels(list, root);
    } else {
      errors.push(`tags ${res.status}`);
    }
  } catch (e) {
    errors.push(e.message);
  }
  // OpenAI-compatible /v1/models
  try {
    const res = await fetch(`${root}/v1/models`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const list = (data.data || []).map((m) => ({
        id: m.id,
        label: `${m.id} (local)`,
        tier: 'local',
        skill: 'local'
      }));
      if (list.length) return fitLocalModels(list, root);
    } else {
      errors.push(`v1/models ${res.status}`);
    }
  } catch (e) {
    errors.push(e.message);
  }
  const capacity = await readMachineCapacity();
  const ramNote = capacity
    ? ` This PC has ${capacity.totalRamGB} GB RAM (${capacity.freeRamGB} GB free) and ${capacity.freeDiskGB ?? '?'} GB disk free.`
    : '';
  return {
    ok: false,
    models: [],
    baseUrl: root,
    error: `Ollama is not running at ${root}, so no local model can be selected. ${errors[0] || ''}${ramNote} An 8B model needs about 6.5 GB RAM and a 27B model needs about 18 GB. Forge will not start either on a machine that cannot fit it.`
  };
}

async function requestLocalCompletion({ baseUrl, model, messages, stream, onToken, signal, maxTokens }) {
  const root = String(baseUrl || DEFAULT_LOCAL_BASE).replace(/\/$/, '');
  if (!model) throw new Error('Select a local model in Customize (Detect local models).');
  if (/:free$/.test(model) || /^(openrouter|qwen|google|meta-llama|deepseek|nvidia|cohere)\//.test(model)) {
    throw new Error(
      'That name is an OpenRouter model, not one installed in Ollama. Detect local models first. Forge will not load a local model this PC cannot fit in RAM.'
    );
  }
  const refusal = await refuseLocalModel(model);
  if (refusal) throw new Error(refusal);

  // Prefer OpenAI-compatible endpoint (Ollama exposes this too)
  const url = `${root}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: normalizeMessages(messages),
      stream: Boolean(stream),
      temperature: 0.15,
      max_tokens: maxTokens || 8192
    }),
    signal
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Local model ${response.status}: ${errText.slice(0, 280)}`);
  }
  if (!stream) {
    const data = await response.json();
    return extractText(data?.choices?.[0]?.message?.content) || '';
  }
  return readSseStream(response, onToken);
}

async function requestCompletion({ apiKey, model, messages, stream, onToken, signal, maxTokens }) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://forge-ai.local',
      'X-Title': 'Forge AI'
    },
    body: JSON.stringify({ model, messages, stream, temperature: 0.15, max_tokens: maxTokens || 8192 }),
    signal
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(parseOpenRouterError(response.status, errText));
  }
  if (!stream) {
    const data = await response.json();
    const message = data?.choices?.[0]?.message || {};
    return extractText(message.content) || '';
  }
  return readSseStream(response, onToken);
}

async function readSseStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta || {};
        const token = extractText(delta.content);
        if (token) {
          full += token;
          onToken?.(token, full);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return full;
}

function normalizeMessages(messages = []) {
  return messages.map((m) => {
    if (typeof m.content === 'string') return m;
    if (Array.isArray(m.content)) {
      const text = m.content
        .map((p) => (typeof p === 'string' ? p : p?.text || ''))
        .filter(Boolean)
        .join('\n');
      return { role: m.role, content: text };
    }
    return { role: m.role, content: String(m.content || '') };
  });
}

function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((part) => extractText(part?.text || part?.content || part)).join('');
  if (typeof value === 'object') return extractText(value.text || value.content || '');
  return String(value);
}

function modelAcceptsImages(model = '') {
  return /gemini|gpt-4o|claude|vision|llama-3\.2|qwen2\.5-vl|pixtral|gemma|nemotron|openrouter\/free/i.test(model);
}

/** Keep image parts for vision models. Text-only fallbacks get the prompt without a payload they reject. */
function messagesForModel(messages = [], model = '') {
  if (modelAcceptsImages(model) || !messagesHaveImages(messages)) return messages;
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const text = m.content
      .map((part) => (typeof part === 'string' ? part : part?.type === 'text' ? part.text || '' : ''))
      .filter(Boolean)
      .join('\n');
    return { role: m.role, content: text };
  });
}

function messagesHaveImages(messages = []) {
  return messages.some((m) => {
    if (!Array.isArray(m?.content)) return false;
    return m.content.some((part) => part?.type === 'image_url' || part?.type === 'image');
  });
}

function unique(list) {
  return [...new Set(list)];
}

function parseOpenRouterError(status, body) {
  try {
    const json = JSON.parse(body);
    return json?.error?.message || json?.message || body;
  } catch {
    return `OpenRouter ${status}: ${body.slice(0, 280)}`;
  }
}
