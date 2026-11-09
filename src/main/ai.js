'use strict';
// Model access: Anthropic API (cloud, needs a key) or Ollama (fully local).
const { parseJSON } = require('./normalize');

async function postJSON(url, headers, body, label) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(`Could not reach ${label}. ${e.cause?.code === 'ECONNREFUSED' ? 'Is it running?' : 'Check your connection.'}`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text).error?.message || msg;
    } catch {
      /* keep raw */
    }
    if (res.status === 401 || (res.status === 400 && /api key/i.test(msg)) || (res.status === 403 && /key|permission|denied/i.test(msg)))
      msg = 'Invalid or unauthorised API key. Check it in Settings.';
    if (res.status === 429) msg = 'Rate limit or free quota reached. Wait a bit, or pick a lighter/faster model in Settings.';
    throw new Error(`${label} error ${res.status}: ${msg}`);
  }
  return JSON.parse(text);
}

async function complete(settings, { system, prompt, images = [] }) {
  if (settings.provider === 'ollama') {
    const base = settings.ollamaUrl.replace(/\/+$/, '');
    const data = await postJSON(
      `${base}/api/chat`,
      {},
      {
        model: settings.ollamaModel,
        stream: false,
        format: 'json',
        options: { num_ctx: 16384, temperature: 0.3 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      },
      'Ollama'
    );
    return data.message?.content || '';
  }

  if (settings.provider === 'gemini') {
    if (!settings.geminiApiKey) throw new Error('No Gemini API key yet. Add it in Settings (free key from aistudio.google.com).');
    const parts = [
      ...images.map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })),
      { text: prompt },
    ];
    const data = await postJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}:generateContent`,
      { 'x-goog-api-key': settings.geminiApiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000, temperature: 0.3 },
      },
      'Gemini API'
    );
    const cand = data.candidates?.[0];
    if (!cand) throw new Error(`Gemini returned no answer${data.promptFeedback?.blockReason ? ` (blocked: ${data.promptFeedback.blockReason})` : ''}.`);
    // "thought" parts are the model's reasoning summary, not the answer.
    return (cand.content?.parts || []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  }

  if (!settings.apiKey) throw new Error('No API key yet. Add your Anthropic API key in Settings (or switch to Ollama for local models).');
  const content = [
    ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })),
    { type: 'text', text: prompt },
  ];
  const data = await postJSON(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' },
    { model: settings.anthropicModel, max_tokens: 16000, system, messages: [{ role: 'user', content }] },
    'Anthropic API'
  );
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// Ask for JSON; if the reply can't be parsed, retry once before giving up.
async function completeJSON(settings, req, onProgress) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(settings, req);
    try {
      return parseJSON(text);
    } catch (e) {
      lastErr = e;
      onProgress?.('The AI reply was malformed, retrying…');
    }
  }
  throw new Error(`The AI returned an unreadable answer twice (${lastErr.message}). Try again or use a bigger model.`);
}

module.exports = { complete, completeJSON };
