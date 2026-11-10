'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, session } = require('electron');
const path = require('path');
const { createStore, THEMES } = require('./store');
const jobs = require('./jobs');
const builtin = require('./builtin');
const providers = require('./providers');
const { SUPPORTED_EXTENSIONS } = require('./extract');

let win;
let store;

const secrets = {
  encrypt: (s) =>
    safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + s,
  decrypt: (s) => {
    if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
    return s.startsWith('raw:') ? s.slice(4) : '';
  },
};

// The window/taskbar icon follows the colour theme (assets/icons/<theme>.png).
function themeIcon(theme) {
  const t = THEMES.includes(theme) ? theme : 'cloud';
  return path.join(__dirname, '..', '..', 'assets', 'icons', t + '.png');
}
function applyIcon(theme) {
  if (win && !win.isDestroyed()) { try { win.setIcon(themeIcon(theme)); } catch { /* icon is cosmetic */ } }
}

// Window background while the page loads: matches the chosen theme so there is no flash of the wrong colour.
const THEME_BG = { cloud: '#f4f6ff', aurora: '#0b0d17', ocean: '#06121f', emerald: '#07130f', sunset: '#140b0f', graphite: '#0e0f12' };

function createWindow() {
  const theme = store.publicSettings(false).theme;
  win = new BrowserWindow({
    show: false, // shown once the first frame is ready
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: THEME_BG[theme] || THEME_BG.cloud,
    title: 'StudyHelp',
    icon: themeIcon(theme),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Links open in the system browser, the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
}

// Every handler returns {ok, data} or {ok:false, error} so the UI can show errors nicely.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, payload) => {
    try {
      return { ok: true, data: await fn(payload) };
    } catch (err) {
      console.error(`[${channel}]`, err);
      return { ok: false, error: err.message || String(err), code: err.code, providerId: err.providerId };
    }
  });
}

// Two copies running at once would overwrite each other's history files: focus the first one instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  if (!gotLock) return;
  // The app never needs camera, microphone, location, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  store = createStore(path.join(app.getPath('userData'), 'studyhelp'), secrets);
  const ctx = () => {
    const provider = store.activeProvider(builtin.geminiKey);
    if (!provider) {
      throw Object.assign(new Error('Choose an AI first: open Settings and pick Gemini (Free), Ollama or create your own option.'), { code: 'NO_PROVIDER' });
    }
    return {
      store,
      settings: store.loadSettings(),
      provider,
      onProgress: (msg) => win && !win.isDestroyed() && win.webContents.send('progress', msg),
    };
  };

  handle('files:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose study material',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Study material', extensions: SUPPORTED_EXTENSIONS.map((e) => e.slice(1)) },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths.map((p) => ({ path: p, name: path.basename(p) }));
  });

  handle('job:lesson', (p) => jobs.createLesson(p, ctx()));
  handle('job:test', (p) => jobs.createTest(p, ctx()));
  handle('job:revision', (p) => jobs.createRevision(p, ctx()));

  handle('history:list', () => store.listItems());
  handle('history:get', (id) => store.getItem(id));
  handle('history:remove', (ids) => store.deleteItems(Array.isArray(ids) ? ids : []));
  handle('history:attempt', ({ id, attempt }) => store.addAttempt(id, attempt));

  handle('settings:get', () => store.publicSettings(!!builtin.geminiKey));
  handle('settings:set', (patch) => {
    store.saveSettings(patch || {});
    const pub = store.publicSettings(!!builtin.geminiKey);
    if (patch && patch.theme) applyIcon(pub.theme);
    return pub;
  });
  handle('settings:setActive', (id) => {
    store.setActive(String(id), !!builtin.geminiKey);
    return store.publicSettings(!!builtin.geminiKey);
  });

  // Custom AI options
  handle('provider:known', () => providers.KNOWN);
  handle('provider:detect', (key) => providers.detectFromKey(key));
  handle('provider:models', ({ id, kind, baseUrl, key }) =>
    providers.listModels({ kind, baseUrl, key: (key || '').trim() || (id ? store.getProviderKey(id) : '') }));
  handle('provider:save', (p) => store.saveProvider(p || {}));
  handle('provider:delete', (id) => store.deleteProvider(String(id)));

  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
