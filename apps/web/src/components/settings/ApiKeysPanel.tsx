'use client';

import { useState, useEffect } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  Save,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/env.config';
import { authenticatedFetch } from '@/lib/api-client';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'Used for GPT-4 and Embeddings' },
  { id: 'anthropic', name: 'Anthropic', description: 'Used for Claude 3 Opus/Sonnet' },
  { id: 'google', name: 'Google Gemini', description: 'Used for Gemini Pro 1.5' },
  { id: 'groq', name: 'Groq', description: 'Used for fast Llama and Mixtral inference' },
];

interface StoredKey {
  provider: string;
  hint: string;
  createdAt: number;
  updatedAt: number;
}

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [storedKeys, setStoredKeys] = useState<Record<string, StoredKey>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<
    Record<string, { valid: boolean; error?: string } | null>
  >({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const getToken = () => localStorage.getItem('keimenon_token');

  const getResponseErrorMessage = async (response: Response, fallback: string) => {
    const payload = await response.json().catch(() => ({}) as Record<string, unknown>);
    const baseMessage =
      typeof payload?.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : fallback;

    if (payload?.code === 'SETTINGS_SCHEMA_DRIFT') {
      const remediation = (payload as any)?.diagnostics?.remediation;
      if (typeof remediation === 'string' && remediation.trim().length > 0) {
        return `${baseMessage}. ${remediation}`;
      }
    }

    return baseMessage;
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      setInitialLoading(true);
      setError(null);
      const token = getToken();
      if (!token) return;

      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/api-keys`);

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, 'Failed to load API keys'));
      }

      const data = await response.json();
      const stored: Record<string, StoredKey> = {};
      for (const key of data.keys || []) {
        stored[key.provider] = key;
      }
      setStoredKeys(stored);
    } catch (err: any) {
      console.error('Failed to load API keys:', err);
      setError(err.message || 'Failed to load API keys');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleTest = async (providerId: string) => {
    const apiKey = keys[providerId];
    if (!apiKey) return;

    setTesting((prev) => ({ ...prev, [providerId]: true }));
    setTestResult((prev) => ({ ...prev, [providerId]: null }));

    try {
      const token = getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/api-keys/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const data = await response.json();
      setTestResult((prev) => ({
        ...prev,
        [providerId]: { valid: data.valid, error: data.error },
      }));
    } catch (err: any) {
      setTestResult((prev) => ({
        ...prev,
        [providerId]: { valid: false, error: err.message || 'Test failed' },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSave = async (providerId: string) => {
    const apiKey = keys[providerId];
    if (!apiKey) return;

    setLoading((prev) => ({ ...prev, [providerId]: true }));
    try {
      const token = getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: providerId, apiKey, skipValidation: false }),
      });

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, 'Failed to save API key'));
      }

      const data = await response.json();

      // Update stored keys state
      setStoredKeys((prev) => ({
        ...prev,
        [providerId]: {
          provider: providerId,
          hint: data.hint || apiKey.slice(-4),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }));

      // Clear input and hide key
      setKeys((prev) => ({ ...prev, [providerId]: '' }));
      setShowKey((prev) => ({ ...prev, [providerId]: false }));
      setTestResult((prev) => ({ ...prev, [providerId]: null }));
    } catch (err: any) {
      console.error(`Failed to save key for ${providerId}`, err);
      setTestResult((prev) => ({
        ...prev,
        [providerId]: { valid: false, error: err.message },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this API Key?')) return;

    setLoading((prev) => ({ ...prev, [providerId]: true }));
    try {
      const token = getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/v1/settings/api-keys/${providerId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, 'Failed to delete API key'));
      }

      setStoredKeys((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      setKeys((prev) => ({ ...prev, [providerId]: '' }));
      setTestResult((prev) => ({ ...prev, [providerId]: null }));
    } catch (err: any) {
      console.error(`Failed to delete key for ${providerId}`, err);
    } finally {
      setLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const toggleShowKey = (providerId: string) => {
    setShowKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading API keys...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Key className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-slate-100">API Keys (BYOK)</h2>
      </div>

      <p className="text-sm text-slate-400 mb-6 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        Your API keys are encrypted with AES-256-GCM and stored securely on the server. Keys are
        validated with the provider before being saved.
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {PROVIDERS.map((provider) => {
          const stored = storedKeys[provider.id];
          const result = testResult[provider.id];

          return (
            <div
              key={provider.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-5 transition-all hover:border-slate-600"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-200">{provider.name}</h3>
                  <p className="text-xs text-slate-500">{provider.description}</p>
                </div>

                {stored ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium border border-green-500/20">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Stored (••••{stored.hint})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 text-slate-400 rounded text-xs border border-slate-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Not Configured</span>
                  </div>
                )}
              </div>

              {/* Test result banner */}
              {result && (
                <div
                  className={`mb-3 px-3 py-2 rounded text-xs flex items-center gap-2 ${
                    result.valid
                      ? 'bg-green-600/10 border border-green-500/30 text-green-300'
                      : 'bg-red-600/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  {result.valid ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> Key is valid
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{' '}
                      {result.error || 'Validation failed'}
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey[provider.id] ? 'text' : 'password'}
                    value={keys[provider.id] || ''}
                    onChange={(e) =>
                      setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))
                    }
                    placeholder={
                      stored ? 'Enter new key to replace' : `Enter your ${provider.name} API Key`
                    }
                    className="w-full pl-3 pr-10 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                  />
                  <button
                    onClick={() => toggleShowKey(provider.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showKey[provider.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Test button */}
                <button
                  onClick={() => handleTest(provider.id)}
                  disabled={testing[provider.id] || !keys[provider.id]}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Test key validity"
                >
                  {testing[provider.id] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FlaskConical className="w-4 h-4" />
                  )}
                  Test
                </button>

                {/* Save button */}
                <button
                  onClick={() => handleSave(provider.id)}
                  disabled={loading[provider.id] || !keys[provider.id]}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading[provider.id] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>

                {/* Delete button */}
                {stored && (
                  <button
                    onClick={() => handleDelete(provider.id)}
                    disabled={loading[provider.id]}
                    className="p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded transition-colors"
                    title="Remove Key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
