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
const ANTH = { id: 'a1', name: 'Claude', kind: 'anthropic', key: 'k', model: 'claude-x' };
const GEM = { id: 'builtin', name: 'Gemini (Free)', kind: 'gemini', key: 'AIza', model: 'gemini-3.5-flash', retryDelays: [1, 1] };
const mk = (provider, store = createStore(tmp())) => ({ store, settings: { language: 'auto' }, provider, onProgress() {} });
const lessonJSON = { title: 'T', overview: 'o', keyPoints: ['k'], sections: [{ heading: 'h', content: 'c' }] };
const geminiReply = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking...' }, { text: JSON.stringify(obj) }] } }] }) });

test('lesson -> test from lesson -> revision, end to end with a mocked API', async () => {
  const ctx = mk(ANTH);
  const file = path.join(tmp(), 'notes.txt');
  fs.writeFileSync(file, 'Mitochondria are the powerhouse of the cell. They make ATP.');

  let calls = mockFetch({ title: 'Cells', overview: 'About cells', keyPoints: ['k'], sections: [{ heading: 'H', content: '- x' }], questions: pack.questions });
  const lesson = await jobs.createLesson({ files: [{ path: file }], text: '' }, ctx);
  assert.strictEqual(lesson.type, 'lesson');
  assert.strictEqual(calls[0].headers['x-api-key'], 'k');
  assert.ok(calls[0].body.messages[0].content[0].text.includes('powerhouse'));

  calls = mockFetch(pack);
  const test_ = await jobs.createTest({ mode: 'lesson', lessonId: lesson.id }, ctx);
  assert.deepStrictEqual(test_.data.blurryTerms, ['mitochondria', 'Ribosomes']); // ATP shares a sentence with mitochondria
  assert.ok(calls[0].body.messages[0].content[0].text.includes('About cells'));

  const rev = await jobs.createRevision({ lessonIds: [lesson.id], text: 'extra notes' }, ctx);
  assert.strictEqual(rev.type, 'revision');
  assert.strictEqual(ctx.store.listItems().length, 3);
});

test('graded mode uses the mistakes prompt and an image is sent as a vision block', async () => {
  const png = path.join(tmp(), 'test.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const calls = mockFetch({ ...pack, mistakes: [{ question: 'q', ruleBroken: 'r' }], rules: [{ rule: 'r', explanation: 'e' }] });
  const t = await jobs.createTest({ mode: 'graded', files: [{ path: png }], text: 'my answers' }, mk(ANTH));
  assert.strictEqual(t.data.mistakes.length, 1);
  const content = calls[0].body.messages[0].content;
  assert.strictEqual(content[0].type, 'image');
  assert.ok(content.at(-1).text.includes('ALREADY taken'));
});

test('empty input, missing key (BAD_KEY with provider id) and unreadable replies', async () => {
  await assert.rejects(jobs.createLesson({ files: [], text: '' }, mk(ANTH)), /Add at least one file/);
  await assert.rejects(jobs.createLesson({ text: 'hi' }, mk({ ...ANTH, key: '' })), (e) => e.code === 'BAD_KEY' && e.providerId === 'a1');
  let n = 0;
  global.fetch = async () => (n++, { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: 'sorry' }] }) });
  await assert.rejects(jobs.createLesson({ files: [], text: 'x' }, mk(ANTH)), /unreadable/);
  assert.strictEqual(n, 2);
});

test('a rejected key (401) surfaces as BAD_KEY tagged with the option id', async () => {
  global.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }) });
  await assert.rejects(jobs.createLesson({ text: 'x' }, mk(ANTH)), (e) => e.code === 'BAD_KEY' && e.providerId === 'a1' && /rejected/.test(e.message));
  // Gemini says 400 "API key not valid"
  global.fetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) });
  await assert.rejects(jobs.createLesson({ text: 'x' }, mk(GEM)), (e) => e.code === 'BAD_KEY');
  // quota is NOT a key problem
  global.fetch = async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'quota' } }) });
  await assert.rejects(jobs.createLesson({ text: 'x' }, mk(GEM)), (e) => e.code !== 'BAD_KEY' && /free quota/.test(e.message));
});

test('gemini: right URL/header/body, thought parts ignored, images inline', async () => {
  const png = path.join(tmp(), 'n.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const seen = [];
  global.fetch = async (url, init) => { seen.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return geminiReply(lessonJSON); };
  const lesson = await jobs.createLesson({ files: [{ path: png }], text: 'hello' }, mk(GEM));
  assert.strictEqual(lesson.title, 'T');
  assert.ok(seen[0].url.endsWith('/models/gemini-3.5-flash:generateContent'));
  assert.strictEqual(seen[0].headers['x-goog-api-key'], 'AIza');
  assert.ok(!seen[0].url.includes('AIza'));
  assert.strictEqual(seen[0].body.contents[0].parts[0].inline_data.mime_type, 'image/png');
  assert.strictEqual(seen[0].body.generationConfig.responseMimeType, 'application/json');
});

test('gemini 503: retries, then falls back to a lighter model', async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('gemini-3.5-flash:')) return { ok: false, status: 503, text: async () => JSON.stringify({ error: { message: 'high demand' } }) };
    return geminiReply(lessonJSON);
  };
  const lesson = await jobs.createLesson({ text: 'x' }, mk(GEM));
  assert.strictEqual(lesson.title, 'T');
  assert.strictEqual(urls.filter((u) => u.includes('3.5-flash:')).length, 3);
  assert.ok(urls.at(-1).includes('gemini-3.1-flash-lite'));
});

test('gemini 503 that recovers on retry stays on the chosen model', async () => {
  let n = 0;
  global.fetch = async () => (++n === 1 ? { ok: false, status: 503, text: async () => '{}' } : geminiReply(lessonJSON));
  await jobs.createLesson({ text: 'x' }, mk({ ...GEM, model: 'gemini-2.5-pro', retryDelays: [1] }));
  assert.strictEqual(n, 2);
});

test('openai-style option: bearer auth, chat/completions URL, image_url parts, JSON-mode fallback', async () => {
  const OAI = { id: 'o1', name: 'Groq', kind: 'openai', key: 'gsk_x', model: 'llama', baseUrl: 'https://api.groq.com/openai/v1' };
  const png = path.join(tmp(), 'n.png');
  fs.writeFileSync(png, Buffer.from('89504e470d0a1a0a', 'hex'));
  const seen = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, headers: init.headers, body });
    if (body.response_format) return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'response_format is not supported' } }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(lessonJSON) } }] }) };
  };
  const lesson = await jobs.createLesson({ files: [{ path: png }], text: 'hi' }, mk(OAI));
  assert.strictEqual(lesson.title, 'T');
  assert.strictEqual(seen.length, 2); // first with JSON mode, then without
  assert.strictEqual(seen[1].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.strictEqual(seen[1].headers.authorization, 'Bearer gsk_x');
  assert.strictEqual(seen[1].body.messages[1].content[0].type, 'image_url');
});

test('ollama: local call, no key needed, images become OCR text path (no vision blocks)', async () => {
  const seen = [];
  global.fetch = async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => JSON.stringify({ message: { content: JSON.stringify(lessonJSON) } }) }; };
  const lesson = await jobs.createLesson({ text: 'hello' }, mk({ id: 'ollama', name: 'Ollama', kind: 'ollama', baseUrl: 'http://localhost:11434/', model: 'llama3.1' }));
  assert.strictEqual(lesson.title, 'T');
  assert.strictEqual(seen[0].url, 'http://localhost:11434/api/chat');
  assert.strictEqual(seen[0].body.format, 'json');
});
