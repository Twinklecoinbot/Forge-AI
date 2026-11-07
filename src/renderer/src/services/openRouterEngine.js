const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DEFAULT_MODELS = [
  { id: 'openrouter/free', label: 'OpenRouter Free Auto', tier: 'free', skill: 'auto' },
  { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder', tier: 'free', skill: 'coding' },
  { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', tier: 'free', skill: 'reasoning' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', tier: 'free', skill: 'general' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron Nano', tier: 'free', skill: 'fast' }
];

const FALLBACK_MODELS = [
  'openrouter/free',
  'qwen/qwen3-coder:free',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free'
];

export async function completeChat({ apiKey, apiKeys, model, messages, stream = true, onToken, signal }) {
  const keys = unique([apiKey, ...(apiKeys || [])].filter(Boolean));
  if (!keys.length) throw new Error('Add your OpenRouter API key in Customize to run the engine.');
  const models = unique([model, ...FALLBACK_MODELS].filter(Boolean));
  let lastError = null;
  for (const key of keys) {
    for (const currentModel of models) {
      if (signal?.aborted) throw new DOMException('Generation stopped.', 'AbortError');
      try {
        return await requestCompletion({ apiKey: key, model: currentModel, messages, stream, onToken, signal });
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

async function requestCompletion({ apiKey, model, messages, stream, onToken, signal }) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://forge-ai.local',
      'X-Title': 'Forge AI'
    },
    body: JSON.stringify({ model, messages, stream, temperature: 0.2, max_tokens: 8192 }),
    signal
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(parseOpenRouterError(response.status, errText));
  }
  if (!stream) {
    const data = await response.json();
    const message = data?.choices?.[0]?.message || {};
    return extractText(message.content) || extractText(message.reasoning);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let reasoning = '';
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
        const think = extractText(delta.reasoning);
        if (think) reasoning += think;
        if (token) {
          full += token;
          onToken?.(token, full);
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (!full.trim() && reasoning.trim()) {
    onToken?.(reasoning, reasoning);
    return reasoning;
  }
  return full;
}

function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((part) => extractText(part?.text || part?.content || part)).join('');
  if (typeof value === 'object') return extractText(value.text || value.content || '');
  return String(value);
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
