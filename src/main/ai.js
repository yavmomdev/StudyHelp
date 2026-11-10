'use strict';
// Model access. provider = { id, name, kind: 'anthropic'|'gemini'|'openai'|'ollama', key, model, baseUrl }
const { parseJSON } = require('./normalize');
const { requestJSON } = require('./http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Anthropic ----------
async function anthropic(p, { system, prompt, images }) {
  const content = [
    ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })),
    { type: 'text', text: prompt },
  ];
  const data = await requestJSON('POST', 'https://api.anthropic.com/v1/messages',
    { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
    { model: p.model, max_tokens: 16000, system, messages: [{ role: 'user', content }] }, 'Anthropic');
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// ---------- Gemini (with retry + lighter-model fallback when overloaded) ----------
// Cheaper models to fall back to when the chosen Gemini model is overloaded.
const GEMINI_FALLBACKS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];

async function geminiOnce(p, model, { system, prompt, images }) {
  const parts = [
    ...images.map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })),
    { text: prompt },
  ];
  const data = await requestJSON('POST',
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': p.key },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000, temperature: 0.3 },
    }, 'Gemini');
  const cand = data.candidates?.[0];
  if (!cand) throw new Error(`Gemini returned no answer${data.promptFeedback?.blockReason ? ` (blocked: ${data.promptFeedback.blockReason})` : ''}.`);
  // "thought" parts are the model's reasoning summary, not the answer.
  return (cand.content?.parts || []).filter((x) => !x.thought && typeof x.text === 'string').map((x) => x.text).join('');
}

// 500/503 ("high demand") are temporary: retry with a pause, then try lighter models.
async function gemini(p, req, onProgress) {
  const delays = p.retryDelays || [2000, 5000, 10000];
  const models = [p.model, ...GEMINI_FALLBACKS.filter((m) => m !== p.model)];
  let lastErr;
  for (const [mi, model] of models.entries()) {
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await geminiOnce(p, model, req);
      } catch (e) {
        lastErr = e;
        if (![500, 502, 503, 504].includes(e.status)) throw e; // real errors (bad key, quota...) are not retried
        if (attempt < delays.length) {
          onProgress?.(`${model} is busy, retrying (${attempt + 1}/${delays.length})...`);
          await sleep(delays[attempt]);
        }
      }
    }
    if (mi < models.length - 1) onProgress?.(`${model} is overloaded, switching to ${models[mi + 1]}...`);
  }
  throw new Error(`Gemini is overloaded right now (${lastErr.message}). Try again in a few minutes.`);
}

// ---------- OpenAI-style (OpenAI, Groq, OpenRouter, Mistral, ...) ----------
async function openai(p, { system, prompt, images }) {
  const label = p.name || 'the provider';
  const url = `${p.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const content = images.length
    ? [...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.data}` } })), { type: 'text', text: prompt }]
    : prompt;
  const body = {
    model: p.model,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
  };
  let data;
  try {
    data = await requestJSON('POST', url, { authorization: `Bearer ${p.key}` }, body, label);
  } catch (e) {
    // Some providers do not support JSON mode: ask again without it (the prompt already demands JSON).
    if (e.status !== 400 || !/response_format|json_object|json mode/i.test(e.message)) throw e;
    delete body.response_format;
    data = await requestJSON('POST', url, { authorization: `Bearer ${p.key}` }, body, label);
  }
  return data.choices?.[0]?.message?.content || '';
}

// ---------- Ollama (local) ----------
async function ollama(p, { system, prompt }) {
  const data = await requestJSON('POST', `${p.baseUrl.replace(/\/+$/, '')}/api/chat`, {}, {
    model: p.model, stream: false, format: 'json', options: { num_ctx: 16384, temperature: 0.3 },
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
  }, 'Ollama');
  return data.message?.content || '';
}

const ADAPTERS = { anthropic, gemini, openai, ollama };

async function complete(provider, { system, prompt, images = [] }, onProgress) {
  const run = ADAPTERS[provider?.kind];
  if (!run) throw new Error('No AI selected. Open Settings and pick one.');
  if (provider.kind !== 'ollama' && !provider.key) {
    throw Object.assign(new Error(`There is no API key for "${provider.name}".`), { code: 'BAD_KEY', providerId: provider.id });
  }
  try {
    return await run(provider, { system, prompt, images }, onProgress);
  } catch (e) {
    if (e.code === 'BAD_KEY') e.providerId = provider.id;
    throw e;
  }
}

// Ask for JSON; if the reply can't be parsed, retry once before giving up.
async function completeJSON(provider, req, onProgress) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete(provider, req, onProgress);
    try {
      return parseJSON(text);
    } catch (e) {
      lastErr = e;
      onProgress?.('The AI reply was malformed, retrying...');
    }
  }
  throw new Error(`The AI returned an unreadable answer twice (${lastErr.message}). Try again or use a bigger model.`);
}

module.exports = { complete, completeJSON };
