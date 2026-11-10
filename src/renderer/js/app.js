'use strict';
// Navigation shell.
(function (SH) {
  const NAV = [
    ['study', 'Study'],
    ['revision', 'Revision'],
    ['history', 'History'],
    ['settings', 'Settings'],
  ];
  const nav = document.getElementById('nav');
  const main = document.getElementById('main');

  SH.go = async (view, arg) => {
    const active = view === 'open' ? 'history' : view === 'provider' ? 'settings' : view;
    nav.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === active));
    main.scrollTop = 0;
    try {
      await SH.views[view](main, arg);
    } catch (e) {
      console.error(e);
      SH.toast(`Something went wrong: ${e.message}`, 'error');
    }
  };

  nav.append(SH.h('button', { class: 'logo', title: 'StudyHelp', onClick: () => SH.go('study') }, SH.h('img', { src: 'img/logo.svg', alt: 'StudyHelp' })));
  NAV.forEach(([id, label]) =>
    nav.append(SH.h('button', { class: 'nav-btn', dataset: { view: id }, onClick: () => SH.go(id) }, label))
  );

  window.studyhelp.onProgress((m) => SH.setProgress?.(m));
  // The saved setting is the source of truth for the theme (localStorage only avoids a flash on startup).
  window.studyhelp.settings.get().then((r) => r.ok && SHTheme.apply(r.data.theme));
  SH.go('study');
})(window.SH);
