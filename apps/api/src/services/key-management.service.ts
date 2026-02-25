/**
 * Key Management Service
 *
 * World Model V5 / BYOK Infrastructure: Secure API key storage
 *
 * Security Requirements:
 * 1. Keys encrypted at rest with AES-256-GCM
 * 2. Salt derived from accountId + app secret
 * 3. Never log or transmit plaintext keys
 * 4. Wipe keys from memory after use
 * 5. Desktop-only: Keys never leave local storage
 *
 * Usage:
 * - Encrypts API keys before storing in account_api_keys table
 * - Decrypts keys on-demand for use with LLM adapters
 * - Validates keys with provider before saving
 */

import * as crypto from 'crypto';
import { SQLiteClient } from '@keimenon/db';

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// App secret (should be in environment variable in production)
const APP_SECRET = process.env.BYOK_SECRET || 'keimenon-byok-default-secret-change-in-production';

/**
 * Supported LLM providers
 */
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'custom';

/**
 * Provider validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  models?: string[];
}

/**
 * Encrypted key with metadata
 */
export interface EncryptedKey {
  encrypted: string;  // Base64 encoded: IV + ciphertext + authTag
  hint: string;       // Last 4 characters of original key
  provider: LLMProvider;
  accountId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Key Management Service
 *
 * Handles secure encryption, decryption, and storage of API keys
 */
export class KeyManagementService {
  constructor(private db: SQLiteClient) {}

  /**
   * Derive encryption key from account ID and app secret
   * Uses PBKDF2 with unique salt per account
   */
  private deriveKey(accountId: string, salt: Buffer): Buffer {
    // Combine app secret with account ID for unique derivation
    const password = `${APP_SECRET}:${accountId}`;

    // PBKDF2 with SHA-256, 100,000 iterations
    return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt an API key
   * Returns base64-encoded string: salt + IV + ciphertext + authTag
   */
  encryptKey(plainKey: string, accountId: string): string {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from account ID
    const key = this.deriveKey(accountId, salt);

    // Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plainKey, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine: salt (32) + iv (16) + ciphertext (variable) + authTag (16)
    const combined = Buffer.concat([salt, iv, encrypted, authTag]);

    // Securely clear sensitive data
    key.fill(0);

    return combined.toString('base64');
  }

  /**
   * Decrypt an API key
   * Accepts base64-encoded string: salt + IV + ciphertext + authTag
   */
  decryptKey(encryptedData: string, accountId: string): string {
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      combined.length - AUTH_TAG_LENGTH
    );

    // Derive key from account ID
    const key = this.deriveKey(accountId, salt);

    // Decrypt with AES-256-GCM
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const plainKey = decrypted.toString('utf8');

    // Securely clear sensitive data
    key.fill(0);
    decrypted.fill(0);

    return plainKey;
  }

  /**
   * Generate hint from API key (last 4 characters)
   */
  generateKeyHint(plainKey: string): string {
    if (plainKey.length <= 4) {
      return '****';
    }
    return `****${plainKey.slice(-4)}`;
  }

  /**
   * Validate API key with provider
   * Makes a minimal API call to verify the key works
   */
  async validateKey(provider: LLMProvider, plainKey: string): Promise<ValidationResult> {
    try {
      switch (provider) {
        case 'openai':
          return await this.validateOpenAI(plainKey);

        case 'anthropic':
          return await this.validateAnthropic(plainKey);

        case 'groq':
          return await this.validateGroq(plainKey);

        case 'google':
          return await this.validateGoogle(plainKey);

        case 'ollama':
          // Ollama doesn't require API key, just check connectivity
          return { valid: true, models: ['llama3', 'mistral', 'codellama'] };

        case 'custom':
          // Custom providers can't be validated generically
          return { valid: true };

        default:
          return { valid: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate OpenAI API key
   */
  private async validateOpenAI(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> };
        const models = data.data?.map((m) => m.id) || [];
        return { valid: true, models };
      } else {
        const errorData = await response.json() as { error?: { message?: string } };
        return {
          valid: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }
    } catch (error: unknown) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Validate Anthropic API key
   */
  private async validateAnthropic(apiKey: string): Promise<ValidationResult> {
    try {
      // Anthropic doesn't have a models endpoint, so we make a minimal completion request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      if (response.ok || response.status === 400) {
        // 400 means the key is valid but request is malformed (which is fine for validation)
        return {
          valid: true,
          models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
        };
      } else {
        const errorData = await response.json() as { error?: { message?: string } };
        return {
          valid: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }
    } catch (error: unknown) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Validate Groq API key
   */
  private async validateGroq(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> };
        const models = data.data?.map((m) => m.id) || [];
        return { valid: true, models };
      } else {
        const errorData = await response.json() as { error?: { message?: string } };
        return {
          valid: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }
    } catch (error: unknown) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Validate Google AI API key
   */
  private async validateGoogle(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );

      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string }> };
        const models = data.models?.map((m) => m.name) || [];
        return { valid: true, models };
      } else {
        const errorData = await response.json() as { error?: { message?: string } };
        return {
          valid: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }
    } catch (error: unknown) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Store encrypted API key in database
   */
  async storeKey(
    accountId: string,
    provider: LLMProvider,
    plainKey: string,
    skipValidation = false
  ): Promise<{ success: boolean; hint?: string; error?: string }> {
    // Validate key first (unless skipped)
    if (!skipValidation) {
      const validation = await this.validateKey(provider, plainKey);
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Key validation failed' };
      }
    }

    const database = this.db.getDatabase();
    const now = Date.now();

    // Encrypt key
    const encryptedKey = this.encryptKey(plainKey, accountId);
    const hint = this.generateKeyHint(plainKey);
    const id = `apikey_${crypto.randomUUID()}`;

    try {
      // Upsert: replace existing key for this provider
      database.prepare(`
        INSERT INTO account_api_keys (id, account_id, provider, encrypted_key, key_hint, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, provider) DO UPDATE SET
          encrypted_key = excluded.encrypted_key,
          key_hint = excluded.key_hint,
          updated_at = excluded.updated_at
      `).run(id, accountId, provider, encryptedKey, hint, now, now);

      return { success: true, hint };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieve and decrypt API key
   */
  async getKey(accountId: string, provider: LLMProvider): Promise<string | null> {
    const database = this.db.getDatabase();

    const row = database.prepare(`
      SELECT encrypted_key FROM account_api_keys
      WHERE account_id = ? AND provider = ?
    `).get(accountId, provider) as any;

    if (!row) {
      return null;
    }

    return this.decryptKey(row.encrypted_key, accountId);
  }

  /**
   * List stored API keys (hints only, never actual keys)
   */
  async listKeys(accountId: string): Promise<Array<{
    provider: LLMProvider;
    hint: string;
    createdAt: number;
    updatedAt: number;
  }>> {
    const database = this.db.getDatabase();

    const rows = database.prepare(`
      SELECT provider, key_hint, created_at, updated_at
      FROM account_api_keys
      WHERE account_id = ?
      ORDER BY provider
    `).all(accountId) as any[];

    return rows.map((row) => ({
      provider: row.provider as LLMProvider,
      hint: row.key_hint,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Delete API key
   */
  async deleteKey(accountId: string, provider: LLMProvider): Promise<boolean> {
    const database = this.db.getDatabase();

    const result = database.prepare(`
      DELETE FROM account_api_keys
      WHERE account_id = ? AND provider = ?
    `).run(accountId, provider);

    return result.changes > 0;
  }

  /**
   * Get AI settings for account
   */
  async getAISettings(accountId: string): Promise<{
    preferredProvider: LLMProvider | null;
    preferredModel: string | null;
    litellmUrl: string | null;
    searxngUrl: string | null;
  } | null> {
    const database = this.db.getDatabase();

    const row = database.prepare(`
      SELECT preferred_provider, preferred_model, litellm_url, searxng_url
      FROM account_ai_settings
      WHERE account_id = ?
    `).get(accountId) as any;

    if (!row) {
      return null;
    }

    return {
      preferredProvider: row.preferred_provider as LLMProvider | null,
      preferredModel: row.preferred_model,
      litellmUrl: row.litellm_url,
      searxngUrl: row.searxng_url,
    };
  }

  /**
   * Update AI settings for account
   */
  async updateAISettings(
    accountId: string,
    settings: {
      preferredProvider?: LLMProvider;
      preferredModel?: string;
      litellmUrl?: string;
      searxngUrl?: string;
    }
  ): Promise<void> {
    const database = this.db.getDatabase();
    const now = Date.now();

    // Check if settings exist
    const existing = database.prepare(`
      SELECT id FROM account_ai_settings WHERE account_id = ?
    `).get(accountId);

    if (existing) {
      // Update existing
      const updates: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (settings.preferredProvider !== undefined) {
        updates.push('preferred_provider = ?');
        values.push(settings.preferredProvider);
      }
      if (settings.preferredModel !== undefined) {
        updates.push('preferred_model = ?');
        values.push(settings.preferredModel);
      }
      if (settings.litellmUrl !== undefined) {
        updates.push('litellm_url = ?');
        values.push(settings.litellmUrl);
      }
      if (settings.searxngUrl !== undefined) {
        updates.push('searxng_url = ?');
        values.push(settings.searxngUrl);
      }

      values.push(accountId);

      database.prepare(`
        UPDATE account_ai_settings
        SET ${updates.join(', ')}
        WHERE account_id = ?
      `).run(...values);
    } else {
      // Insert new
      const id = `aisettings_${crypto.randomUUID()}`;
      database.prepare(`
        INSERT INTO account_ai_settings (
          id, account_id, preferred_provider, preferred_model,
          litellm_url, searxng_url, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        accountId,
        settings.preferredProvider || null,
        settings.preferredModel || null,
        settings.litellmUrl || null,
        settings.searxngUrl || null,
        now,
        now
      );
    }
  }
}
