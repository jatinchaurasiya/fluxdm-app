import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: any) => ipcRenderer.on(channel, listener),
  off: (channel: string, listener: any) => ipcRenderer.removeListener(channel, listener),
});
