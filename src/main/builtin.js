'use strict';
// The key behind "Gemini (Free)". It is read from src/main/builtin-key.json, which is NOT in git
// (the repo is public: a key committed there would be scraped and revoked). Copy
// builtin-key.example.json to builtin-key.json and put your key in it before running or packaging.
// The key stays in the main process and is never sent to the UI.
//
// NOTE: anything shipped inside an app can be extracted by determined users. Use a throwaway key,
// and move to a small proxy server before sharing the app widely.
let geminiKey = null;
try {
  const k = require('./builtin-key.json').geminiKey;
  if (typeof k === 'string' && k.trim() && !/^PASTE/i.test(k)) geminiKey = k.trim();
} catch {
  /* no built-in key in this copy */
}

module.exports = { geminiKey };
