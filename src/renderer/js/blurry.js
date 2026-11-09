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

  const wordRe = (term) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'iu');

  // Sentence ranges [start,end) over the notes (split after . ! ? … or on line breaks).
  function sentenceRanges(notes) {
    const out = [];
    const re = /[^.!?…\n]+(?:[.!?…]+|\n|$)/g;
    let m;
    while ((m = re.exec(notes))) if (m[0].trim()) out.push([m.index, m.index + m[0].length]);
    return out;
  }

  // Keeps only terms that are ONE word, with at most one hidden word per sentence. Later repeats of a
  // chosen term get blurred too (see segment), so every sentence a term appears in counts as used.
  // Earlier terms in the notes win. Also applied to old saved tests, so the rule holds on screen.
  function pickTerms(notes, terms) {
    const ranges = sentenceRanges(notes);
    const sentenceOf = (at) => ranges.findIndex(([a, b]) => at >= a && at < b);
    const found = [];
    for (const raw of terms || []) {
      const term = String(raw).trim();
      if (!term || /\s/.test(term)) continue;
      const re = new RegExp(wordRe(term).source, 'giu');
      const hits = [...notes.matchAll(re)];
      if (hits.length) found.push({ term: hits[0][0], at: hits[0].index, sentences: new Set(hits.map((h) => sentenceOf(h.index))) });
    }
    found.sort((a, b) => a.at - b.at);
    const used = new Set();
    const out = [];
    for (const f of found) {
      if (f.sentences.has(-1) || [...f.sentences].some((si) => used.has(si)) || out.some((o) => norm(o) === norm(f.term))) continue;
      f.sentences.forEach((si) => used.add(si));
      out.push(f.term);
    }
    return out;
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

  const api = { segment, isMatch, norm, levenshtein, pickTerms, sentenceRanges };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Blurry = api;
})(typeof window !== 'undefined' ? window : globalThis);
