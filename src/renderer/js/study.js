'use strict';
// Study widgets: lesson body, quiz, flash cards, blurry notes, and the test tabs that combine them.
(function (SH) {
  const { h } = SH;

  // ---------- lesson / revision body ----------
  SH.studyBody = (d) => {
    const root = h('div');
    if (d.overview) root.append(h('div', { class: 'card overview md', html: SH.md(d.overview) }));

    if (d.keyPoints?.length) {
      const done = h('span', { class: 'muted' }, `0 / ${d.keyPoints.length} understood`);
      let n = 0;
      root.append(
        h('h2', {}, 'Most important things ', done),
        h('div', { class: 'card' },
          d.keyPoints.map((k) => {
            const row = h('div', { class: 'kp', onClick: () => {
              const on = row.classList.toggle('done');
              n += on ? 1 : -1;
              dot.textContent = on ? '✓' : '';
              done.textContent = `${n} / ${d.keyPoints.length} understood`;
            } });
            const dot = h('span', { class: 'dot' });
            row.append(dot, h('span', { html: SH.md(k).replace(/^<p>|<\/p>$/g, '') }));
            return row;
          })),
        h('p', { class: 'muted' }, 'Click a point to tick it off when you know it.')
      );
    }

    if (d.sections?.length) {
      root.append(h('h2', {}, 'Summary'));
      d.sections.forEach((s, i) =>
        root.append(h('details', { class: 'sec', open: i === 0 },
          h('summary', {}, s.heading || `Part ${i + 1}`),
          h('div', { class: 'body md', html: SH.md(s.content) })))
      );
    }

    for (const t of d.tables || []) {
      root.append(
        h('h2', {}, t.title || 'Table'),
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, t.headers.map((x) => h('th', {}, x)))),
          h('tbody', {}, t.rows.map((r) => h('tr', {}, t.headers.map((_, i) => h('td', {}, r[i] ?? ''))))))
      );
    }

    for (const dg of d.diagrams || []) {
      root.append(h('h2', {}, dg.title || 'Diagram'), h('div', { class: 'diagram', html: Diagram.render(dg) }));
    }

    if (d.glossary?.length) {
      const grid = h('div', { class: 'gloss' });
      const draw = (q = '') => {
        grid.replaceChildren(
          ...d.glossary
            .filter((g) => (g.term + g.definition).toLowerCase().includes(q.toLowerCase()))
            .map((g) => h('div', { class: 'g' }, h('b', {}, g.term), h('div', { class: 'muted', style: 'margin-top:4px' }, g.definition)))
        );
      };
      draw();
      root.append(
        h('h2', {}, 'Glossary'),
        h('input', { type: 'text', placeholder: 'Search terms…', style: 'margin-bottom:12px', onInput: (e) => draw(e.target.value) }),
        grid
      );
    }
    return root;
  };

  // ---------- quiz ----------
  // opts.instant: show right/wrong immediately (lesson check); otherwise answers are revealed at the end.
  SH.quiz = (questions, opts = {}) => {
    const box = h('div', { class: 'card' });
    const prep = (qs) =>
      qs.map((q) => {
        const order = SH.shuffle(q.options.map((_, i) => i));
        return { ...q, options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) };
      });
    let qs = prep(questions);
    let i = 0;
    let picks = [];

    function start(list) {
      qs = prep(list);
      i = 0;
      picks = [];
      draw();
    }

    function draw() {
      if (i >= qs.length) return result();
      const q = qs[i];
      let locked = false;
      const optEls = q.options.map((o, idx) =>
        h('button', { class: 'opt', onClick: () => choose(idx) }, o)
      );
      const nextBtn = h('button', { class: 'btn primary', disabled: true, onClick: () => { i++; draw(); } },
        i === qs.length - 1 ? 'Finish' : 'Next');
      const explain = h('div');

      function choose(idx) {
        if (locked) return;
        picks[i] = idx;
        optEls.forEach((el, k) => el.classList.toggle('picked', k === idx));
        if (opts.instant) {
          locked = true;
          optEls.forEach((el, k) => {
            el.disabled = true;
            if (k === q.answerIndex) el.classList.add('right');
            else if (k === idx) el.classList.add('wrong');
          });
          if (q.explanation) explain.replaceChildren(h('div', { class: 'explain' }, q.explanation));
        }
        nextBtn.disabled = false;
      }

      box.replaceChildren(
        h('div', { class: 'progress' }, h('div', { style: `width:${(i / qs.length) * 100}%` })),
        h('div', { class: 'muted', style: 'margin-bottom:6px' }, `Question ${i + 1} of ${qs.length}`),
        h('p', { class: 'q-text' }, q.question),
        ...optEls, explain,
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' }, nextBtn)
      );
    }

    function result() {
      const wrong = qs.filter((q, k) => picks[k] !== q.answerIndex);
      const score = qs.length - wrong.length;
      opts.onDone?.({ score, total: qs.length });
      box.replaceChildren(
        h('div', { class: 'row spread' },
          h('div', {}, h('div', { class: 'score' }, `${score} / ${qs.length}`),
            h('div', { class: 'muted' }, score === qs.length ? 'Perfect! 🎉' : `${Math.round((score / qs.length) * 100)}% correct`)),
          h('div', { class: 'row' },
            wrong.length ? h('button', { class: 'btn', onClick: () => start(wrong) }, `Retry ${wrong.length} missed`) : null,
            h('button', { class: 'btn primary', onClick: () => start(questions) }, 'Restart'))),
        h('h3', { style: 'margin-top:22px' }, 'Review'),
        ...qs.map((q, k) => {
          const ok = picks[k] === q.answerIndex;
          return h('div', { class: `review-item ${ok ? 'ok' : 'no'}` },
            h('div', {}, h('span', { class: 'tag' }, ok ? '✓ ' : '✗ '), h('b', {}, q.question)),
            !ok && picks[k] != null ? h('div', { class: 'muted', style: 'margin-top:4px' }, `Your answer: ${q.options[picks[k]]}`) : null,
            h('div', { style: 'margin-top:4px;color:var(--ok)' }, `Correct: ${q.options[q.answerIndex]}`),
            q.explanation ? h('div', { class: 'explain' }, q.explanation) : null);
        })
      );
    }

    draw();
    return box;
  };

  // ---------- flash cards ----------
  SH.flashcards = (cards, opts = {}) => {
    const box = h('div');
    let deck = SH.shuffle(cards);
    let known = 0;
    let total = deck.length;
    let missed = [];

    function draw() {
      if (!deck.length) return finish();
      const c = deck[0];
      const card = h('div', { class: 'fc', onClick: () => card.classList.toggle('flip') },
        h('div', { class: 'face' }, c.front, h('span', { class: 'hint' }, 'click to flip')),
        h('div', { class: 'face back' }, c.back));
      const next = (gotIt) => {
        deck.shift();
        if (gotIt) known++;
        else missed.push(c);
        draw();
      };
      box.replaceChildren(
        h('div', { class: 'progress' }, h('div', { style: `width:${((total - deck.length) / total) * 100}%` })),
        h('div', { class: 'muted', style: 'margin-bottom:10px' }, `${total - deck.length + 1} of ${total}`),
        h('div', { class: 'fc-wrap' }, card),
        h('div', { class: 'row', style: 'justify-content:center;margin-top:20px' },
          h('button', { class: 'btn danger', onClick: () => next(false) }, 'Still learning'),
          h('button', { class: 'btn primary', onClick: () => next(true) }, 'I knew it'))
      );
    }

    function finish() {
      opts.onDone?.({ score: known, total });
      box.replaceChildren(h('div', { class: 'card' },
        h('div', { class: 'score' }, `${known} / ${total}`),
        h('div', { class: 'muted' }, 'cards you knew'),
        h('div', { class: 'row', style: 'margin-top:18px' },
          missed.length ? h('button', { class: 'btn', onClick: () => { deck = SH.shuffle(missed); total = deck.length; known = 0; missed = []; draw(); } }, `Review ${missed.length} missed`) : null,
          h('button', { class: 'btn primary', onClick: () => { deck = SH.shuffle(cards); total = deck.length; known = 0; missed = []; draw(); } }, 'Restart'))));
    }

    draw();
    return box;
  };

  // ---------- blurry notes ----------
  SH.blurry = (data, opts = {}) => {
    const parts = Blurry.segment(data.notes, data.blurryTerms);
    const blanks = [];
    const echoes = [];
    const body = h('div', { class: 'blurry' });

    for (const p of parts) {
      if (p.type === 'text') body.append(document.createTextNode(p.value));
      else if (p.type === 'blank') {
        const input = h('input', { type: 'text', class: 'blank', autocomplete: 'off', spellcheck: 'false',
          style: `width:${Math.min(Math.max(p.term.length, 6), 28) + 2}ch`, 'aria-label': 'fill in the blank' });
        blanks.push({ input, term: p.term, key: p.key });
        body.append(input);
      } else {
        const el = h('span', { class: 'echo' }, p.term);
        echoes.push({ el, key: p.key });
        body.append(el);
      }
    }

    const status = h('span', { class: 'muted' }, `${blanks.length} blanks`);
    let checked = false;

    function check() {
      let ok = 0;
      for (const b of blanks) {
        const good = Blurry.isMatch(b.input.value, b.term);
        b.input.classList.toggle('ok', good);
        b.input.classList.toggle('no', !good);
        if (good) ok++;
      }
      echoes.forEach((e) => {
        const b = blanks.find((x) => x.key === e.key);
        e.el.classList.toggle('shown', !!b && Blurry.isMatch(b.input.value, b.term));
      });
      status.textContent = `${ok} / ${blanks.length} correct`;
      if (!checked && ok === blanks.length) SH.toast('All blanks correct! 🎉', 'ok');
      checked = true;
      opts.onDone?.({ score: ok, total: blanks.length });
    }

    function reveal() {
      for (const b of blanks) {
        if (!Blurry.isMatch(b.input.value, b.term)) {
          b.input.value = b.term;
          b.input.classList.remove('ok');
          b.input.classList.add('no');
        }
      }
      echoes.forEach((e) => e.el.classList.add('shown'));
    }

    function reset() {
      blanks.forEach((b) => { b.input.value = ''; b.input.classList.remove('ok', 'no'); });
      echoes.forEach((e) => e.el.classList.remove('shown'));
      status.textContent = `${blanks.length} blanks`;
      checked = false;
    }

    return h('div', {},
      h('p', { class: 'muted' }, 'Fill in the missing terms. Blurred words repeat a term you already have to find.'),
      body,
      h('div', { class: 'row spread', style: 'margin-top:16px' }, status,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: reset }, 'Clear'),
          h('button', { class: 'btn', onClick: reveal }, 'Show answers'),
          h('button', { class: 'btn primary', onClick: check }, 'Check')))
    );
  };

  // ---------- test tabs ----------
  // item: a saved test/revision. Attempts are stored so the history can show progress.
  SH.testTabs = (item) => {
    const d = item.data;
    const save = (mode) => ({ score, total }) =>
      window.studyhelp.saveAttempt(item.id, { mode, score, total });

    const tabs = [];
    if (d.mistakes?.length || d.rules?.length) tabs.push(['mistakes', 'Your mistakes', () => mistakesPane(d)]);
    if (d.questions?.length) tabs.push(['test', 'Normal test', () => SH.quiz(d.questions, { onDone: save('test') })]);
    if (d.flashcards?.length) tabs.push(['cards', 'Flash cards', () => SH.flashcards(d.flashcards, { onDone: save('flashcards') })]);
    if (d.notes && d.blurryTerms?.length) tabs.push(['blurry', 'Blurry notes', () => SH.blurry(d, { onDone: save('blurry') })]);

    const pane = h('div');
    const seg = h('div', { class: 'seg' });
    const built = {};
    const show = (id) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
      built[id] ||= tabs.find((t) => t[0] === id)[2]();
      pane.replaceChildren(built[id]);
    };
    tabs.forEach(([id, label]) => seg.append(h('button', { dataset: { id }, onClick: () => show(id) }, label)));
    if (tabs.length) show(tabs[0][0]);
    return h('div', {}, seg, pane);
  };

  function mistakesPane(d) {
    const root = h('div');
    if (d.rules?.length) {
      root.append(h('h2', { style: 'margin-top:0' }, 'Rules you broke'));
      d.rules.forEach((r) => root.append(h('div', { class: 'rule' }, h('b', {}, r.rule), h('div', {}, r.explanation),
        r.tip ? h('div', { class: 'muted' }, `Tip: ${r.tip}`) : null)));
    }
    if (d.mistakes?.length) {
      root.append(h('h2', {}, 'Your mistakes'));
      d.mistakes.forEach((m) => root.append(h('div', { class: 'mistake' },
        h('b', {}, m.question),
        m.yourAnswer ? h('div', { class: 'muted' }, `You answered: ${m.yourAnswer}`) : null,
        m.correctAnswer ? h('div', { style: 'color:var(--ok)' }, `Correct: ${m.correctAnswer}`) : null,
        m.ruleBroken ? h('div', {}, h('b', {}, 'Rule: '), m.ruleBroken) : null,
        m.explanation ? h('div', { class: 'muted' }, m.explanation) : null)));
    }
    if (!d.rules?.length && !d.mistakes?.length) root.append(h('div', { class: 'empty' }, 'No mistakes were found in this test. Nice!'));
    return root;
  }
})(window.SH);
