'use strict';
// Navigation shell.
(function (SH) {
  const NAV = [
    ['lesson', 'Lesson'],
    ['test', 'Test'],
    ['revision', 'Revision'],
    ['history', 'History'],
    ['settings', 'Settings'],
  ];
  const nav = document.getElementById('nav');
  const main = document.getElementById('main');

  SH.go = async (view, arg) => {
    const active = view === 'open' ? 'history' : view;
    nav.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === active));
    main.scrollTop = 0;
    try {
      await SH.views[view](main, arg);
    } catch (e) {
      console.error(e);
      SH.toast(`Something went wrong: ${e.message}`, 'error');
    }
  };

  NAV.forEach(([id, label]) =>
    nav.append(SH.h('button', { class: 'nav-btn', dataset: { view: id }, onClick: () => SH.go(id), html: `${SH.icons[id] || SH.icons.revision}<span>${label}</span>` }))
  );

  window.studyhelp.onProgress((m) => SH.setProgress?.(m));
  SH.go('lesson');
})(window.SH);
