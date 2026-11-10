const test = require('node:test');
const assert = require('node:assert');
const { detectFromKey, listModels } = require('../src/main/providers');

test('detects provider from key prefix', () => {
  assert.strictEqual(detectFromKey('sk-ant-api03-abc').id, 'anthropic');
  assert.strictEqual(detectFromKey('AIzaSyABC').id, 'gemini');
  assert.strictEqual(detectFromKey('AQ.Ab8RN6Lexample').id, 'gemini');
  assert.strictEqual(detectFromKey('gsk_abc').id, 'groq');
  assert.strictEqual(detectFromKey('sk-or-v1-abc').id, 'openrouter');
  assert.strictEqual(detectFromKey('sk-proj-abc').guess, false);
  assert.deepStrictEqual([detectFromKey('sk-abc123').id, detectFromKey('sk-abc123').guess], ['openai', true]);
  assert.strictEqual(detectFromKey('  AIzaSy  ').id, 'gemini');
  assert.strictEqual(detectFromKey('random'), null);
  assert.strictEqual(detectFromKey(''), null);
});

test('listModels: gemini keeps generateContent models and strips the models/ prefix', async () => {
  let seen;
  global.fetch = async (url, init) => { seen = { url, headers: init.headers }; return { ok: true, status: 200, text: async () => JSON.stringify({ models: [
    { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }] }) }; };
  assert.deepStrictEqual(await listModels({ kind: 'gemini', key: 'AIza' }), ['gemini-2.5-pro', 'gemini-3.5-flash']);
  assert.strictEqual(seen.headers['x-goog-api-key'], 'AIza');
  assert.ok(!seen.url.includes('AIza'));
});

test('listModels: openai-style hides non-chat models; needs a URL', async () => {
  global.fetch = async (url, init) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'llama-3.3-70b' }] }) });
  assert.deepStrictEqual(await listModels({ kind: 'openai', baseUrl: 'https://x.test/v1/', key: 'k' }), ['gpt-4o', 'llama-3.3-70b']);
  await assert.rejects(listModels({ kind: 'openai', baseUrl: '', key: 'k' }), /address/);
});

test('listModels: rejected key gives BAD_KEY; missing key too', async () => {
  global.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'nope' } }) });
  await assert.rejects(listModels({ kind: 'anthropic', key: 'bad' }), (e) => e.code === 'BAD_KEY');
  await assert.rejects(listModels({ kind: 'gemini', key: '' }), (e) => e.code === 'BAD_KEY');
});
