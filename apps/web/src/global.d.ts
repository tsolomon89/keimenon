/**
 * Global type definitions for window object extensions
 *
 * This file extends the Window interface to include custom properties
 * used throughout the application for operating context management.
 */

declare global {
  interface Window {
    /**
     * Current operating account ID (set by OperatingContext)
     * Used when admin users switch to operate in a client account context
     */
    __operatingAccount?: string;

    /**
     * Current operating mode (set by OperatingContext)
     * Possible values: 'native' | 'nested' | 'crm'
     */
    __operatingMode?: 'native' | 'nested' | 'crm';

    /**
     * Keyboard event reference (used for feature flag detection)
     * @deprecated Use proper event handling instead
     */
    event?: Event & { shiftKey?: boolean };

    /**
     * Electron Bridge API
     * Only available when running in the Desktop Shell
     */
    electronAPI?: {
      getVersion: () => Promise<string>;
      openDataFolder: () => Promise<string>;

      /**
       * Multi-account management
       * Supports multiple accounts on the same device with proper token isolation
       */
      accounts: {
        /** Get list of all stored account IDs */
        getAll: () => Promise<string[]>;
        /** Get the currently active account ID */
        getActive: () => Promise<string | null>;
        /** Switch to a different account */
        switch: (
          accountId: string
        ) => Promise<{ success: boolean; accountId: string; accessToken: string }>;
        /** Add a new account after successful login */
        add: (
          accountId: string,
          accessToken: string,
          refreshToken?: string
        ) => Promise<{ success: boolean; accountId: string }>;
        /** Logout from a specific account */
        logout: (accountId: string) => Promise<{ success: boolean }>;
        /** Get token for a specific account */
        getToken: (
          accountId: string,
          key: 'access_token' | 'refresh_token'
        ) => Promise<string | null>;
        /** Update token for a specific account (e.g., after refresh) */
        updateToken: (
          accountId: string,
          key: 'access_token' | 'refresh_token',
          token: string
        ) => Promise<{ success: boolean }>;
        /** Migrate legacy tokens to per-account storage */
        migrateLegacy: (accountId: string) => Promise<boolean>;
        /** Subscribe to account change events */
        onAccountChanged: (callback: (accountId: string | null) => void) => () => void;
      };

      /**
       * Legacy secure storage (backward compatible)
       * Uses active account context automatically
       */
      secureStorage: {
        saveToken: (key: string, token: string) => Promise<void>;
        getToken: (key: string) => Promise<string | null>;
        deleteToken: (key: string) => Promise<boolean>;
        saveApiKey: (provider: string, key: string) => Promise<void>;
        getApiKey: (provider: string) => Promise<string | null>;
        deleteApiKey: (provider: string) => Promise<boolean>;
      };

      /** File ingestion */
      ingest: {
        start: (filePath: string) => Promise<void>;
        onProgress: (callback: (event: any, data: any) => void) => void;
        offProgress: (callback: (event: any, data: any) => void) => void;
      };
    };
  }
}

// This export makes TypeScript treat this as a module
export {};
