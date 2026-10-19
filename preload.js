'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openPanel: () => ipcRenderer.send('widget:open-panel'),
  closePanel: () => ipcRenderer.send('widget:close-panel'),
  openDetail: () => ipcRenderer.send('widget:open-detail'),
  closeDetail: () => ipcRenderer.send('widget:close-detail'),
  hideWidget: () => ipcRenderer.send('widget:hide'),
  quit: () => ipcRenderer.send('widget:quit'),
  setPosition: (x, y, w, h) => ipcRenderer.send('widget:set-position', x, y, w, h),
  getCursor: () => ipcRenderer.invoke('widget:get-cursor'),
  getPosition: () => ipcRenderer.invoke('widget:get-position'),
  getBounds: () => ipcRenderer.invoke('widget:get-bounds'),
  setBounds: (b) => ipcRenderer.send('widget:set-bounds', b),
  getScrim: () => ipcRenderer.invoke('ui:get-scrim'),
  setScrim: (v) => ipcRenderer.send('ui:set-scrim', v),
  onMode: (cb) => ipcRenderer.on('mode', (_e, m, side) => cb(m, side)),
  tasks: {
    get: () => ipcRenderer.invoke('data:get'),
    add: (payload) => ipcRenderer.invoke('data:addTask', payload),
    update: (id, patch) => ipcRenderer.invoke('data:updateTask', id, patch),
    remove: (id) => ipcRenderer.invoke('data:deleteTask', id),
    setStage: (taskId, stageId, status) => ipcRenderer.invoke('data:setStage', taskId, stageId, status),
    appendRevision: (taskId, stages, newDeadline) =>
      ipcRenderer.invoke('data:appendRevision', taskId, stages, newDeadline),
    addStages: (taskId, stages) => ipcRenderer.invoke('data:addStages', taskId, stages),
    markDelivered: (id) => ipcRenderer.invoke('data:markDelivered', id),
    markDone: (id) => ipcRenderer.invoke('data:markDone', id),
    toggleRisk: (id) => ipcRenderer.invoke('data:toggleRisk', id),
  },
});
