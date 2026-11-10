'use strict';
// Pages: Lesson, Test, Revision, History, Settings, and the saved-item viewer.
(function (SH) {
  const { h } = SH;
  const api = () => window.studyhelp;

  // ---------- shared pieces ----------
  // File drop area + paste box. getPayload() -> {files:[{path,name}], text}
  function dropzone({ hint = 'PDF, Word, images, text — drop them here' } = {}) {
    const files = [];
    const chips = h('div', { class: 'chips' });
    const text = h('textarea', { placeholder: 'Or paste notes / text here…' });
    const drawChips = () =>
      chips.replaceChildren(...files.map((f, i) =>
        h('span', { class: 'chip' }, f.name, h('button', { title: 'Remove', onClick: () => { files.splice(i, 1); drawChips(); } }, '×'))));
    const add = (list) => {
      for (const f of list) if (f.path && !files.some((x) => x.path === f.path)) files.push(f);
      drawChips();
    };
    const zone = h('div', { class: 'dropzone' },
      h('div', { class: 'big' }, 'Drag & drop files'), h('div', {}, hint),
      h('div', { style: 'margin-top:14px' },
        h('button', { class: 'btn', onClick: async () => add((await SH.call(api().pickFiles())) || []) }, 'Browse files…')));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      add([...e.dataTransfer.files].map((f) => ({ path: api().pathForFile(f), name: f.name })));
    });
    return {
      el: h('div', {}, zone, chips, h('div', { style: 'margin-top:14px' }, text)),
      payload: () => ({ files: [...files], text: text.value }),
      isEmpty: () => !files.length && !text.value.trim(),
    };
  }

  function titleField() {
    const input = h('input', { type: 'text', placeholder: 'Leave empty to let the AI name it' });
    return { el: h('label', { class: 'field' }, h('span', {}, 'Title (optional)'), input), value: () => input.value };
  }

  function header(title, sub) {
    return [h('h1', {}, title), h('p', { class: 'sub' }, sub)];
  }

  async function setupBanner() {
    const s = await SH.call(api().settings.get());
    if (!s || s.activeId) return null;
    return h('div', { class: 'callout' }, 'No AI is selected yet. Open ',
      h('a', { href: '#', style: 'color:var(--accent)', onClick: (e) => { e.preventDefault(); SH.go('settings'); } }, 'Settings'),
      ' and pick Gemini (Free), Ollama, or create your own option.');
  }

  async function generate(label, job, then) {
    const item = await SH.busy(label, async () => SH.call(job()));
    if (!item) return;
    item.warnings?.forEach((w) => SH.toast(w, 'error'));
    SH.toast('Saved to your history', 'ok');
    then(item);
  }

  // Selectable list of past lessons; multi=false behaves like radio buttons.
  function lessonPicker(lessons, { multi, initial }) {
    const sel = new Set(initial && lessons.some((l) => l.id === initial) ? [initial] : []);
    const list = h('div', { class: 'pick-list' });
    const info = h('span', { class: 'muted' });
    const draw = () => {
      list.replaceChildren(...lessons.map((l) => {
        const on = sel.has(l.id);
        return h('div', { class: `pick ${on ? 'sel' : ''}`, onClick: () => {
          if (multi) on ? sel.delete(l.id) : sel.add(l.id);
          else { sel.clear(); sel.add(l.id); }
          draw();
        } },
          h('input', { type: multi ? 'checkbox' : 'radio', checked: on || null, tabindex: '-1', style: 'pointer-events:none' }),
          h('div', { class: 'grow' }, h('div', {}, l.title), h('div', { class: 'muted', style: 'font-size:13px' }, SH.fmtDate(l.createdAt))));
      }));
      info.textContent = multi ? `${sel.size} selected` : '';
    };
    draw();
    const all = multi
      ? h('button', { class: 'btn small', onClick: () => { sel.size === lessons.length ? sel.clear() : lessons.forEach((l) => sel.add(l.id)); draw(); } }, 'Select all')
      : null;
    return { el: h('div', {}, h('div', { class: 'row spread', style: 'margin-bottom:8px' }, info, all), list), ids: () => [...sel] };
  }

  // ---------- Lesson ----------
  SH.views = {};

  SH.views.lesson = async (main) => {
    const dz = dropzone({ hint: 'Send the whole lesson: PDF, Word, photos of notes, text…' });
    const title = titleField();
    const btn = h('button', { class: 'btn primary', onClick: () => {
      if (dz.isEmpty()) return SH.toast('Add a file or paste some text first.', 'error');
      generate('Reading your lesson and building the summary…',
        () => api().createLesson({ ...dz.payload(), title: title.value() }),
        (item) => SH.go('open', item.id));
    } }, 'Create lesson');
    main.replaceChildren(h('div', { class: 'page' },
      ...header('New lesson', 'Upload a lesson and get a summary of the most important things, tables and diagrams where they help, a glossary and a quick check quiz.'),
      await setupBanner(), h('div', { class: 'card' }, dz.el), title.el, btn));
  };

  // ---------- Test ----------
  SH.views.test = async (main, arg) => {
    const lessons = ((await SH.call(api().history.list())) || []).filter((l) => l.type === 'lesson');
    let mode = arg?.lessonId ? 'lesson' : 'material';
    const dzMaterial = dropzone({ hint: 'Material to be tested on' });
    const dzGraded = dropzone({ hint: 'Photos / PDF of the test you took, with your answers and the teacher’s marks' });
    const picker = lessonPicker(lessons, { multi: false, initial: arg?.lessonId });
    const title = titleField();
    const body = h('div');
    const seg = h('div', { class: 'seg' });
    const modes = {
      material: ['From files', 'Upload notes or a lesson and get a test, flash cards and blurry notes.', () => dzMaterial.el],
      lesson: ['From a previous lesson', 'Pick one of your saved lessons.', () => (lessons.length ? picker.el : h('div', { class: 'empty' }, 'No lessons yet. Create one first.'))],
      graded: ['Analyze my test', 'Upload a test you already took. You’ll get the rules you broke and similar practice questions.', () => dzGraded.el],
    };
    const draw = () => {
      seg.replaceChildren(...Object.entries(modes).map(([k, [label]]) =>
        h('button', { class: k === mode ? 'active' : '', onClick: () => { mode = k; draw(); } }, label)));
      body.replaceChildren(h('p', { class: 'muted' }, modes[mode][1]), h('div', { class: 'card' }, modes[mode][2]()));
    };
    draw();

    const go = h('button', { class: 'btn primary', onClick: () => {
      let payload = { mode, title: title.value() };
      if (mode === 'material') { if (dzMaterial.isEmpty()) return SH.toast('Add a file or paste some text first.', 'error'); payload = { ...payload, ...dzMaterial.payload() }; }
      if (mode === 'graded') { if (dzGraded.isEmpty()) return SH.toast('Add your test first.', 'error'); payload = { ...payload, ...dzGraded.payload() }; }
      if (mode === 'lesson') { const [id] = picker.ids(); if (!id) return SH.toast('Pick a lesson.', 'error'); payload.lessonId = id; }
      generate(mode === 'graded' ? 'Finding your mistakes and writing practice questions…' : 'Writing your test…',
        () => api().createTest(payload), (item) => SH.go('open', item.id));
    } }, 'Create test');

    main.replaceChildren(h('div', { class: 'page' },
      ...header('New test', 'Every test comes in three variants: a normal test, flash cards and blurry notes.'),
      await setupBanner(), seg, body, title.el, go));
  };

  // ---------- Revision ----------
  SH.views.revision = async (main) => {
    const lessons = ((await SH.call(api().history.list())) || []).filter((l) => l.type === 'lesson');
    const picker = lessonPicker(lessons, { multi: true });
    const dz = dropzone({ hint: 'Optional: add revision notes too' });
    const title = titleField();
    const go = h('button', { class: 'btn primary', onClick: () => {
      if (!picker.ids().length && dz.isEmpty()) return SH.toast('Select lessons or add revision notes.', 'error');
      generate('Merging your lessons into a revision pack…',
        () => api().createRevision({ ...dz.payload(), lessonIds: picker.ids(), title: title.value() }),
        (item) => SH.go('open', item.id));
    } }, 'Create revision');
    main.replaceChildren(h('div', { class: 'page' },
      ...header('Revision', 'Choose several lessons (and/or send revision notes) to get one combined summary and a revision test.'),
      await setupBanner(),
      h('h3', {}, 'Your lessons'),
      lessons.length ? h('div', { class: 'card' }, picker.el) : h('div', { class: 'card empty' }, 'No saved lessons yet. You can still send revision notes below.'),
      h('h3', {}, 'Revision notes'), h('div', { class: 'card' }, dz.el), title.el, go));
  };

  // ---------- History ----------
  SH.views.history = async (main) => {
    let items = (await SH.call(api().history.list())) || [];
    let filter = 'all';
    let query = '';
    const sel = new Set();
    const list = h('div');
    const chk = h('input', { type: 'checkbox', title: 'Select all' });
    const delBtn = h('button', { class: 'btn danger', disabled: true }, 'Delete');
    const seg = h('div', { class: 'seg', style: 'margin-bottom:0' });

    const visible = () => items.filter((i) => (filter === 'all' || i.type === filter) && i.title.toLowerCase().includes(query.toLowerCase()));

    function bestScore(it) {
      return it.attempts ? `${it.attempts} attempt${it.attempts > 1 ? 's' : ''}` : 'not tried yet';
    }
    function metaLine(it) {
      const m = it.meta || {};
      const bits = [SH.fmtDate(it.createdAt)];
      if (it.type === 'lesson') bits.push(`${m.sections || 0} sections`);
      if (it.type === 'revision') bits.push(`${m.lessons || 0} lessons`);
      if (it.type !== 'lesson') bits.push(`${m.questions || 0} questions`, `${m.flashcards || 0} cards`);
      if (m.mode === 'graded') bits.push(`${m.mistakes || 0} mistakes analysed`);
      bits.push(bestScore(it));
      return bits.join(' · ');
    }

    function draw() {
      seg.replaceChildren(...['all', 'lesson', 'test', 'revision'].map((f) =>
        h('button', { class: f === filter ? 'active' : '', onClick: () => { filter = f; draw(); } }, f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1) + 's')));
      const vis = visible();
      for (const id of [...sel]) if (!vis.some((v) => v.id === id)) sel.delete(id);
      chk.checked = vis.length > 0 && vis.every((v) => sel.has(v.id));
      delBtn.disabled = sel.size === 0;
      delBtn.textContent = sel.size ? `Delete selected (${sel.size})` : 'Delete';
      list.replaceChildren(...(vis.length ? vis.map((it) => {
        const cb = h('input', { type: 'checkbox', checked: sel.has(it.id) || null, onClick: (e) => e.stopPropagation(),
          onChange: () => { cb.checked ? sel.add(it.id) : sel.delete(it.id); draw(); } });
        return h('div', { class: 'hist-row', onClick: () => SH.go('open', it.id) },
          cb, h('span', { class: `badge ${it.type}` }, it.type),
          h('div', { class: 'grow' }, h('div', { class: 't' }, it.title), h('div', { class: 'm' }, metaLine(it))));
      }) : [h('div', { class: 'empty' }, items.length ? 'Nothing matches.' : 'Your lessons, tests and revisions will show up here.')]));
    }

    chk.addEventListener('change', () => {
      const vis = visible();
      chk.checked ? vis.forEach((v) => sel.add(v.id)) : vis.forEach((v) => sel.delete(v.id));
      draw();
    });
    delBtn.addEventListener('click', async () => {
      if (!(await SH.confirm(`Delete ${sel.size} item${sel.size > 1 ? 's' : ''}?`, 'This cannot be undone.'))) return;
      const n = await SH.call(api().history.remove([...sel]));
      if (n == null) return;
      items = items.filter((i) => !sel.has(i.id));
      sel.clear();
      SH.toast(`Deleted ${n} item${n === 1 ? '' : 's'}`, 'ok');
      draw();
    });

    main.replaceChildren(h('div', { class: 'page' },
      ...header('History', 'Everything you have made. Open an item to study it again.'),
      h('div', { class: 'row spread', style: 'margin-bottom:16px' }, seg,
        h('input', { type: 'text', placeholder: 'Search…', style: 'max-width:240px', onInput: (e) => { query = e.target.value; draw(); } })),
      h('div', { class: 'row', style: 'margin-bottom:12px;padding-left:4px' },
        h('label', { class: 'row', style: 'gap:8px;cursor:pointer' }, chk, 'Select all'), delBtn),
      list));
    draw();
  };

  // ---------- Open a saved item ----------
  SH.views.open = async (main, id) => {
    const item = await SH.call(api().history.get(id));
    if (!item) return SH.go('history');
    const d = item.data;
    const page = h('div', { class: 'page' },
      h('div', { class: 'row spread', style: 'margin-bottom:10px' },
        h('button', { class: 'btn small ghost', onClick: () => SH.go('history') }, '← History'),
        h('span', { class: `badge ${item.type}` }, item.type)),
      h('h1', {}, item.title),
      h('p', { class: 'sub' }, SH.fmtDate(item.createdAt) + (item.from?.title ? ` · from “${item.from.title}”` : '')));

    if (item.type === 'lesson') {
      page.append(SH.studyBody(d));
      if (d.questions?.length) page.append(h('h2', {}, 'Check what you learned'), SH.quiz(d.questions, { instant: true, onDone: (r) => api().saveAttempt(item.id, { mode: 'check', ...r }) }));
      page.append(h('div', { class: 'row', style: 'margin-top:26px' },
        h('button', { class: 'btn primary', onClick: () => SH.go('test', { lessonId: item.id }) }, 'Make a full test from this lesson')));
    } else if (item.type === 'revision') {
      page.append(SH.studyBody(d), h('h2', {}, 'Revision test'), SH.testTabs(item));
    } else {
      page.append(SH.testTabs(item));
    }
    main.replaceChildren(page);
  };

  // ---------- Settings: choose the AI ----------
  const GEMINI_MODELS = [
    ['gemini-3.5-flash', 'Balanced, thinking (recommended)'],
    ['gemini-2.5-pro', 'Deepest thinking: slowest, tightest free limit'],
    ['gemini-3.1-flash-lite', 'Fastest and lightest'],
  ];
  const KIND_LABEL = { anthropic: 'Anthropic', gemini: 'Google Gemini', openai: 'OpenAI-compatible' };

  SH.views.settings = async (main) => {
    const s = await SH.call(api().settings.get());
    if (!s) return;
    const refresh = () => SH.go('settings');
    const pick = async (id) => { if (s.activeId !== id && (await SH.call(api().settings.setActive(id)))) refresh(); };

    // A selectable card. `body` is extra content shown inside it.
    const card = ({ id, title, badge, sub, body, actions, disabled }) =>
      h('div', { class: `prov-card ${s.activeId === id ? 'active' : ''} ${disabled ? 'disabled' : ''}` },
        h('div', { class: 'row', style: 'align-items:flex-start;gap:14px' },
          h('div', { class: 'radio', title: 'Use this one', onClick: () => !disabled && pick(id) }),
          h('div', { class: 'grow' },
            h('div', { class: 'row spread' },
              h('div', {}, h('b', {}, title), ' ', badge ? h('span', { class: 'pill' }, badge) : null),
              actions ? h('div', { class: 'row' }, actions) : null),
            sub ? h('div', { class: 'muted', style: 'margin-top:2px' }, sub) : null,
            body ? h('div', { style: 'margin-top:12px' }, body) : null)));

    // 1) Gemini (Free)
    const gSel = h('select', {}, ...GEMINI_MODELS.map(([v, l]) => h('option', { value: v, selected: s.geminiModel === v || null }, `${l}`)));
    if (!GEMINI_MODELS.some(([v]) => v === s.geminiModel)) gSel.append(h('option', { value: s.geminiModel, selected: true }, s.geminiModel));
    gSel.addEventListener('change', async () => { await SH.call(api().settings.set({ geminiModel: gSel.value })); SH.toast('Saved', 'ok'); });
    const gemini = card({
      id: 'builtin', title: 'Gemini (Free)', badge: s.builtinAvailable ? 'Ready to use' : 'Not included in this copy', disabled: !s.builtinAvailable,
      sub: 'No setup. Fast and free, with usage limits shared by everyone using the app.',
      body: s.builtinAvailable
        ? h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Mode'), gSel),
            h('p', { class: 'muted', style: 'margin:0' }, 'Free-tier prompts may be used by Google to improve its products, so avoid private material.'))
        : h('p', { class: 'muted', style: 'margin:0' }, 'This copy of StudyHelp has no built-in key. Create your own option below (a free Gemini key works).'),
    });

    // 2) Ollama
    const oUrl = h('input', { type: 'text', value: s.ollamaUrl });
    const oModel = h('input', { type: 'text', value: s.ollamaModel });
    const ollama = card({
      id: 'ollama', title: 'Ollama', badge: 'Local', sub: 'Runs on your own computer: private, free, works offline. Needs Ollama installed.',
      body: h('div', {},
        h('label', { class: 'field' }, h('span', {}, 'Ollama address'), oUrl),
        h('label', { class: 'field' }, h('span', {}, 'Model (for example llama3.1 or qwen2.5)'), oModel),
        h('p', { class: 'muted' }, 'Install from ollama.com, then run  ollama pull llama3.1  in a terminal. Images are read with OCR.'),
        h('button', { class: 'btn small', onClick: async () => {
          if (await SH.call(api().settings.set({ ollamaUrl: oUrl.value, ollamaModel: oModel.value }))) SH.toast('Ollama settings saved', 'ok');
        } }, 'Save Ollama settings')),
    });

    // 3) custom options
    const customs = s.providers.map((p) => card({
      id: p.id, title: p.name, badge: KIND_LABEL[p.kind], sub: `Model: ${p.model}`,
      actions: [h('button', { class: 'btn small', onClick: () => SH.go('provider', { editId: p.id }) }, 'Edit')],
    }));

    const lang = h('select', {},
      ...[['auto', 'Same as the material'], ['English', 'English'], ['Bulgarian', 'Bulgarian']].map(([v, l]) =>
        h('option', { value: v, selected: s.language === v || null }, l)));
    lang.addEventListener('change', async () => { await SH.call(api().settings.set({ language: lang.value })); SH.toast('Saved', 'ok'); });

    // Colour theme: applied instantly, saved so it is remembered next time.
    const themeGrid = h('div', { class: 'themes' });
    const drawThemes = (current) => themeGrid.replaceChildren(...SHTheme.THEMES.map((t) =>
      h('button', { class: `theme-opt ${t.id === current ? 'active' : ''}`, onClick: async () => {
        SHTheme.apply(t.id);
        drawThemes(t.id);
        await SH.call(api().settings.set({ theme: t.id }));
      } },
        h('div', { class: 'sw', style: `background:${t.bg}` },
          h('u', { style: `background:${t.orb}` }), h('i', { style: `background:linear-gradient(90deg,${t.a1},${t.a2})` })),
        h('b', {}, t.name), h('small', {}, t.desc))));
    drawThemes(SHTheme.apply(s.theme));

    main.replaceChildren(h('div', { class: 'page' },
      ...header('Settings', 'Pick which AI StudyHelp uses. Your lessons and history are stored only on this computer.'),
      h('h3', {}, 'AI'),
      gemini, ollama, ...customs,
      h('button', { class: 'prov-card add', onClick: () => SH.go('provider', {}) }, '+  Create new option (use your own API key)'),
      h('p', { class: 'muted' }, 'With a cloud option your material is sent to that company to be processed. With Ollama nothing leaves your computer.'),
      h('h3', { style: 'margin-top:28px' }, 'Colour theme'),
      themeGrid,
      h('h3', { style: 'margin-top:28px' }, 'Output language'),
      h('div', { class: 'card' }, lang)));
  };

  // ---------- Create / edit a custom AI option ----------
  SH.views.provider = async (main, arg = {}) => {
    const settings = await SH.call(api().settings.get());
    const known = (await SH.call(api().provider.known())) || [];
    if (!settings) return;
    const existing = arg.editId ? settings.providers.find((p) => p.id === arg.editId) : null;
    if (arg.editId && !existing) {
      // The built-in key failed (or the option vanished): explain and open a blank form.
      if (arg.badKey) SH.toast('The free Gemini key is not working right now. You can create your own option here.', 'error');
      arg = {};
    }

    let kind = existing?.kind || 'gemini';
    const key = h('input', { type: 'password', autocomplete: 'off', placeholder: existing ? 'saved. Paste a new key to replace it' : 'Paste your API key here' });
    const provSel = h('select', {}, ...known.map((k) => h('option', { value: k.id }, k.name)));
    const baseUrl = h('input', { type: 'text', placeholder: 'https://api.example.com/v1' });
    const baseField = h('label', { class: 'field' }, h('span', {}, 'Provider address (API URL)'), baseUrl);
    const model = h('input', { type: 'text', placeholder: 'Model name (or check the key to pick from a list)' });
    const modelPick = h('select', { class: 'hidden', style: 'margin-top:8px', 'aria-label': 'Available models' });
    modelPick.addEventListener('change', () => { model.value = modelPick.value; });
    const name = h('input', { type: 'text', maxlength: '40', value: existing?.name || '' });
    const detected = h('div', { class: 'muted', style: 'margin-top:6px;min-height:20px' });
    const getKey = h('a', { href: '#', target: '_blank', style: 'color:var(--accent)' });
    const status = h('div', { style: 'margin-top:8px;min-height:20px' });

    const applyKnown = (k) => {
      kind = k.kind;
      provSel.value = k.id;
      if (!existing || baseUrl.value === '' || known.some((x) => x.baseUrl === baseUrl.value)) baseUrl.value = k.baseUrl;
      baseField.classList.toggle('hidden', kind !== 'openai');
      if (!name.dataset.touched && !existing) name.value = k.id === 'other' ? '' : k.name;
      getKey.textContent = k.keyUrl ? `Where do I get a ${k.name} key?` : '';
      getKey.setAttribute('href', k.keyUrl || '#');
    };

    if (existing) {
      const k = known.find((x) => x.kind === existing.kind && (existing.kind !== 'openai' || x.baseUrl === existing.baseUrl))
        || known.find((x) => x.id === 'other');
      applyKnown(k);
      baseUrl.value = existing.baseUrl;
      model.value = existing.model;
    } else {
      applyKnown(known.find((k) => k.id === 'gemini') || known[0]);
    }
    name.addEventListener('input', () => (name.dataset.touched = '1'));
    provSel.addEventListener('change', () => { applyKnown(known.find((k) => k.id === provSel.value)); modelPick.classList.add('hidden'); });

    // Work out the provider from the key as soon as it is pasted.
    let detectTimer;
    key.addEventListener('input', () => {
      clearTimeout(detectTimer);
      detectTimer = setTimeout(async () => {
        const d = key.value.trim() ? await SH.call(api().provider.detect(key.value)) : null;
        if (!d) { detected.textContent = key.value.trim() ? 'Could not recognise this key. Choose the provider below.' : ''; return; }
        applyKnown(d);
        detected.textContent = d.guess ? `Looks like ${d.name}. Not right? Change the provider below.` : `Detected: ${d.name}`;
      }, 250);
    });

    const check = async () => {
      status.className = 'muted';
      status.textContent = 'Checking the key…';
      const r = await api().provider.models({ id: existing?.id, kind, baseUrl: baseUrl.value, key: key.value });
      if (!r.ok) { status.style.color = 'var(--bad)'; status.textContent = r.error; return; }
      if (!r.data.includes(model.value)) model.value = r.data.find((m) => /flash|sonnet|haiku|small|instant|versatile|4o-mini|llama/i.test(m)) || r.data[0];
      modelPick.replaceChildren(...r.data.map((m) => h('option', { value: m, selected: m === model.value || null }, m)));
      modelPick.classList.remove('hidden');
      status.style.color = 'var(--ok)';
      status.textContent = `Key works. ${r.data.length} models found: pick one from the list or type a name.`;
    };

    const save = async () => {
      const saved = await SH.call(api().provider.save({
        id: existing?.id, name: name.value, kind, baseUrl: baseUrl.value, model: model.value, apiKey: key.value,
      }));
      if (saved) { SH.toast(existing ? 'Saved' : `"${saved.name}" created and selected`, 'ok'); SH.go('settings'); }
    };

    const remove = async () => {
      if (!(await SH.confirm(`Delete "${existing.name}"?`, 'This removes the option and its saved API key from this computer.'))) return;
      if ((await SH.call(api().provider.remove(existing.id))) != null) { SH.toast('Option deleted', 'ok'); SH.go('settings'); }
    };

    main.replaceChildren(h('div', { class: 'page' },
      h('button', { class: 'btn small ghost', style: 'margin-bottom:10px', onClick: () => SH.go('settings') }, '← Settings'),
      h('h1', {}, existing ? `Edit "${existing.name}"` : 'Create a new AI option'),
      h('p', { class: 'sub' }, existing ? 'Change the key, model or name.' : 'Paste an API key and StudyHelp works out the rest.'),
      arg.badKey && existing ? h('div', { class: 'callout' }, `The key for "${existing.name}" stopped working (wrong, expired or revoked). Paste a new key below and save.`) : null,
      h('div', { class: 'card' },
        h('label', { class: 'field' }, h('span', {}, '1. API key'), key, detected, h('div', { style: 'margin-top:6px' }, getKey)),
        h('label', { class: 'field' }, h('span', {}, '2. Provider'), provSel),
        baseField,
        h('div', { class: 'field' }, h('span', { class: 'muted', style: 'display:block;font-size:13px;margin-bottom:6px' }, '3. Model'),
          h('div', { class: 'row', style: 'align-items:flex-start' }, h('div', { class: 'grow' }, model, modelPick), h('button', { class: 'btn', onClick: check }, 'Check key & load models')), status),
        h('label', { class: 'field' }, h('span', {}, '4. Name for this option'), name),
        h('div', { class: 'row spread', style: 'margin-top:20px' },
          existing ? h('button', { class: 'btn danger', onClick: remove }, 'Delete this option') : h('span'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onClick: () => SH.go('settings') }, 'Cancel'),
            h('button', { class: 'btn primary', onClick: save }, existing ? 'Save changes' : 'Create option'))))));
  };
})(window.SH);
