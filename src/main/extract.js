'use strict';
// Reads study files (txt/md/html/csv/json, pdf, docx, images) into text and/or image blocks.
const fs = require('fs/promises');
const path = require('path');

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm']);
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const SUPPORTED_EXTENSIONS = [...TEXT_EXT, '.pdf', '.docx', ...Object.keys(IMAGE_MIME)];
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Anthropic per-image limit

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function extractOne(filePath) {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`${name} is not a file`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`${name} is larger than 25 MB`);

  if (TEXT_EXT.has(ext)) {
    let text = await fs.readFile(filePath, 'utf8');
    if (ext === '.html' || ext === '.htm') text = htmlToText(text);
    return { name, text };
  }
  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js'); // skips the package's debug entry point
    const { text } = await pdfParse(await fs.readFile(filePath));
    if (text.trim().length < 50) {
      return { name, text: '', warning: `${name}: no selectable text found (scanned PDF?). Export its pages as images and add those instead.` };
    }
    return { name, text: text.trim() };
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: await fs.readFile(filePath) });
    return { name, text: value.trim() };
  }
  if (IMAGE_MIME[ext]) {
    if (stat.size > MAX_IMAGE_BYTES) throw new Error(`${name} is larger than 5 MB, please use a smaller image`);
    return { name, image: { name, mediaType: IMAGE_MIME[ext], data: (await fs.readFile(filePath)).toString('base64') } };
  }
  throw new Error(`${name}: unsupported file type "${ext}"`);
}

// Returns { texts:[{name,text}], images:[{name,mediaType,data}], warnings:[] }.
// A file that fails to read becomes a warning, so one bad file doesn't lose the whole batch.
async function extractFiles(paths = []) {
  const out = { texts: [], images: [], warnings: [] };
  for (const p of paths) {
    try {
      const r = await extractOne(p);
      if (r.warning) out.warnings.push(r.warning);
      if (r.text) out.texts.push({ name: r.name, text: r.text });
      if (r.image) out.images.push(r.image);
    } catch (e) {
      out.warnings.push(e.message);
    }
  }
  return out;
}

// OCR fallback for local models that cannot see images (needs internet once to fetch language data).
async function ocrImages(images, onProgress) {
  if (!images.length) return [];
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng+bul');
  const out = [];
  try {
    for (const [i, img] of images.entries()) {
      onProgress?.(`Reading image ${i + 1}/${images.length} (OCR)…`);
      const { data } = await worker.recognize(Buffer.from(img.data, 'base64'));
      if (data.text.trim()) out.push({ name: img.name, text: data.text.trim() });
    }
  } finally {
    await worker.terminate();
  }
  return out;
}

module.exports = { extractFiles, extractOne, ocrImages, htmlToText, SUPPORTED_EXTENSIONS };
