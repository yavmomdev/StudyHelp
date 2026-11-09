const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/main/store');
const jobs = require('../src/main/jobs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));

// Fake Anthropic API: returns a canned JSON reply and records the request.
function mockFetch(reply) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }) };
  };
  return calls;
}
const pack = {
  title: 'Cells',
  notes: 'The mitochondria produce ATP. Ribosomes make proteins.',
  blurryTerms: ['mitochondria', 'ATP', 'Ribosomes'],
  questions: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'e' }],
  flashcards: [{ front: 'f', back: 'b' }],
};

test('lesson -> test from lesson -> revision, end to end with a mocked API', async () => {
  const store = createStore(tmp());
  const ctx = { store, settings: { ...store.loadSettings(), apiKey: 'k', language: 'auto' }, onProgress() {} };
  const file = path.join(tmp(), 'notes.txt');
  fs.writeFileSync(file, 'Mitochondria are the powerhouse of the cell. They make ATP.');

  let calls = mockFetch({ title: 'Cells', overview: 'About cells', keyPoints: ['k'], sections: [{ heading: 'H', content: '- x' }], questions: pack.questions });
  const lesson = await jobs.createLesson({ files: [{ path: file }], text: '' }, ctx);
  assert.strictEqual(lesson.type, 'lesson');
  assert.strictEqual(calls[0].headers['x-api-key'], 'k');
  assert.ok(calls[0].body.messages[0].content[0].text.includes('powerhouse'));

  calls = mockFetch(pack);
  const test_ = await jobs.createTest({ mode: 'lesson', lessonId: lesson.id }, ctx);
  assert.strictEqual(test_.type, 'test');
  assert.deepStrictEqual(test_.data.blurryTerms, ['mitochondria', 'Ribosomes']); // ATP shares a sentence with mitochondria
  assert.ok(calls[0].body.messages[0].content[0].text.includes('About cells'));

  const rev = await jobs.createRevision({ lessonIds: [lesson.id], text: 'extra notes' }, ctx);
  assert.strictEqual(rev.type, 'revision');
  assert.strictEqual(store.listItems().length, 3);
});

test('graded mode uses the mistakes prompt and an image is sent as a vision block', async () => {
  const store = createStore(tmp());
  const ctx = { store, settings: { ...store.loadSettings(), apiKey: 'k' }, onProgress() {} };
  const png = path.join(tmp(), 'test.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const calls = mockFetch({ ...pack, mistakes: [{ question: 'q', ruleBroken: 'r' }], rules: [{ rule: 'r', explanation: 'e' }] });
  const t = await jobs.createTest({ mode: 'graded', files: [{ path: png }], text: 'my answers' }, ctx);
  assert.strictEqual(t.data.mistakes.length, 1);
  const content = calls[0].body.messages[0].content;
  assert.strictEqual(content[0].type, 'image');
  assert.ok(content.at(-1).text.includes('ALREADY taken'));
});

test('missing API key and empty input give clear errors', async () => {
  const store = createStore(tmp());
  const ctx = { store, settings: store.loadSettings(), onProgress() {} };
  await assert.rejects(jobs.createLesson({ files: [], text: '' }, ctx), /Add at least one file/);
  await assert.rejects(jobs.createLesson({ files: [], text: 'hi' }, ctx), /API key/);
});

test('unparseable model reply is retried once then fails clearly', async () => {
  const store = createStore(tmp());
  const ctx = { store, settings: { ...store.loadSettings(), apiKey: 'k' }, onProgress() {} };
  let n = 0;
  global.fetch = async () => (n++, { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: 'sorry' }] }) });
  await assert.rejects(jobs.createLesson({ files: [], text: 'x' }, ctx), /unreadable/);
  assert.strictEqual(n, 2);
});

test('gemini provider: right URL/header/body, thought parts ignored, images inline', async () => {
  const store = createStore(tmp());
  const ctx = { store, settings: { ...store.loadSettings(), provider: 'gemini', geminiApiKey: 'AIza', geminiModel: 'gemini-3.5-flash' }, onProgress() {} };
  const png = path.join(tmp(), 'n.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const seen = [];
  global.fetch = async (url, init) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const answer = JSON.stringify({ title: 'T', overview: 'o', keyPoints: ['k'], sections: [{ heading: 'h', content: 'c' }] });
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking...' }, { text: answer }] } }] }) };
  };
  const lesson = await jobs.createLesson({ files: [{ path: png }], text: 'hello' }, ctx);
  assert.strictEqual(lesson.title, 'T');
  assert.ok(seen[0].url.endsWith('/models/gemini-3.5-flash:generateContent'));
  assert.strictEqual(seen[0].headers['x-goog-api-key'], 'AIza');
  assert.ok(!seen[0].url.includes('AIza'));
  assert.strictEqual(seen[0].body.contents[0].parts[0].inline_data.mime_type, 'image/png');
  assert.strictEqual(seen[0].body.generationConfig.responseMimeType, 'application/json');
});

test('gemini without a key and quota errors are explained', async () => {
  const store = createStore(tmp());
  const base = { ...store.loadSettings(), provider: 'gemini' };
  await assert.rejects(jobs.createLesson({ text: 'x' }, { store, settings: base, onProgress() {} }), /Gemini API key/);
  global.fetch = async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'quota' } }) });
  await assert.rejects(jobs.createLesson({ text: 'x' }, { store, settings: { ...base, geminiApiKey: 'k' }, onProgress() {} }), /free quota/);
});

test('gemini 503: retries, then falls back to a lighter model', async () => {
  const store = createStore(tmp());
  const ctx = { store, settings: { ...store.loadSettings(), provider: 'gemini', geminiApiKey: 'k', geminiModel: 'gemini-3.5-flash', _retryDelays: [1, 1] }, onProgress() {} };
  const ok = JSON.stringify({ title: 'T', keyPoints: ['k'], sections: [{ heading: 'h', content: 'c' }] });
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('gemini-3.5-flash:')) return { ok: false, status: 503, text: async () => JSON.stringify({ error: { message: 'high demand' } }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: ok }] } }] }) };
  };
  const lesson = await jobs.createLesson({ text: 'x' }, ctx);
  assert.strictEqual(lesson.title, 'T');
  assert.strictEqual(urls.filter((u) => u.includes('3.5-flash:')).length, 3); // 1 try + 2 retries
  assert.ok(urls.at(-1).includes('gemini-3.1-flash-lite'));
});

test('gemini 503 that recovers on retry stays on the chosen model; bad key is not retried', async () => {
  const store = createStore(tmp());
  const base = { ...store.loadSettings(), provider: 'gemini', geminiApiKey: 'k', geminiModel: 'gemini-2.5-pro', _retryDelays: [1] };
  const ok = JSON.stringify({ title: 'T', keyPoints: ['k'], sections: [{ heading: 'h', content: 'c' }] });
  let n = 0;
  global.fetch = async () => (++n === 1
    ? { ok: false, status: 503, text: async () => '{}' }
    : { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: ok }] } }] }) });
  await jobs.createLesson({ text: 'x' }, { store, settings: base, onProgress() {} });
  assert.strictEqual(n, 2);
  n = 0;
  global.fetch = async () => (n++, { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'API key not valid' } }) });
  await assert.rejects(jobs.createLesson({ text: 'x' }, { store, settings: base, onProgress() {} }), /Invalid or unauthorised/);
  assert.strictEqual(n, 1);
});
