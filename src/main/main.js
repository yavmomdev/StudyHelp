'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const { createStore } = require('./store');
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

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0f1117',
    title: 'StudyHelp',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Links open in the system browser, the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
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

app.whenReady().then(() => {
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
    return store.publicSettings(!!builtin.geminiKey);
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
