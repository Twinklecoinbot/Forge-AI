const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DEFAULT_MODELS = [
  { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (build)', tier: 'free', skill: 'coding' },
  { id: 'openrouter/free', label: 'OpenRouter Free Auto', tier: 'free', skill: 'auto' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', tier: 'free', skill: 'general' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron Nano', tier: 'free', skill: 'fast' },
  { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (reasoning only)', tier: 'free', skill: 'reasoning' }
];

export async function completeChat({
  apiKey,
  apiKeys,
  model,
  messages,
  stream = true,
  onToken,
  signal,
  maxTokens = 8192
}) {
  const keys = unique([apiKey, ...(apiKeys || [])].filter(Boolean));
  if (!keys.length) throw new Error('Add your OpenRouter API key in Customize to run the engine.');
  // Prefer coder models; keep R1 out of automatic fallback (it dumps Thinking Process)
  const models = unique([model, 'qwen/qwen3-coder:free', 'openrouter/free', 'meta-llama/llama-3.3-70b-instruct:free'].filter(Boolean));
  let lastError = null;
  for (const key of keys) {
    for (const currentModel of models) {
      if (signal?.aborted) throw new DOMException('Generation stopped.', 'AbortError');
      try {
        return await requestCompletion({
          apiKey: key,
          model: currentModel,
          messages,
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
    const content = extractText(message.content);
    // Never prefer raw reasoning essays over empty content — caller will retry
    return content || '';
  }
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
