'use strict';
// Reads a web link as study material: a public page, a direct PDF/Word/image/text file, or a Google Doc/Sheet/Slides
// that is shared as "anyone with the link". Anything that needs a login is reported clearly instead of guessed at.
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { extractOne, htmlToText, SUPPORTED_EXTENSIONS } = require('./extract');

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 30 * 1000;

// Google share links -> a direct download/export link.
function rewrite(url) {
  const u = new URL(url);
  const id = u.pathname.match(/\/d\/([\w-]+)/)?.[1];
  if (u.hostname === 'docs.google.com' && id) {
    if (u.pathname.startsWith('/document/')) return `https://docs.google.com/document/d/${id}/export?format=txt`;
    if (u.pathname.startsWith('/spreadsheets/')) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
    if (u.pathname.startsWith('/presentation/')) return `https://docs.google.com/presentation/d/${id}/export?format=txt`;
  }
  if (u.hostname === 'drive.google.com' && id) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url;
}

const EXT_BY_TYPE = [
  [/pdf/, '.pdf'],
  [/wordprocessingml|msword/, '.docx'],
  [/image\/png/, '.png'],
  [/image\/jpe?g/, '.jpg'],
  [/image\/webp/, '.webp'],
  [/image\/gif/, '.gif'],
  [/text\/csv/, '.csv'],
  [/text\/markdown/, '.md'],
  [/text\/plain/, '.txt'],
  [/json/, '.json'],
];

// Keeps the main content of a web page: prefers <article>/<main>, drops menus, footers and forms.
function pageText(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const main = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html;
  const cleaned = main.replace(/<(nav|header|footer|aside|form|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  return { title, text: htmlToText(cleaned) };
}

async function fetchLink(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${rawUrl}: not a valid link`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`${rawUrl}: only http and https links work`);

  let res;
  try {
    res = await fetch(rewrite(url.href), {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 StudyHelp', accept: 'text/html,application/pdf,*/*' },
    });
  } catch (e) {
    throw new Error(`${url.hostname}: could not be reached (${e.name === 'TimeoutError' ? 'took too long' : 'check the link and your connection'})`);
  }
  const finalUrl = new URL(res.url || url.href);
  if (/accounts\.google\.com|\/(login|signin|sign-in)\b/i.test(finalUrl.href)) {
    throw new Error(`${url.hostname}: this link needs a login. In Google Docs use Share → "Anyone with the link", or download the file and add it here.`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${url.hostname}: access denied. The page is private, so download the file and add it here instead.`);
  if (res.status === 404) throw new Error(`${url.hostname}: page not found (404). Check the link.`);
  if (!res.ok) throw new Error(`${url.hostname}: the site answered with an error (${res.status}).`);

  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error(`${url.hostname}: the file is larger than 25 MB`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`${url.hostname}: the file is larger than 25 MB`);

  const base = decodeURIComponent(finalUrl.pathname.split('/').filter(Boolean).pop() || '') || finalUrl.hostname;
  const urlExt = path.extname(finalUrl.pathname).toLowerCase();
  const ext = EXT_BY_TYPE.find(([re]) => re.test(type))?.[1] || (/html/.test(type) ? '.html' : urlExt);

  if (ext === '.html' || ext === '.htm') {
    const { title, text } = pageText(buf.toString('utf8'));
    const name = title || `${finalUrl.hostname}${finalUrl.pathname}`;
    if (text.length < 200) {
      return { name, text, warning: `${finalUrl.hostname}: very little text found. The page may need a login or JavaScript, so try saving it as a PDF.` };
    }
    return { name, text };
  }
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`${url.hostname}: this kind of file (${type || 'unknown'}) is not supported`);
  }
  // Binary files go through the same reader as files from disk.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studyhelp-link-'));
  const file = path.join(dir, (path.extname(base).toLowerCase() === ext ? base : base + ext).replace(/[\\/:*?"<>|]/g, '_'));
  try {
    await fs.writeFile(file, buf);
    return await extractOne(file);
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Several links at once; a failing link becomes a warning and does not stop the others.
async function fetchLinks(urls) {
  const out = { texts: [], images: [], warnings: [] };
  const results = await Promise.allSettled(urls.map(fetchLink));
  for (const r of results) {
    if (r.status === 'rejected') { out.warnings.push(r.reason?.message || String(r.reason)); continue; }
    const v = r.value;
    if (v.warning) out.warnings.push(v.warning);
    if (v.text) out.texts.push({ name: v.name, text: v.text });
    if (v.image) out.images.push(v.image);
  }
  return out;
}

module.exports = { fetchLink, fetchLinks, rewrite, pageText };
