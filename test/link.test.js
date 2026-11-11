const test = require('node:test');
const assert = require('node:assert');
const Links = require('../src/renderer/js/links.js');
const { fetchLink, fetchLinks, rewrite } = require('../src/main/link');

test('only lines that are just a link are recognised', () => {
  const r = Links.split('my notes\nhttps://example.com/a.pdf\nsee https://x.com for more\n<https://example.org/page>.\nhttps://example.com/a.pdf');
  assert.deepStrictEqual(r.links, ['https://example.com/a.pdf', 'https://example.org/page']);
  assert.strictEqual(r.rest, 'my notes\nsee https://x.com for more');
  assert.deepStrictEqual(Links.split('').links, []);
});

test('Google share links become export links', () => {
  assert.strictEqual(rewrite('https://docs.google.com/document/d/ABC_1-x/edit?usp=sharing'), 'https://docs.google.com/document/d/ABC_1-x/export?format=txt');
  assert.match(rewrite('https://drive.google.com/file/d/FILE1/view'), /uc\?export=download&id=FILE1/);
  assert.strictEqual(rewrite('https://example.com/x'), 'https://example.com/x');
});

function reply(status, type, body, url) {
  return { ok: status < 400, status, url, headers: { get: (h) => ({ 'content-type': type }[h.toLowerCase()] ?? null) }, arrayBuffer: async () => Buffer.from(body) };
}

test('web page: keeps the article, drops menus', async () => {
  const article = 'Photosynthesis turns light into chemical energy. '.repeat(10);
  global.fetch = async (u) => reply(200, 'text/html; charset=utf-8', `<html><title>Biology</title><nav>MENU</nav><article><p>${article}</p></article><footer>FOOT</footer></html>`, u);
  const r = await fetchLink('https://example.com/bio');
  assert.strictEqual(r.name, 'Biology');
  assert.ok(r.text.includes('Photosynthesis') && !r.text.includes('MENU') && !r.text.includes('FOOT'));
});

test('plain text file and a page needing login', async () => {
  global.fetch = async (u) => reply(200, 'text/plain', 'hello notes', u);
  assert.strictEqual((await fetchLink('https://example.com/n.txt')).text, 'hello notes');
  global.fetch = async () => reply(200, 'text/html', '<form></form>', 'https://accounts.google.com/ServiceLogin?x=1');
  await assert.rejects(fetchLink('https://docs.google.com/document/d/ID/edit'), /needs a login/);
});

test('errors are explained; one bad link does not stop the others', async () => {
  global.fetch = async (u) => (String(u).includes('bad') ? reply(404, 'text/html', '', u) : reply(200, 'text/plain', 'good text', u));
  await assert.rejects(fetchLink('https://example.com/bad'), /404/);
  await assert.rejects(fetchLink('ftp://example.com/x'), /only http/);
  const r = await fetchLinks(['https://example.com/ok.txt', 'https://example.com/bad']);
  assert.strictEqual(r.texts.length, 1);
  assert.strictEqual(r.warnings.length, 1);
});

test('unsupported file types are refused', async () => {
  global.fetch = async (u) => reply(200, 'application/zip', 'PK', u);
  await assert.rejects(fetchLink('https://example.com/a.zip'), /not supported/);
});
