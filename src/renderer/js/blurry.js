'use strict';
// Pure logic for "blurry notes" (works in the renderer as window.Blurry and in Node tests).
(function (root) {
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = (s) =>
    String(s)
      .normalize('NFC')
      .toLowerCase()
      .replace(/[.,;:!?"'“”„()\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        // swapped neighbouring letters count as one typo
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    return dp[a.length][b.length];
  }

  // Splits notes into text pieces and blanks. The FIRST occurrence of each term becomes an input;
  // later occurrences become blurred "echo" pieces so they cannot give the answer away.
  // Uses Unicode-aware boundaries because \b does not work for Cyrillic.
  function segment(notes, terms) {
    const list = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!list.length) return [{ type: 'text', value: notes }];
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${list.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const seen = new Set();
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(notes))) {
      if (m.index > last) out.push({ type: 'text', value: notes.slice(last, m.index) });
      const key = norm(m[0]);
      const first = !seen.has(key);
      seen.add(key);
      out.push({ type: first ? 'blank' : 'echo', term: m[0], key });
      last = m.index + m[0].length;
    }
    if (last < notes.length) out.push({ type: 'text', value: notes.slice(last) });
    return out;
  }

  // Case/punctuation-insensitive; tolerates one typo in longer answers.
  function isMatch(answer, term) {
    const a = norm(answer);
    const t = norm(term);
    if (!a) return false;
    if (a === t) return true;
    return t.length >= 6 && levenshtein(a, t) <= 1;
  }

  const api = { segment, isMatch, norm, levenshtein };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Blurry = api;
})(typeof window !== 'undefined' ? window : globalThis);
