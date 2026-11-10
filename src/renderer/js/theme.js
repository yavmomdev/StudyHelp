'use strict';
// Colour themes. The chosen theme is saved in the app settings (so it survives restarts) and mirrored in
// localStorage so it is applied before the first paint (no flash of the wrong colours on startup).
(function (root) {
  const THEMES = [
    { id: 'cloud', name: 'Cloud', desc: 'Light, soft pastel (default)', bg: '#f4f6ff', a1: '#6366f1', a2: '#8b5cf6', orb: '#a5b4fc' },
    { id: 'aurora', name: 'Aurora', desc: 'Indigo to violet', bg: '#0b0d17', a1: '#6366f1', a2: '#a855f7', orb: '#5b5bff' },
    { id: 'ocean', name: 'Ocean', desc: 'Cyan to deep blue', bg: '#06121f', a1: '#0ea5e9', a2: '#2563eb', orb: '#0ea5e9' },
    { id: 'emerald', name: 'Emerald', desc: 'Green on near-black', bg: '#07130f', a1: '#10b981', a2: '#22c55e', orb: '#10b981' },
    { id: 'sunset', name: 'Sunset', desc: 'Orange to pink', bg: '#140b0f', a1: '#f97316', a2: '#ec4899', orb: '#f97316' },
    { id: 'graphite', name: 'Graphite + Lime', desc: 'Minimal, one sharp accent', bg: '#0e0f12', a1: '#a3e635', a2: '#65a30d', orb: '#3f3f46' },
  ];
  const DEFAULT = 'cloud';
  const KEY = 'studyhelp-theme';
  const valid = (id) => THEMES.some((t) => t.id === id);

  function apply(id) {
    const t = valid(id) ? id : DEFAULT;
    root.document.documentElement.dataset.theme = t;
    try { root.localStorage.setItem(KEY, t); } catch { /* storage may be unavailable: harmless */ }
    return t;
  }
  function cached() {
    try { return root.localStorage.getItem(KEY); } catch { return null; }
  }

  root.SHTheme = { THEMES, DEFAULT, apply, valid };
  apply(cached()); // instant, before anything is drawn
})(window);
