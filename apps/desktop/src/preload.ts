
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  secureStorage: {
    saveToken: (key: string, token: string) => ipcRenderer.invoke('auth:save-token', key, token),
    getToken: (key: string) => ipcRenderer.invoke('auth:get-token', key),
    deleteToken: (key: string) => ipcRenderer.invoke('auth:delete-token', key),
    saveApiKey: (provider: string, key: string) => ipcRenderer.invoke('settings:save-api-key', provider, key),
    getApiKey: (provider: string) => ipcRenderer.invoke('settings:get-api-key', provider),
    deleteApiKey: (provider: string) => ipcRenderer.invoke('settings:delete-api-key', provider),
  },
  ingest: {
    start: (filePath: string) => ipcRenderer.invoke('ingest:start', filePath),
    onProgress: (callback: (event: any, data: any) => void) => ipcRenderer.on('ingest:progress', callback),
    offProgress: (callback: (event: any, data: any) => void) => ipcRenderer.removeListener('ingest:progress', callback),
  }
});
