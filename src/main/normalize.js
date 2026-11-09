'use strict';
// Model output is untrusted: coerce it into the exact shapes the UI expects and drop anything broken.

const Blurry = require('../renderer/js/blurry.js');

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);

function parseJSON(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('The AI did not return JSON');
  return JSON.parse(t.slice(a, b + 1));
}

function normQuestions(list) {
  return arr(list)
    .map((q) => {
      const options = arr(q?.options).map(str).filter(Boolean).slice(0, 6);
      let idx = Number.isInteger(q?.answerIndex) ? q.answerIndex : parseInt(q?.answerIndex, 10);
      return {
        question: str(q?.question),
        options,
        answerIndex: idx,
        explanation: str(q?.explanation),
        concept: str(q?.concept),
      };
    })
    .filter((q) => q.question && q.options.length >= 2 && q.answerIndex >= 0 && q.answerIndex < q.options.length);
}

function normFlashcards(list) {
  return arr(list)
    .map((c) => ({ front: str(c?.front), back: str(c?.back) }))
    .filter((c) => c.front && c.back);
}

function normSections(list) {
  return arr(list)
    .map((s) => ({ heading: str(s?.heading), content: str(s?.content) }))
    .filter((s) => s.heading || s.content);
}

function normGlossary(list) {
  return arr(list)
    .map((g) => ({ term: str(g?.term), definition: str(g?.definition) }))
    .filter((g) => g.term && g.definition);
}

function normTables(list) {
  return arr(list)
    .map((t) => {
      const headers = arr(t?.headers).map(str);
      const rows = arr(t?.rows).map((r) => arr(r).map(str)).filter((r) => r.length);
      return { title: str(t?.title), headers, rows };
    })
    .filter((t) => t.headers.length && t.rows.length);
}

function normDiagrams(list) {
  return arr(list)
    .map((d) => {
      const nodes = arr(d?.nodes).map((n) => ({ id: str(n?.id), label: str(n?.label) })).filter((n) => n.id && n.label);
      const ids = new Set(nodes.map((n) => n.id));
      const edges = arr(d?.edges)
        .map((e) => ({ from: str(e?.from), to: str(e?.to), label: str(e?.label) }))
        .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
      return { title: str(d?.title), nodes: nodes.slice(0, 14), edges };
    })
    .filter((d) => d.nodes.length >= 2);
}

// Blur terms: single words only, max one per sentence, and they must really occur in the notes.
function pickBlurryTerms(terms, notes) {
  return Blurry.pickTerms(notes, arr(terms).map(str));
}

function normTestPack(raw) {
  const notes = str(raw?.notes);
  return {
    questions: normQuestions(raw?.questions),
    flashcards: normFlashcards(raw?.flashcards),
    notes,
    blurryTerms: pickBlurryTerms(raw?.blurryTerms, notes),
  };
}

function normLesson(raw) {
  return {
    title: str(raw?.title) || 'Untitled lesson',
    overview: str(raw?.overview),
    keyPoints: arr(raw?.keyPoints).map(str).filter(Boolean),
    sections: normSections(raw?.sections),
    tables: normTables(raw?.tables),
    diagrams: normDiagrams(raw?.diagrams),
    glossary: normGlossary(raw?.glossary),
    questions: normQuestions(raw?.questions),
  };
}

function normTest(raw, graded) {
  const pack = normTestPack(raw);
  const out = { title: str(raw?.title) || 'Test', ...pack };
  if (graded) {
    out.mistakes = arr(raw?.mistakes)
      .map((m) => ({
        question: str(m?.question),
        yourAnswer: str(m?.yourAnswer),
        correctAnswer: str(m?.correctAnswer),
        ruleBroken: str(m?.ruleBroken),
        explanation: str(m?.explanation),
      }))
      .filter((m) => m.question || m.ruleBroken);
    out.rules = arr(raw?.rules)
      .map((r) => ({ rule: str(r?.rule), explanation: str(r?.explanation), tip: str(r?.tip) }))
      .filter((r) => r.rule);
  }
  return out;
}

function normRevision(raw) {
  return {
    title: str(raw?.title) || 'Revision',
    overview: str(raw?.overview),
    keyPoints: arr(raw?.keyPoints).map(str).filter(Boolean),
    sections: normSections(raw?.sections),
    glossary: normGlossary(raw?.glossary),
    ...normTestPack(raw),
  };
}

module.exports = { parseJSON, normLesson, normTest, normRevision, pickBlurryTerms };
