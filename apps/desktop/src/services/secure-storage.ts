import keytar from 'keytar';

const SERVICE_NAME = 'Keimenon';
const ACCOUNTS_LIST_KEY = 'account_ids';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

export interface StoredAccount {
  accountId: string;
  email?: string;
  name?: string;
}

export class SecureStorageService {
  // ==========================================================================
  // ACCOUNT MANAGEMENT
  // ==========================================================================

  /**
   * Get the active account ID
   */
  async getActiveAccountId(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, ACTIVE_ACCOUNT_KEY);
  }

  /**
   * Set the active account ID
   */
  async setActiveAccountId(accountId: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, ACTIVE_ACCOUNT_KEY, accountId);
  }

  /**
   * Clear active account ID
   */
  async clearActiveAccountId(): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, ACTIVE_ACCOUNT_KEY);
  }

  /**
   * Get list of all stored account IDs
   */
  async getStoredAccountIds(): Promise<string[]> {
    const accountsJson = await keytar.getPassword(SERVICE_NAME, ACCOUNTS_LIST_KEY);
    if (!accountsJson) return [];
    try {
      return JSON.parse(accountsJson);
    } catch {
      return [];
    }
  }

  /**
   * Add an account ID to the stored list
   */
  async addAccountToList(accountId: string): Promise<void> {
    const accounts = await this.getStoredAccountIds();
    if (!accounts.includes(accountId)) {
      accounts.push(accountId);
      await keytar.setPassword(SERVICE_NAME, ACCOUNTS_LIST_KEY, JSON.stringify(accounts));
    }
  }

  /**
   * Remove an account ID from the stored list
   */
  async removeAccountFromList(accountId: string): Promise<void> {
    const accounts = await this.getStoredAccountIds();
    const filtered = accounts.filter((id) => id !== accountId);
    await keytar.setPassword(SERVICE_NAME, ACCOUNTS_LIST_KEY, JSON.stringify(filtered));
  }

  // ==========================================================================
  // PER-ACCOUNT TOKEN STORAGE
  // ==========================================================================

  /**
   * Save an authentication token for a specific account
   */
  async saveAccountToken(
    accountId: string,
    key: 'access_token' | 'refresh_token',
    token: string
  ): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, `${accountId}_${key}`, token);
  }

  /**
   * Retrieve an authentication token for a specific account
   */
  async getAccountToken(
    accountId: string,
    key: 'access_token' | 'refresh_token'
  ): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, `${accountId}_${key}`);
  }

  /**
   * Delete an authentication token for a specific account
   */
  async deleteAccountToken(
    accountId: string,
    key: 'access_token' | 'refresh_token'
  ): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, `${accountId}_${key}`);
  }

  /**
   * Clear all tokens for a specific account
   */
  async clearAccountTokens(accountId: string): Promise<void> {
    await this.deleteAccountToken(accountId, 'access_token');
    await this.deleteAccountToken(accountId, 'refresh_token');
  }

  /**
   * Clear all stored auth data (account-scoped and legacy tokens)
   */
  async clearAllAuthData(): Promise<void> {
    const accountIds = await this.getStoredAccountIds();
    for (const accountId of accountIds) {
      await this.clearAccountTokens(accountId);
    }

    await keytar.deletePassword(SERVICE_NAME, ACCOUNTS_LIST_KEY);
    await this.clearActiveAccountId();
    await this.deleteToken('access_token');
    await this.deleteToken('refresh_token');
  }

  // ==========================================================================
  // LEGACY GLOBAL TOKEN METHODS (for backward compatibility / migration)
  // ==========================================================================

  /**
   * Save an authentication token (legacy global storage)
   * @deprecated Use saveAccountToken instead
   */
  async saveToken(key: 'access_token' | 'refresh_token', token: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, `auth_${key}`, token);
  }

  /**
   * Retrieve an authentication token (legacy global storage)
   * @deprecated Use getAccountToken instead
   */
  async getToken(key: 'access_token' | 'refresh_token'): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, `auth_${key}`);
  }

  /**
   * Delete an authentication token (legacy global storage)
   * @deprecated Use deleteAccountToken instead
   */
  async deleteToken(key: 'access_token' | 'refresh_token'): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, `auth_${key}`);
  }

  // ==========================================================================
  // MIGRATION
  // ==========================================================================

  /**
   * Migrate legacy global tokens to per-account storage
   * Call this on app startup to handle existing users
   */
  async migrateFromLegacyStorage(accountId: string): Promise<boolean> {
    const legacyAccess = await this.getToken('access_token');
    const legacyRefresh = await this.getToken('refresh_token');

    if (legacyAccess || legacyRefresh) {
      console.log('[SecureStorage] Migrating legacy tokens to account:', accountId);

      // Copy tokens to per-account storage
      if (legacyAccess) {
        await this.saveAccountToken(accountId, 'access_token', legacyAccess);
      }
      if (legacyRefresh) {
        await this.saveAccountToken(accountId, 'refresh_token', legacyRefresh);
      }

      // Add account to list and set as active
      await this.addAccountToList(accountId);
      await this.setActiveAccountId(accountId);

      // Delete legacy tokens
      await this.deleteToken('access_token');
      await this.deleteToken('refresh_token');

      return true;
    }

    return false;
  }

  // ==========================================================================
  // API KEY STORAGE (unchanged - global per provider)
  // ==========================================================================

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
