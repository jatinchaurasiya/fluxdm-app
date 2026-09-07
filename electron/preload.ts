import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: any) => ipcRenderer.on(channel, listener),
  off: (channel: string, listener: any) => ipcRenderer.removeListener(channel, listener),
  getPathForFile: (file: File) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return (file as any).path || '';
    } catch {
      return (file as any).path || '';
    }
  },
});
