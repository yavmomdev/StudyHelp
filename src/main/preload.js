'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('studyhelp', {
  pickFiles: () => call('files:pick'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  createLesson: (p) => call('job:lesson', p),
  createTest: (p) => call('job:test', p),
  createRevision: (p) => call('job:revision', p),
  history: {
    list: () => call('history:list'),
    get: (id) => call('history:get', id),
    remove: (ids) => call('history:remove', ids),
  },
  saveAttempt: (id, attempt) => call('history:attempt', { id, attempt }),
  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', patch),
  },
  onProgress: (cb) => ipcRenderer.on('progress', (_e, msg) => cb(msg)),
});
