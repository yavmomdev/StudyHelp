'use strict';
// Small DOM helpers shared by every view. All model/file text goes through textContent or esc().
window.SH = window.SH || {};

SH.esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// h('div', {class:'x', onClick: fn}, child, 'text', [more children])
SH.h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only ever fed SH.md()/SH.esc() output
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
};

// Tiny, safe markdown: paragraphs, "- " / "1. " lists, **bold**, *italic*, `code`.
SH.md = (text) => {
  const inline = (s) =>
    SH.esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const ul = line.match(/^[-*•]\s+(.*)/);
    const ol = line.match(/^\d+[.)]\s+(.*)/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push((ul || ol)[1]);
    } else if (!line) {
      flush();
      flushPara();
    } else {
      flush();
      para.push(line);
    }
  }
  flush();
  flushPara();
  return out.join('');
};

SH.toast = (msg, kind = '') => {
  const t = SH.h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 8000 : 3500);
};

SH.confirm = (title, body, okLabel = 'Delete') =>
  new Promise((resolve) => {
    const done = (v) => {
      layer.remove();
      resolve(v);
    };
    const layer = SH.h(
      'div',
      { class: 'overlay', onClick: (e) => e.target === layer && done(false) },
      SH.h('div', { class: 'modal' }, SH.h('h3', {}, title), SH.h('p', { class: 'muted' }, body),
        SH.h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:18px' },
          SH.h('button', { class: 'btn', onClick: () => done(false) }, 'Cancel'),
          SH.h('button', { class: 'btn danger', onClick: () => done(true) }, okLabel)))
    );
    document.body.append(layer);
  });

// Runs a long job behind a spinner overlay; progress messages come from the main process.
SH.busy = async (message, fn) => {
  const ov = document.getElementById('overlay');
  const msg = document.getElementById('overlay-msg');
  msg.textContent = message;
  SH.setProgress = (m) => (msg.textContent = m);
  ov.classList.remove('hidden');
  try {
    return await fn();
  } finally {
    ov.classList.add('hidden');
    SH.setProgress = null;
  }
};

// Unwraps the {ok,data|error} envelope from the main process; shows an error toast on failure.
SH.call = async (promise) => {
  const r = await promise;
  if (!r.ok) {
    SH.toast(r.error, 'error');
    // A key that stopped working sends the user straight to that option's edit page.
    if (r.code === 'BAD_KEY' && r.providerId) SH.go('provider', { editId: r.providerId, badKey: true });
    else if (r.code === 'NO_PROVIDER') SH.go('settings');
    return null;
  }
  return r.data;
};

SH.shuffle = (a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

SH.fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// "Today", "Yesterday", "3 days ago", otherwise the date.
SH.relDate = (iso) => {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return SH.fmtDate(iso);
};
