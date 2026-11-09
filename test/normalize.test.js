const test = require('node:test');
const assert = require('node:assert');
const N = require('../src/main/normalize');

test('parseJSON strips fences and chatter', () => {
  assert.deepStrictEqual(N.parseJSON('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => N.parseJSON('no json'));
});
test('questions with bad answer index or too few options are dropped', () => {
  const t = N.normTest({
    notes: 'The nucleus holds DNA.',
    blurryTerms: ['nucleus', 'missing term', 'NUCLEUS'],
    questions: [
      { question: 'ok', options: ['a', 'b', 'c', 'd'], answerIndex: 2 },
      { question: 'bad idx', options: ['a', 'b'], answerIndex: 5 },
      { question: 'one option', options: ['a'], answerIndex: 0 },
      { question: 'string idx', options: ['a', 'b'], answerIndex: '1' },
    ],
  });
  assert.strictEqual(t.questions.length, 2);
  assert.deepStrictEqual(t.blurryTerms, ['nucleus']);
});
test('diagram edges to unknown nodes are removed', () => {
  const l = N.normLesson({ diagrams: [{ title: 'x', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'zzz' }] }] });
  assert.strictEqual(l.diagrams[0].edges.length, 1);
});
test('graded tests keep mistakes and rules', () => {
  const t = N.normTest({ mistakes: [{ question: 'q', ruleBroken: 'r' }], rules: [{ rule: 'r' }] }, true);
  assert.strictEqual(t.mistakes.length, 1);
  assert.strictEqual(t.rules.length, 1);
});

test('blurry terms: multi-word phrases and same-sentence terms are dropped', () => {
  const t = N.normTest({ notes: 'The nucleus holds DNA. The cell wall protects plants.', blurryTerms: ['nucleus', 'DNA', 'cell wall', 'plants'] });
  assert.deepStrictEqual(t.blurryTerms, ['nucleus', 'plants']);
});
