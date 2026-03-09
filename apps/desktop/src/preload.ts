import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),

  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================
  accounts: {
    /**
     * Get list of all stored account IDs
     */
    getAll: () => ipcRenderer.invoke('auth:get-accounts'),

    /**
     * Get the currently active account ID
     */
    getActive: () => ipcRenderer.invoke('auth:get-active-account'),

    /**
     * Switch to a different account
     * @returns Promise<{ success: boolean, accountId: string, accessToken: string }>
     */
    switch: (accountId: string) => ipcRenderer.invoke('auth:switch-account', accountId),

    /**
     * Add a new account after successful login
     * @param accountId - The account ID from the login response
     * @param accessToken - The access token from the login response
     * @param refreshToken - Optional refresh token
     */
    add: (accountId: string, accessToken: string, refreshToken?: string) =>
      ipcRenderer.invoke('auth:add-account', accountId, accessToken, refreshToken),

    /**
     * Logout from a specific account
     */
    logout: (accountId: string) => ipcRenderer.invoke('auth:logout-account', accountId),

    /**
     * Get token for a specific account
     */
    getToken: (accountId: string, key: 'access_token' | 'refresh_token') =>
      ipcRenderer.invoke('auth:get-account-token', accountId, key),

    /**
     * Update token for a specific account (e.g., after refresh)
     */
    updateToken: (accountId: string, key: 'access_token' | 'refresh_token', token: string) =>
      ipcRenderer.invoke('auth:update-account-token', accountId, key, token),

    /**
     * Migrate legacy tokens to per-account storage
     */
    migrateLegacy: (accountId: string) => ipcRenderer.invoke('auth:migrate-legacy', accountId),

    /**
     * Clear all local auth state
     */
    clearAll: () => ipcRenderer.invoke('auth:clear-all'),

    /**
     * Subscribe to account change events
     */
    onAccountChanged: (callback: (accountId: string | null) => void) => {
      const handler = (_event: any, accountId: string | null) => callback(accountId);
      ipcRenderer.on('account-changed', handler);
      // Return cleanup function
      return () => ipcRenderer.removeListener('account-changed', handler);
    },
  },

  // ==========================================================================
  // LEGACY SECURE STORAGE (for backward compatibility)
  // ==========================================================================
  secureStorage: {
    saveToken: (key: string, token: string) => ipcRenderer.invoke('auth:save-token', key, token),
    getToken: (key: string) => ipcRenderer.invoke('auth:get-token', key),
    deleteToken: (key: string) => ipcRenderer.invoke('auth:delete-token', key),
    saveApiKey: (provider: string, key: string) =>
      ipcRenderer.invoke('settings:save-api-key', provider, key),
    getApiKey: (provider: string) => ipcRenderer.invoke('settings:get-api-key', provider),
    deleteApiKey: (provider: string) => ipcRenderer.invoke('settings:delete-api-key', provider),
  },

  // ==========================================================================
  // INGESTION
  // ==========================================================================
  ingest: {
    start: (filePath: string) => ipcRenderer.invoke('ingest:start', filePath),
    onProgress: (callback: (event: any, data: any) => void) =>
      ipcRenderer.on('ingest:progress', callback),
    offProgress: (callback: (event: any, data: any) => void) =>
      ipcRenderer.removeListener('ingest:progress', callback),
  },
});

// Type declaration for renderer process
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      openDataFolder: () => Promise<string>;
      accounts: {
        getAll: () => Promise<string[]>;
        getActive: () => Promise<string | null>;
        switch: (
          accountId: string
        ) => Promise<{ success: boolean; accountId: string; accessToken: string }>;
        add: (
          accountId: string,
          accessToken: string,
          refreshToken?: string
        ) => Promise<{ success: boolean; accountId: string }>;
        logout: (accountId: string) => Promise<{ success: boolean }>;
        getToken: (
          accountId: string,
          key: 'access_token' | 'refresh_token'
        ) => Promise<string | null>;
        updateToken: (
          accountId: string,
          key: 'access_token' | 'refresh_token',
          token: string
        ) => Promise<{ success: boolean }>;
        migrateLegacy: (accountId: string) => Promise<boolean>;
        clearAll: () => Promise<{ success: boolean }>;
        onAccountChanged: (callback: (accountId: string | null) => void) => () => void;
      };
      secureStorage: {
        saveToken: (key: string, token: string) => Promise<void>;
        getToken: (key: string) => Promise<string | null>;
        deleteToken: (key: string) => Promise<boolean>;
        saveApiKey: (provider: string, key: string) => Promise<void>;
        getApiKey: (provider: string) => Promise<string | null>;
        deleteApiKey: (provider: string) => Promise<boolean>;
      };
      ingest: {
        start: (filePath: string) => Promise<any>;
        onProgress: (callback: (event: any, data: any) => void) => void;
        offProgress: (callback: (event: any, data: any) => void) => void;
      };
    };
  }
}
