/**
 * Desktop Bridge Service
 * 
 * Provides a typed interface for communicating with the Electron Main process.
 * Gracefully handles cases where the app is running in a standard browser (web mode).
 */

export interface DesktopBridge {
  isDesktop: boolean;
  getVersion(): Promise<string>;
  secureStorage: {
    saveToken(key: string, token: string): Promise<void>;
    getToken(key: string): Promise<string | null>;
    deleteToken(key: string): Promise<boolean>;
    saveApiKey(provider: string, key: string): Promise<void>;
    getApiKey(provider: string): Promise<string | null>;
    deleteApiKey(provider: string): Promise<boolean>;
  };
  ingest: {
    start(filePath: string): Promise<void>;
    onProgress(callback: (data: { stage: string; percent: number; message: string }) => void): void;
    offProgress(callback: (data: any) => void): void;
  };
}

class DesktopBridgeService implements DesktopBridge {
  
  get isDesktop(): boolean {
    return !!window.electronAPI;
  }

  async getVersion(): Promise<string> {
    if (this.isDesktop) {
      return window.electronAPI!.getVersion();
    }
    return '0.0.0-web';
  }

  secureStorage = {
    saveToken: async (key: string, token: string): Promise<void> => {
      if (this.isDesktop) {
        await window.electronAPI!.secureStorage.saveToken(key, token);
      } else {
        console.warn('SecureStorage: Running in Web Mode. Token not saved securely.');
        // Fallback or no-op? For security, maybe better to NOT save to localStorage
        sessionStorage.setItem(`mock_auth_${key}`, token);
      }
    },

    getToken: async (key: string): Promise<string | null> => {
      if (this.isDesktop) {
        return window.electronAPI!.secureStorage.getToken(key);
      } else {
        return sessionStorage.getItem(`mock_auth_${key}`);
      }
    },

    deleteToken: async (key: string): Promise<boolean> => {
      if (this.isDesktop) {
        return window.electronAPI!.secureStorage.deleteToken(key);
      } else {
        sessionStorage.removeItem(`mock_auth_${key}`);
        return true;
      }
    },

    saveApiKey: async (provider: string, key: string): Promise<void> => {
      if (this.isDesktop) {
        await window.electronAPI!.secureStorage.saveApiKey(provider, key);
      } else {
        console.warn('SecureStorage: Running in Web Mode. API Key not saved securely.');
        sessionStorage.setItem(`mock_api_key_${provider}`, key);
      }
    },

    getApiKey: async (provider: string): Promise<string | null> => {
      if (this.isDesktop) {
        return window.electronAPI!.secureStorage.getApiKey(provider);
      } else {
        return sessionStorage.getItem(`mock_api_key_${provider}`);
      }
    },

    deleteApiKey: async (provider: string): Promise<boolean> => {
      if (this.isDesktop) {
        return window.electronAPI!.secureStorage.deleteApiKey(provider);
      } else {
        sessionStorage.removeItem(`mock_api_key_${provider}`);
        return true;
      }
    }
  };

  ingest = {
    start: async (filePath: string): Promise<void> => {
      if (this.isDesktop) {
        await window.electronAPI!.ingest.start(filePath);
      } else {
        console.log('Mock Ingest started for:', filePath);
      }
    },
    onProgress: (callback: (data: any) => void) => {
      if (this.isDesktop) {
        window.electronAPI!.ingest.onProgress((event, data) => callback(data));
      }
    },
    offProgress: (callback: (data: any) => void) => {
        if (this.isDesktop) {
            window.electronAPI!.ingest.offProgress((event, data) => callback(data));
        }
    }
  };
}

export const desktopBridge = new DesktopBridgeService();
