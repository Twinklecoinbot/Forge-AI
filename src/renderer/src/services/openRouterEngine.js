const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_LOCAL_BASE = 'http://127.0.0.1:11434';

export const DEFAULT_MODELS = [
  { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (build)', tier: 'free', skill: 'coding' },
  { id: 'openrouter/free', label: 'OpenRouter Free Auto', tier: 'free', skill: 'auto' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', tier: 'free', skill: 'general' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron Nano', tier: 'free', skill: 'fast' },
  { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (reasoning only)', tier: 'free', skill: 'reasoning' }
];

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
  const models = unique(
    (hasImages
      ? [
          model,
          'google/gemini-2.0-flash-001:free',
          'google/gemini-2.0-flash-exp:free',
          'meta-llama/llama-3.2-11b-vision-instruct:free',
          'qwen/qwen3-coder:free'
        ]
      : [model, 'qwen/qwen3-coder:free', 'openrouter/free', 'meta-llama/llama-3.3-70b-instruct:free']
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
        if (/401|403|429|402|rate|quota|limit|unauthorized|user not found/.test(msg)) break;
        if (/model|not found|unavailable|no endpoints|404/.test(msg)) continue;
        throw error;
      }
    }
  }
  throw lastError || new Error('OpenRouter request failed.');
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
      if (list.length) return { ok: true, models: list, baseUrl: root };
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
      if (list.length) return { ok: true, models: list, baseUrl: root };
    } else {
      errors.push(`v1/models ${res.status}`);
    }
  } catch (e) {
    errors.push(e.message);
  }
  return {
    ok: false,
    models: [],
    baseUrl: root,
    error: `No local models at ${root}. Start Ollama (or another OpenAI-compatible server). ${errors[0] || ''}`
  };
}

async function requestLocalCompletion({ baseUrl, model, messages, stream, onToken, signal, maxTokens }) {
  const root = String(baseUrl || DEFAULT_LOCAL_BASE).replace(/\/$/, '');
  if (!model) throw new Error('Select a local model in Customize (Detect local models).');

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
  return /gemini|gpt-4o|claude|vision|llama-3\.2|qwen2\.5-vl|pixtral/i.test(model);
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
