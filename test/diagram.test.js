const test = require('node:test');
const assert = require('node:assert');
const D = require('../src/renderer/js/diagram.js');

test('renders a cycle without hanging and escapes labels', () => {
  const svg = D.render({ title: 't', nodes: [{ id: 'a', label: '<b>A</b>' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a', label: 'again' }] });
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(!svg.includes('<b>A</b>'));
  assert.ok(svg.includes('again'));
});
test('levels follow edge direction', () => {
  const lv = D.levels([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
  assert.deepStrictEqual(lv, { a: 0, b: 1, c: 2 });
});
