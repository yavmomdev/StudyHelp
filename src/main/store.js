'use strict';
// Local JSON storage: <baseDir>/items/<id>.json for every lesson/test/revision,
// <baseDir>/settings.json for settings. No database, no network.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Secrets are stored encrypted as <name>Enc and never returned to the UI.
const SECRETS = ['apiKey', 'geminiApiKey'];

const DEFAULT_SETTINGS = {
  provider: 'anthropic', // 'anthropic' | 'gemini' | 'ollama'
  anthropicModel: 'claude-sonnet-5-5',
  apiKey: '',
  geminiModel: 'gemini-3.5-flash',
  geminiApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  language: 'auto', // 'auto' = same language as the material
};

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

  // Settings (API key is encrypted at rest when the OS supports it).
  function loadSettings() {
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      /* first run */
    }
    const s = { ...DEFAULT_SETTINGS, ...raw };
    for (const k of SECRETS) {
      s[k] = raw[`${k}Enc`] ? secrets.decrypt(raw[`${k}Enc`]) : '';
      delete s[`${k}Enc`];
    }
    return s;
  }

  function saveSettings(patch) {
    const next = { ...loadSettings() };
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (SECRETS.includes(k)) continue;
      if (patch[k] !== undefined) next[k] = String(patch[k]);
    }
    for (const k of SECRETS) {
      if (typeof patch[k] === 'string' && patch[k] !== '') next[k] = patch[k].trim();
      if (patch[`clear_${k}`]) next[k] = '';
    }
    const out = { ...next };
    for (const k of SECRETS) {
      out[`${k}Enc`] = next[k] ? secrets.encrypt(next[k]) : '';
      delete out[k];
    }
    writeAtomic(settingsFile, out);
    return next;
  }

  // What the renderer may see: never the key itself.
  function publicSettings() {
    const { apiKey, geminiApiKey, ...rest } = loadSettings();
    return { ...rest, hasApiKey: !!apiKey, hasGeminiKey: !!geminiApiKey };
  }

  return { saveItem, getItem, listItems, deleteItems, addAttempt, loadSettings, saveSettings, publicSettings };
}

module.exports = { createStore, DEFAULT_SETTINGS };
