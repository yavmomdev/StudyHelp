'use strict';
// Known AI providers, key-prefix detection, and "list the models this key can use" (which also tests the key).
const { requestJSON } = require('./http');

// kind: how to talk to it. 'openai' = the common OpenAI-style /chat/completions API many services copy.
const KNOWN = [
  { id: 'anthropic', name: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: '', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', name: 'Google Gemini', kind: 'gemini', baseUrl: '', keyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'cerebras', name: 'Cerebras', kind: 'openai', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'xai', name: 'xAI (Grok)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai' },
  { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', keyUrl: 'https://api.together.ai/settings/api-keys' },
  { id: 'other', name: 'Other (OpenAI-compatible)', kind: 'openai', baseUrl: '', keyUrl: '' },
];

const byId = (id) => KNOWN.find((k) => k.id === id);

// Guess the provider from how the key starts. `guess:true` = ambiguous, the UI asks the user to confirm.
function detectFromKey(key) {
  const k = String(key || '').trim();
  const hit = (id, guess = false) => ({ ...byId(id), guess });
  if (/^sk-ant-/.test(k)) return hit('anthropic');
  if (/^AIza/.test(k)) return hit('gemini');
  if (/^gsk_/.test(k)) return hit('groq');
  if (/^sk-or-/.test(k)) return hit('openrouter');
  if (/^csk-/.test(k)) return hit('cerebras');
  if (/^xai-/.test(k)) return hit('xai');
  if (/^sk-proj-/.test(k)) return hit('openai');
  if (/^sk-/.test(k)) return hit('openai', true); // OpenAI, DeepSeek and others all use sk-
  return null;
}

const NOT_CHAT = /embed|whisper|tts|dall-e|moderation|rerank|transcribe|image|audio|realtime|speech|guard/i;

// Asks the provider which models this key can use. A rejected key throws an error with code BAD_KEY.
async function listModels({ kind, baseUrl, key }) {
  if (!key) throw Object.assign(new Error('Paste your API key first.'), { code: 'BAD_KEY' });
  let ids;
  if (kind === 'anthropic') {
    const d = await requestJSON('GET', 'https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, null, 'Anthropic');
    ids = (d.data || []).map((m) => m.id);
  } else if (kind === 'gemini') {
    const d = await requestJSON('GET', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key }, null, 'Gemini');
    ids = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''));
  } else {
    if (!/^https?:\/\//i.test(baseUrl || '')) throw new Error('Enter the provider address, e.g. https://api.example.com/v1');
    const d = await requestJSON('GET', `${baseUrl.replace(/\/+$/, '')}/models`, { authorization: `Bearer ${key}` }, null, 'the provider');
    ids = (d.data || d.models || []).map((m) => (typeof m === 'string' ? m : m.id)).filter(Boolean);
  }
  ids = [...new Set(ids)].filter((id) => !NOT_CHAT.test(id)).sort();
  if (!ids.length) throw new Error('The key works, but no chat models were found. Type the model name yourself.');
  return ids;
}

module.exports = { KNOWN, detectFromKey, listModels, byId };
