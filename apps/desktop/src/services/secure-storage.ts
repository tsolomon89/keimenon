
import keytar from 'keytar';

const SERVICE_NAME = 'Keimenon';

export class SecureStorageService {
    
    /**
     * Save an authentication token (access_token or refresh_token)
     */
    async saveToken(key: 'access_token' | 'refresh_token', token: string): Promise<void> {
        await keytar.setPassword(SERVICE_NAME, `auth_${key}`, token);
    }

    /**
     * Retrieve an authentication token
     */
    async getToken(key: 'access_token' | 'refresh_token'): Promise<string | null> {
        return keytar.getPassword(SERVICE_NAME, `auth_${key}`);
    }

    /**
     * Delete an authentication token
     */
    async deleteToken(key: 'access_token' | 'refresh_token'): Promise<boolean> {
        return keytar.deletePassword(SERVICE_NAME, `auth_${key}`);
    }

    /**
     * Save an API Key (e.g. OpenAI, Anthropic)
     */
    async saveApiKey(provider: string, apiKey: string): Promise<void> {
        await keytar.setPassword(SERVICE_NAME, `api_key_${provider}`, apiKey);
    }

    /**
     * Get an API Key
     */
    async getApiKey(provider: string): Promise<string | null> {
        return keytar.getPassword(SERVICE_NAME, `api_key_${provider}`);
    }

    /**
     * Delete an API Key
     */
    async deleteApiKey(provider: string): Promise<boolean> {
        return keytar.deletePassword(SERVICE_NAME, `api_key_${provider}`);
    }
}

// Singleton instance
export const secureStorage = new SecureStorageService();
