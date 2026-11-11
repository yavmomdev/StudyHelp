'use strict';
// Finds links in pasted text (works in the renderer as window.Links and in Node).
// Only lines that are nothing but a link count, so a sentence that mentions a web address stays plain text.
(function (root) {
  const LINE = /^<?(https?:\/\/[^\s<>"']+)>?$/i;

  function split(text) {
    const links = [];
    const rest = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const m = line.trim().replace(/[.,;]+$/, '').match(LINE);
      if (m) links.push(m[1].replace(/[.,;)]+$/, ''));
      else rest.push(line);
    }
    return { links: [...new Set(links)], rest: rest.join('\n').trim() };
  }

  const api = { split };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Links = api;
})(typeof window !== 'undefined' ? window : globalThis);
