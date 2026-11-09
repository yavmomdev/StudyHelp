const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/renderer/js/blurry.js');

test('first occurrence is a blank, later ones are echoes', () => {
  const seg = B.segment('Mitosis splits a cell. After mitosis there are two cells.', ['mitosis']);
  assert.deepStrictEqual(seg.filter((s) => s.type !== 'text').map((s) => s.type), ['blank', 'echo']);
});
test('works with Cyrillic and respects word boundaries', () => {
  const seg = B.segment('Фотосинтеза е процес. Не е фотосинтезаx.', ['фотосинтеза']);
  assert.strictEqual(seg.filter((s) => s.type === 'blank').length, 1);
  assert.strictEqual(seg.filter((s) => s.type === 'echo').length, 0);
});
test('longer terms win over contained shorter ones', () => {
  const seg = B.segment('The cell membrane is thin.', ['cell', 'cell membrane']);
  assert.strictEqual(seg.find((s) => s.type === 'blank').term, 'cell membrane');
});
test('regex special characters in terms are safe', () => {
  assert.doesNotThrow(() => B.segment('Use C++ (really).', ['C++', '(really)']));
});
test('answer matching ignores case/punctuation and allows one typo in long words', () => {
  assert.ok(B.isMatch(' Митохондрия. ', 'митохондрия'));
  assert.ok(B.isMatch('mitochondrai', 'mitochondria'));
  assert.ok(B.isMatch('chloroplat', 'chloroplast'));
  assert.ok(!B.isMatch('cat', 'car')); // short words must be exact
  assert.ok(!B.isMatch('', 'x'));
});

test('pickTerms: one word only, max one per sentence, in order of appearance', () => {
  const notes = 'The mitochondria produce ATP. Ribosomes make proteins! The cell membrane is thin.';
  assert.deepStrictEqual(B.pickTerms(notes, ['ATP', 'mitochondria', 'cell membrane', 'Ribosomes', 'proteins', 'missing']), ['mitochondria', 'Ribosomes']);
});
test('pickTerms works for Cyrillic and ignores duplicates', () => {
  const notes = 'Фотосинтезата става в хлоропластите. Хлоропластите съдържат хлорофил.';
  assert.deepStrictEqual(B.pickTerms(notes, ['хлоропластите', 'хлорофил', 'Фотосинтезата']), ['Фотосинтезата', 'хлорофил']);
});
test('sentences split on line breaks too', () => {
  assert.strictEqual(B.sentenceRanges('One\nTwo\nThree.').length, 3);
});

test('pickTerms: a term repeated in another sentence uses up that sentence too', () => {
  const notes = 'The mitochondria produce energy. Mitochondria are organelles. The nucleus holds DNA.';
  assert.deepStrictEqual(B.pickTerms(notes, ['mitochondria', 'energy', 'organelles', 'nucleus', 'DNA']), ['mitochondria', 'nucleus']);
});
