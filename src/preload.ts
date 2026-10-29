import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge, Snapshot } from './shared';
const bridge: Bridge = {
  lookupProfile: (query) => ipcRenderer.invoke('isora:lookupProfile', query),
  editProfileHistory: (action, key) =>
    ipcRenderer.invoke('isora:editProfileHistory', action, key),
  profileAction: (key, action) =>
    ipcRenderer.invoke('isora:profileAction', key, action),
  userAction: (action, ref) =>
    ipcRenderer.invoke('isora:userAction', action, ref),
  snapshot: () => ipcRenderer.invoke('isora:snapshot'),
  connect: () => ipcRenderer.invoke('isora:connect'),
  disconnect: () => ipcRenderer.invoke('isora:disconnect'),
  settings: (value) => ipcRenderer.invoke('isora:settings', value),
  action: (name, value) => ipcRenderer.invoke('isora:action', name, value),
  send: (value) => ipcRenderer.invoke('isora:send', value),
  export: (kind) => ipcRenderer.invoke('isora:export', kind),
  importWardrobe: () => ipcRenderer.invoke('isora:importWardrobe'),
  subscribe: (callback) => {
    const listener = (_event: unknown, state: Snapshot) => callback(state);
    ipcRenderer.on('isora:state', listener);
    return () => ipcRenderer.removeListener('isora:state', listener);
  },
};
contextBridge.exposeInMainWorld('isora', bridge);
