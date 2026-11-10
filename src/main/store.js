'use strict';
// Local JSON storage: <baseDir>/items/<id>.json for every lesson/test/revision,
// <baseDir>/settings.json for settings. No database, no network.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINDS = ['anthropic', 'gemini', 'openai'];
const THEMES = ['cloud', 'aurora', 'ocean', 'emerald', 'sunset', 'graphite'];

// General settings. AI options live next to them: 'builtin' (Gemini Free), 'ollama', or a custom option id.
const DEFAULT_SETTINGS = {
  activeId: '',
  language: 'auto', // 'auto' = same language as the material
  theme: 'cloud', // colour theme id
  geminiModel: 'gemini-3.5-flash', // model used by the built-in Gemini (Free)
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
};
const GENERAL_KEYS = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'activeId');

// The attempt with the highest score ratio, for the progress bars on the home page and history.
function bestAttempt(attempts) {
  let best = null;
  for (const a of attempts || []) {
    if (!(a.total > 0)) continue;
    if (!best || a.score / a.total > best.score / best.total) best = { score: a.score, total: a.total };
  }
  return best;
}

function createStore(baseDir, secrets = { encrypt: (s) => s, decrypt: (s) => s }) {
  const itemsDir = path.join(baseDir, 'items');
  const settingsFile = path.join(baseDir, 'settings.json');
  fs.mkdirSync(itemsDir, { recursive: true });

  const itemFile = (id) => {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Invalid id');
    return path.join(itemsDir, `${id}.json`);
  };

  function writeAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  function saveItem(item) {
    const full = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: [], ...item };
    writeAtomic(itemFile(full.id), full);
    return full;
  }

  function getItem(id) {
    try {
      return JSON.parse(fs.readFileSync(itemFile(id), 'utf8'));
    } catch {
      return null;
    }
  }

  function listItems() {
    const out = [];
    for (const f of fs.readdirSync(itemsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const it = JSON.parse(fs.readFileSync(path.join(itemsDir, f), 'utf8'));
        out.push({
          id: it.id,
          type: it.type,
          title: it.title,
          createdAt: it.createdAt,
          meta: it.meta || {},
          attempts: (it.attempts || []).length,
          best: bestAttempt(it.attempts),
        });
      } catch {
        /* skip corrupt file */
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function deleteItems(ids) {
    let n = 0;
    for (const id of ids) {
      try {
        fs.unlinkSync(itemFile(id));
        n++;
      } catch {
        /* already gone */
      }
    }
    return n;
  }

  function addAttempt(id, attempt) {
    const it = getItem(id);
    if (!it) return false;
    it.attempts = [...(it.attempts || []), { at: new Date().toISOString(), ...attempt }].slice(-50);
    writeAtomic(itemFile(id), it);
    return true;
  }

  // ----- settings & AI options -----
  // Older versions stored one Anthropic key / one Gemini key; turn those into custom options.
  function migrate(raw) {
    if (Array.isArray(raw.customProviders)) return raw;
    const out = { ...raw, customProviders: [] };
    if (raw.apiKeyEnc) out.customProviders.push({ id: 'legacy-anthropic', name: 'Anthropic', kind: 'anthropic', baseUrl: '', model: raw.anthropicModel || 'claude-sonnet-5-5', keyEnc: raw.apiKeyEnc });
    if (raw.geminiApiKeyEnc) out.customProviders.push({ id: 'legacy-gemini', name: 'Gemini (my key)', kind: 'gemini', baseUrl: '', model: raw.geminiModel || DEFAULT_SETTINGS.geminiModel, keyEnc: raw.geminiApiKeyEnc });
    if (raw.provider === 'ollama') out.activeId = 'ollama';
    else if (raw.provider === 'gemini' && raw.geminiApiKeyEnc) out.activeId = 'legacy-gemini';
    else if (raw.provider === 'anthropic' && raw.apiKeyEnc) out.activeId = 'legacy-anthropic';
    for (const k of ['provider', 'apiKeyEnc', 'geminiApiKeyEnc', 'anthropicModel']) delete out[k];
    return out;
  }

  function readSettings() {
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      /* first run */
    }
    return { ...DEFAULT_SETTINGS, ...migrate(raw) };
  }
  const writeSettings = (s) => writeAtomic(settingsFile, s);

  const effectiveActive = (s, builtinOk) => {
    if (s.activeId === 'ollama') return 'ollama';
    if (s.activeId === 'builtin') return builtinOk ? 'builtin' : '';
    if (s.customProviders.some((p) => p.id === s.activeId)) return s.activeId;
    return builtinOk ? 'builtin' : ''; // default: the free built-in option when this copy has one
  };

  const pub = (p) => ({ id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, hasKey: !!p.keyEnc });

  // General settings only (language, built-in model, Ollama address/model).
  function loadSettings() {
    const s = readSettings();
    const out = Object.fromEntries(GENERAL_KEYS.map((k) => [k, s[k]]));
    if (!THEMES.includes(out.theme)) out.theme = DEFAULT_SETTINGS.theme;
    return out;
  }

  function saveSettings(patch) {
    const s = readSettings();
    for (const k of GENERAL_KEYS) if (patch[k] !== undefined) s[k] = String(patch[k]).trim();
    if (!THEMES.includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
    writeSettings(s);
    return loadSettings();
  }

  // What the UI may see. Keys never leave the main process.
  function publicSettings(builtinOk = false) {
    const s = readSettings();
    return {
      ...loadSettings(),
      activeId: effectiveActive(s, builtinOk),
      builtinAvailable: !!builtinOk,
      providers: s.customProviders.map(pub),
    };
  }

  function setActive(id, builtinOk = false) {
    const s = readSettings();
    const ok = id === 'ollama' || (id === 'builtin' && builtinOk) || s.customProviders.some((p) => p.id === id);
    if (!ok) throw new Error('That AI option is not available.');
    s.activeId = id;
    writeSettings(s);
  }

  // Create (no id) or update (id) a custom option. On update an empty apiKey keeps the saved key.
  function saveProvider(input) {
    const s = readSettings();
    const name = String(input.name || '').trim().slice(0, 40);
    const model = String(input.model || '').trim();
    const kind = input.kind;
    let baseUrl = String(input.baseUrl || '').trim().replace(/\/+$/, '');
    if (!name) throw new Error('Give this option a name.');
    if (!KINDS.includes(kind)) throw new Error('Unknown provider type.');
    if (!model) throw new Error('Choose or type a model.');
    if (kind === 'openai' && !/^https?:\/\//i.test(baseUrl)) throw new Error('Enter the provider address, e.g. https://api.example.com/v1');
    if (kind !== 'openai') baseUrl = '';
    const existing = input.id ? s.customProviders.find((p) => p.id === input.id) : null;
    if (input.id && !existing) throw new Error('That option no longer exists.');
    const newKey = String(input.apiKey || '').trim();
    if (!existing && !newKey) throw new Error('Paste your API key.');
    const rec = {
      id: existing ? existing.id : crypto.randomUUID(),
      name, kind, baseUrl, model,
      keyEnc: newKey ? secrets.encrypt(newKey) : existing.keyEnc,
    };
    if (existing) s.customProviders = s.customProviders.map((p) => (p.id === rec.id ? rec : p));
    else {
      s.customProviders.push(rec);
      s.activeId = rec.id; // a freshly created option becomes the one in use
    }
    writeSettings(s);
    return pub(rec);
  }

  function deleteProvider(id) {
    const s = readSettings();
    const before = s.customProviders.length;
    s.customProviders = s.customProviders.filter((p) => p.id !== id);
    if (s.activeId === id) s.activeId = '';
    writeSettings(s);
    return before - s.customProviders.length;
  }

  // The saved key of a custom option (main process only), e.g. to re-test it while editing.
  function getProviderKey(id) {
    const p = readSettings().customProviders.find((x) => x.id === id);
    return p?.keyEnc ? secrets.decrypt(p.keyEnc) : '';
  }

  // The provider object the AI layer uses, or null when nothing usable is chosen.
  function activeProvider(builtinKey) {
    const s = readSettings();
    const id = effectiveActive(s, !!builtinKey);
    if (id === 'builtin') return { id, name: 'Gemini (Free)', kind: 'gemini', model: s.geminiModel, key: builtinKey };
    if (id === 'ollama') return { id, name: 'Ollama', kind: 'ollama', baseUrl: s.ollamaUrl, model: s.ollamaModel };
    const p = s.customProviders.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, key: p.keyEnc ? secrets.decrypt(p.keyEnc) : '' } : null;
  }

  return {
    saveItem, getItem, listItems, deleteItems, addAttempt,
    loadSettings, saveSettings, publicSettings, setActive,
    saveProvider, deleteProvider, getProviderKey, activeProvider,
  };
}

module.exports = { createStore, DEFAULT_SETTINGS, THEMES };
