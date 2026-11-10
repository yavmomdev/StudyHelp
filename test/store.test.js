const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
const secrets = { encrypt: (x) => 'enc:' + Buffer.from(x).toString('base64'), decrypt: (x) => Buffer.from(x.slice(4), 'base64').toString() };

test('save, list, get, attempt, delete', () => {
  const s = createStore(tmp());
  const a = s.saveItem({ type: 'lesson', title: 'A', data: {} });
  const b = s.saveItem({ type: 'test', title: 'B', data: {} });
  assert.strictEqual(s.listItems().length, 2);
  assert.ok(s.addAttempt(b.id, { mode: 'test', score: 3, total: 4 }));
  assert.strictEqual(s.getItem(b.id).attempts.length, 1);
  assert.strictEqual(s.deleteItems([a.id, b.id, 'nope']), 2);
  assert.strictEqual(s.listItems().length, 0);
});

test('rejects path-traversal ids', () => {
  const s = createStore(tmp());
  assert.strictEqual(s.getItem('../settings'), null);
  assert.strictEqual(s.deleteItems(['../settings']), 0);
});

test('default AI is the built-in Gemini when this copy has a key, nothing otherwise', () => {
  const s = createStore(tmp(), secrets);
  assert.strictEqual(s.publicSettings(true).activeId, 'builtin');
  assert.strictEqual(s.activeProvider('AIza-builtin').kind, 'gemini');
  assert.strictEqual(s.activeProvider('AIza-builtin').key, 'AIza-builtin');
  assert.strictEqual(s.publicSettings(false).activeId, '');
  assert.strictEqual(s.activeProvider(null), null);
});

test('custom option: create, becomes active, key encrypted and hidden, edit keeps key, delete', () => {
  const dir = tmp();
  const s = createStore(dir, secrets);
  const p = s.saveProvider({ name: 'My Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1/', model: 'llama-3.3-70b', apiKey: 'gsk_secret' });
  assert.strictEqual(p.baseUrl, 'https://api.groq.com/openai/v1');
  assert.ok(!fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').includes('gsk_secret'));
  const pub = s.publicSettings(true);
  assert.strictEqual(pub.activeId, p.id);
  assert.ok(pub.providers[0].hasKey && pub.providers[0].apiKey === undefined && pub.providers[0].keyEnc === undefined);
  assert.strictEqual(s.activeProvider('x').key, 'gsk_secret');

  s.saveProvider({ id: p.id, name: 'Renamed', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'other', apiKey: '' });
  assert.strictEqual(s.activeProvider('x').key, 'gsk_secret'); // blank key = keep
  assert.strictEqual(s.activeProvider('x').name, 'Renamed');
  s.saveProvider({ id: p.id, name: 'Renamed', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'other', apiKey: 'gsk_new' });
  assert.strictEqual(s.getProviderKey(p.id), 'gsk_new');

  assert.strictEqual(s.deleteProvider(p.id), 1);
  assert.strictEqual(s.publicSettings(true).providers.length, 0);
  assert.strictEqual(s.publicSettings(true).activeId, 'builtin'); // falls back to the built-in option
  assert.strictEqual(s.publicSettings(false).activeId, '');
});

test('saveProvider validates input', () => {
  const s = createStore(tmp(), secrets);
  const ok = { name: 'x', kind: 'gemini', model: 'm', apiKey: 'k' };
  assert.throws(() => s.saveProvider({ ...ok, name: ' ' }), /name/);
  assert.throws(() => s.saveProvider({ ...ok, kind: 'evil' }), /Unknown/);
  assert.throws(() => s.saveProvider({ ...ok, model: '' }), /model/);
  assert.throws(() => s.saveProvider({ ...ok, apiKey: '' }), /key/);
  assert.throws(() => s.saveProvider({ ...ok, kind: 'openai' }), /address/);
  assert.throws(() => s.saveProvider({ ...ok, id: 'ghost' }), /no longer/);
});

test('setActive only accepts real options; ollama settings saved', () => {
  const s = createStore(tmp(), secrets);
  assert.throws(() => s.setActive('builtin', false));
  assert.throws(() => s.setActive('nope', true));
  s.setActive('ollama', false);
  s.saveSettings({ ollamaModel: 'qwen2.5', ollamaUrl: 'http://localhost:11434' });
  const p = s.activeProvider(null);
  assert.deepStrictEqual([p.kind, p.model], ['ollama', 'qwen2.5']);
});

test('old settings (one Anthropic key, one Gemini key) are migrated to custom options', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
    provider: 'gemini', apiKeyEnc: secrets.encrypt('sk-ant-old'), geminiApiKeyEnc: secrets.encrypt('AIza-old'),
    anthropicModel: 'claude-x', geminiModel: 'gemini-2.5-pro', language: 'Bulgarian',
  }));
  const s = createStore(dir, secrets);
  const pub = s.publicSettings(false);
  assert.deepStrictEqual(pub.providers.map((p) => p.kind).sort(), ['anthropic', 'gemini']);
  assert.strictEqual(pub.language, 'Bulgarian');
  const a = s.activeProvider(null);
  assert.deepStrictEqual([a.kind, a.key], ['gemini', 'AIza-old']);
});

test('theme: defaults to cloud, is remembered, and invalid values fall back', () => {
  const dir = tmp();
  const s = createStore(dir, secrets);
  assert.strictEqual(s.publicSettings(false).theme, 'cloud');
  s.saveSettings({ theme: 'ocean' });
  assert.strictEqual(createStore(dir, secrets).publicSettings(false).theme, 'ocean'); // survives a restart
  s.saveSettings({ theme: 'not-a-theme' });
  assert.strictEqual(s.publicSettings(false).theme, 'cloud');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: '<script>' }));
  assert.strictEqual(createStore(dir, secrets).publicSettings(false).theme, 'cloud');
});

test('history summaries stay correct after attempts, edits and deletes (cache)', () => {
  const s = createStore(tmp());
  const a = s.saveItem({ type: 'test', title: 'A', data: {} });
  assert.strictEqual(s.listItems()[0].best, null);
  s.addAttempt(a.id, { mode: 'test', score: 2, total: 4 });
  s.addAttempt(a.id, { mode: 'test', score: 3, total: 4 });
  s.addAttempt(a.id, { mode: 'test', score: 1, total: 4 });
  const row = s.listItems()[0];
  assert.deepStrictEqual(row.best, { score: 3, total: 4 });
  assert.strictEqual(row.attempts, 3);
  s.deleteItems([a.id]);
  assert.strictEqual(s.listItems().length, 0);
});

test('settings changes are visible immediately (cache is invalidated)', () => {
  const s = createStore(tmp(), secrets);
  assert.strictEqual(s.loadSettings().theme, 'cloud');
  s.saveSettings({ theme: 'ocean' });
  assert.strictEqual(s.loadSettings().theme, 'ocean');
  s.saveSettings({ theme: 'nonsense' });
  assert.strictEqual(s.loadSettings().theme, 'cloud');
});
