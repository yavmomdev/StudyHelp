const test = require('node:test');
const assert = require('node:assert');
const { complete } = require('../src/main/ai');

// Replaces fetch with a scripted sequence of [status, body] replies and records the model each call used.
function mockFetch(script) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(decodeURIComponent(String(url).match(/models\/([^:]+):/)?.[1] || ''));
    const [status, body] = script.shift();
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
  return calls;
}
const ok = (t) => [200, { candidates: [{ content: { parts: [{ text: t }] } }] }];
const provider = { id: 'p', name: 'G', kind: 'gemini', key: 'k', model: 'gemini-3.5-flash', retryDelays: [1, 1] };
const req = { system: 's', prompt: 'p' };

test('Gemini: a used-up free limit on one model moves on to a lighter model', async () => {
  const calls = mockFetch([[429, { error: { message: 'quota' } }], ok('{"a":1}')]);
  assert.strictEqual(await complete(provider, req), '{"a":1}');
  assert.deepStrictEqual(calls, ['gemini-3.5-flash', 'gemini-3.1-flash-lite']);
});

test('Gemini: overloaded (503) is retried on the same model first', async () => {
  const calls = mockFetch([[503, { error: { message: 'busy' } }], ok('done')]);
  assert.strictEqual(await complete(provider, req), 'done');
  assert.deepStrictEqual(calls, ['gemini-3.5-flash', 'gemini-3.5-flash']);
});

test('Gemini: a rejected key is reported at once as BAD_KEY with the option id', async () => {
  const calls = mockFetch([[401, { error: { message: 'bad key' } }]]);
  await assert.rejects(complete(provider, req), (e) => e.code === 'BAD_KEY' && e.providerId === 'p');
  assert.strictEqual(calls.length, 1);
});

test('Gemini: every model out of quota ends in a clear rate-limit error', async () => {
  const q = [429, { error: { message: 'quota' } }];
  mockFetch([q, q, q]);
  await assert.rejects(complete(provider, req), /free quota/i);
});
