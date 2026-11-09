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
    if (!s) return null;
    const missing = (s.provider === 'anthropic' && !s.hasApiKey) || (s.provider === 'gemini' && !s.hasGeminiKey);
    return missing
      ? h('div', { class: 'callout' }, 'To generate content, add your API key in ',
          h('a', { href: '#', style: 'color:var(--accent)', onClick: (e) => { e.preventDefault(); SH.go('settings'); } }, 'Settings'),
          ' — Google Gemini has a free tier, or use a local Ollama model.')
      : null;
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

  // ---------- Settings ----------
  SH.views.settings = async (main) => {
    const s = await SH.call(api().settings.get());
    if (!s) return;
    const f = (name, label, type = 'text', placeholder = '') =>
      h('label', { class: 'field' }, h('span', {}, label), h('input', { type, name, value: s[name] ?? '', placeholder }));
    const provider = h('select', { name: 'provider' },
      h('option', { value: 'gemini', selected: s.provider === 'gemini' || null }, 'Google Gemini (cloud, free tier)'),
      h('option', { value: 'anthropic', selected: s.provider === 'anthropic' || null }, 'Anthropic API (cloud, paid)'),
      h('option', { value: 'ollama', selected: s.provider === 'ollama' || null }, 'Ollama (local, private, free)'));
    const key = h('input', { type: 'password', name: 'apiKey', placeholder: s.hasApiKey ? '•••••••• saved — type to replace' : 'sk-ant-…' });
    const model = f('anthropicModel', 'Anthropic model');
    const ollamaUrl = f('ollamaUrl', 'Ollama address');
    const ollamaModel = f('ollamaModel', 'Ollama model (e.g. llama3.1, qwen2.5)');
    const lang = h('select', { name: 'language' },
      ...[['auto', 'Same as the material'], ['English', 'English'], ['Bulgarian', 'Bulgarian']].map(([v, l]) =>
        h('option', { value: v, selected: s.language === v || null }, l)));

    const GEMINI_MODELS = [
      ['gemini-3.5-flash', 'Gemini 3.5 Flash: balanced, thinking (recommended)'],
      ['gemini-2.5-pro', 'Gemini 2.5 Pro: deepest thinking, slowest, tightest free limit'],
      ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite: fastest, lightest'],
      ['gemini-2.5-flash', 'Gemini 2.5 Flash: fast thinking'],
    ];
    if (!GEMINI_MODELS.some(([v]) => v === s.geminiModel)) GEMINI_MODELS.push([s.geminiModel, s.geminiModel]);
    const gKey = h('input', { type: 'password', name: 'geminiApiKey', placeholder: s.hasGeminiKey ? '•••••••• saved — type to replace' : 'AIza…' });
    const gModel = h('select', { name: 'geminiModel' }, ...GEMINI_MODELS.map(([v, l]) => h('option', { value: v, selected: s.geminiModel === v || null }, l)));
    const gemini = h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Gemini API key'), gKey),
      h('label', { class: 'field' }, h('span', {}, 'Gemini model'), gModel),
      h('p', { class: 'muted' }, 'Free key: aistudio.google.com → Get API key. Free-tier limits apply and Google may use free-tier prompts to improve its products, so avoid private material.'),
      s.hasGeminiKey ? h('button', { class: 'btn small danger', style: 'margin-bottom:14px', onClick: async () => {
        await SH.call(api().settings.set({ clear_geminiApiKey: true })); SH.toast('Gemini key removed', 'ok'); SH.go('settings'); } }, 'Remove saved Gemini key') : null);
    const cloud = h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Anthropic API key'), key), model,
      s.hasApiKey ? h('button', { class: 'btn small danger', style: 'margin-bottom:14px', onClick: async () => {
        await SH.call(api().settings.set({ clear_apiKey: true })); SH.toast('API key removed', 'ok'); SH.go('settings'); } }, 'Remove saved key') : null);
    const local = h('div', {}, ollamaUrl, ollamaModel,
      h('p', { class: 'muted' }, 'Local models read pasted text, PDFs and Word files. Images are read with OCR (the language data downloads once).'));
    const sync = () => { cloud.classList.toggle('hidden', provider.value !== 'anthropic'); gemini.classList.toggle('hidden', provider.value !== 'gemini'); local.classList.toggle('hidden', provider.value !== 'ollama'); };
    provider.addEventListener('change', sync);
    sync();

    const val = (el) => el.querySelector('input').value.trim();
    main.replaceChildren(h('div', { class: 'page' },
      ...header('Settings', 'Your lessons and history are stored only on this computer.'),
      h('div', { class: 'card' },
        h('label', { class: 'field' }, h('span', {}, 'AI provider'), provider), gemini, cloud, local,
        h('label', { class: 'field' }, h('span', {}, 'Output language'), lang),
        h('p', { class: 'muted' }, 'With Gemini or the Anthropic API, your material is sent to that company to be processed. With Ollama nothing leaves your computer.'),
        h('button', { class: 'btn primary', onClick: async () => {
          const patch = { provider: provider.value, language: lang.value, anthropicModel: val(model), geminiModel: gModel.value, ollamaUrl: val(ollamaUrl), ollamaModel: val(ollamaModel) };
          if (key.value.trim()) patch.apiKey = key.value.trim();
          if (gKey.value.trim()) patch.geminiApiKey = gKey.value.trim();
          if (await SH.call(api().settings.set(patch))) { SH.toast('Settings saved', 'ok'); SH.go('settings'); }
        } }, 'Save'))));
  };
})(window.SH);
