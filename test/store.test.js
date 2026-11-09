const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));

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
test('api key is stored encrypted and never exposed publicly', () => {
  const dir = tmp();
  const secrets = { encrypt: (x) => 'enc:' + Buffer.from(x).toString('base64'), decrypt: (x) => Buffer.from(x.slice(4), 'base64').toString() };
  const s = createStore(dir, secrets);
  s.saveSettings({ apiKey: 'sk-secret', provider: 'anthropic' });
  assert.ok(!fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').includes('sk-secret'));
  assert.strictEqual(s.loadSettings().apiKey, 'sk-secret');
  assert.strictEqual(s.publicSettings().apiKey, undefined);
  assert.strictEqual(s.publicSettings().hasApiKey, true);
  s.saveSettings({ provider: 'ollama' }); // key survives unrelated changes
  assert.strictEqual(s.loadSettings().apiKey, 'sk-secret');
  s.saveSettings({ clear_apiKey: true });
  assert.strictEqual(s.publicSettings().hasApiKey, false);
});

test('gemini key is encrypted separately and clearable', () => {
  const dir = tmp();
  const secrets = { encrypt: (x) => 'enc:' + Buffer.from(x).toString('base64'), decrypt: (x) => Buffer.from(x.slice(4), 'base64').toString() };
  const s = createStore(dir, secrets);
  s.saveSettings({ geminiApiKey: 'AIza-secret', apiKey: 'sk-other' });
  assert.ok(!fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').includes('AIza-secret'));
  const pub = s.publicSettings();
  assert.strictEqual(pub.geminiApiKey, undefined);
  assert.ok(pub.hasGeminiKey && pub.hasApiKey);
  s.saveSettings({ clear_geminiApiKey: true });
  assert.ok(!s.publicSettings().hasGeminiKey && s.publicSettings().hasApiKey);
});
