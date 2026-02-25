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
      secureStorage: {
        saveToken: (key: string, token: string) => Promise<void>;
        getToken: (key: string) => Promise<string | null>;
        deleteToken: (key: string) => Promise<boolean>;
        saveApiKey: (provider: string, key: string) => Promise<void>;
        getApiKey: (provider: string) => Promise<string | null>;
        deleteApiKey: (provider: string) => Promise<boolean>;
      };
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
