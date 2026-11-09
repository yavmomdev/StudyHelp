'use strict';
// High-level jobs: gather the source -> prompt the model -> normalise -> save to history.
const { extractFiles, ocrImages } = require('./extract');
const { completeJSON } = require('./ai');
const prompts = require('./prompts');
const { normLesson, normTest, normRevision } = require('./normalize');


function lessonToText(item) {
  const d = item.data;
  const lines = [`# ${item.title}`, d.overview || ''];
  if (d.keyPoints?.length) lines.push('Key points:', ...d.keyPoints.map((k) => `- ${k}`));
  for (const s of d.sections || []) lines.push(`## ${s.heading}`, s.content);
  for (const t of d.tables || []) {
    lines.push(`Table: ${t.title}`, t.headers.join(' | '), ...t.rows.map((r) => r.join(' | ')));
  }
  if (d.glossary?.length) lines.push('Glossary:', ...d.glossary.map((g) => `- ${g.term}: ${g.definition}`));
  return lines.filter(Boolean).join('\n');
}

// Turns {files:[{path}], text} into prompt-ready {texts, images}. Local models get OCR text instead of images.
async function gatherSource({ files = [], text = '' }, ctx) {
  ctx.onProgress?.('Reading your files…');
  const ex = await extractFiles(files.map((f) => f.path));
  const texts = [...ex.texts];
  if (text.trim()) texts.push({ name: 'Pasted notes', text: text.trim() });
  let images = ex.images;
  if (images.length && ctx.settings.provider === 'ollama') {
    texts.push(...(await ocrImages(images, ctx.onProgress)));
    images = [];
  }
  if (!texts.length && !images.length) {
    throw new Error(ex.warnings.join(' ') || 'Add at least one file or paste some text first.');
  }
  return { texts, images, warnings: ex.warnings };
}

function meta(data, extra = {}) {
  return {
    questions: data.questions?.length || 0,
    flashcards: data.flashcards?.length || 0,
    ...extra,
  };
}

async function run(ctx, builder, source, extraOpts = {}) {
  ctx.onProgress?.('Thinking… this can take up to a minute.');
  const req = builder({ texts: source.texts, language: ctx.settings.language, hasImages: source.images.length > 0, ...extraOpts });
  return completeJSON(ctx.settings, { ...req, images: source.images }, ctx.onProgress);
}

async function createLesson(payload, ctx) {
  const source = await gatherSource(payload, ctx);
  const raw = await run(ctx, prompts.lessonPrompt, source);
  const data = normLesson(raw);
  if (!data.sections.length && !data.keyPoints.length) throw new Error('The AI could not build a lesson from this material.');
  const title = payload.title?.trim() || data.title;
  return {
    ...ctx.store.saveItem({
      type: 'lesson',
      title,
      data,
      meta: { sections: data.sections.length, keyPoints: data.keyPoints.length, questions: data.questions.length },
      sourceNames: source.texts.map((t) => t.name).concat(source.images.map((i) => i.name)),
    }),
    warnings: source.warnings,
  };
}

async function createTest(payload, ctx) {
  const graded = payload.mode === 'graded';
  let source;
  let from = null;
  if (payload.mode === 'lesson') {
    const lesson = ctx.store.getItem(payload.lessonId);
    if (!lesson) throw new Error('That lesson no longer exists.');
    source = { texts: [{ name: lesson.title, text: lessonToText(lesson) }], images: [], warnings: [] };
    from = { id: lesson.id, title: lesson.title };
  } else {
    source = await gatherSource(payload, ctx);
  }
  const raw = await run(ctx, graded ? prompts.gradedTestPrompt : prompts.testPrompt, source);
  const data = normTest(raw, graded);
  if (!data.questions.length) throw new Error('The AI did not produce usable questions. Try again.');
  return {
    ...ctx.store.saveItem({
      type: 'test',
      title: payload.title?.trim() || data.title,
      data,
      meta: meta(data, { mode: graded ? 'graded' : from ? 'lesson' : 'material', mistakes: data.mistakes?.length || 0 }),
      from,
    }),
    warnings: source.warnings,
  };
}

async function createRevision(payload, ctx) {
  const ids = Array.isArray(payload.lessonIds) ? payload.lessonIds : [];
  const lessons = ids.map((id) => ctx.store.getItem(id)).filter((i) => i && i.type === 'lesson');
  const hasExtra = (payload.files?.length || 0) > 0 || !!payload.text?.trim();
  if (!lessons.length && !hasExtra) throw new Error('Select at least one lesson or add revision notes.');

  const texts = lessons.map((l) => ({ name: l.title, text: lessonToText(l) }));
  let images = [];
  let warnings = [];
  if (hasExtra) {
    const extra = await gatherSource(payload, ctx);
    texts.push(...extra.texts);
    images = extra.images;
    warnings = extra.warnings;
  }
  const raw = await run(ctx, prompts.revisionPrompt, { texts, images });
  const data = normRevision(raw);
  if (!data.questions.length) throw new Error('The AI did not produce usable questions. Try again.');
  return {
    ...ctx.store.saveItem({
      type: 'revision',
      title: payload.title?.trim() || data.title,
      data,
      meta: meta(data, { lessons: lessons.length, keyPoints: data.keyPoints.length }),
      from: lessons.map((l) => ({ id: l.id, title: l.title })),
    }),
    warnings,
  };
}

module.exports = { createLesson, createTest, createRevision, lessonToText };
