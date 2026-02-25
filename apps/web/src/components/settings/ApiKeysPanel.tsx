'use client';

import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Save, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { desktopBridge } from '@/services/desktop-bridge';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', description: 'Used for GPT-4 and Embeddings' },
  { id: 'anthropic', name: 'Anthropic', description: 'Used for Claude 3 Opus/Sonnet' },
  { id: 'gemini', name: 'Google Gemini', description: 'Used for Gemini Pro 1.5' },
];

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [savedStatus, setSavedStatus] = useState<Record<string, boolean>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    const status: Record<string, boolean> = {};
    const loadedKeys: Record<string, string> = {};

    for (const provider of PROVIDERS) {
      try {
        const key = await desktopBridge.secureStorage.getApiKey(provider.id);
        if (key) {
          status[provider.id] = true;
          // Don't show the actual key by default, just empty string or placeholder
          loadedKeys[provider.id] = key; 
        } else {
          status[provider.id] = false;
          loadedKeys[provider.id] = '';
        }
      } catch (err) {
        console.error(`Failed to load key for ${provider.id}`, err);
      }
    }
    setSavedStatus(status);
    setKeys(loadedKeys);
  };

  const handleSave = async (providerId: string) => {
    const key = keys[providerId];
    if (!key) return;

    setLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      await desktopBridge.secureStorage.saveApiKey(providerId, key);
      setSavedStatus(prev => ({ ...prev, [providerId]: true }));
      // Hide key after save
      setShowKey(prev => ({ ...prev, [providerId]: false }));
    } catch (err) {
      console.error(`Failed to save key for ${providerId}`, err);
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const handleDelete = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this API Key?')) return;

    setLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      await desktopBridge.secureStorage.deleteApiKey(providerId);
      setSavedStatus(prev => ({ ...prev, [providerId]: false }));
      setKeys(prev => ({ ...prev, [providerId]: '' }));
    } catch (err) {
      console.error(`Failed to delete key for ${providerId}`, err);
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const toggleShowKey = (providerId: string) => {
    setShowKey(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Key className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-slate-100">API Keys (BYOK)</h2>
      </div>
      
      <p className="text-sm text-slate-400 mb-6 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        Your API keys are stored securely in your operating system's Keychain/Credential Vault. 
        They are never sent to Keimenon servers.
      </p>

      <div className="grid gap-4">
        {PROVIDERS.map(provider => (
          <div key={provider.id} className="bg-slate-800 border border-slate-700 rounded-lg p-5 transition-all hover:border-slate-600">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-slate-200">{provider.name}</h3>
                <p className="text-xs text-slate-500">{provider.description}</p>
              </div>
              
              {savedStatus[provider.id] ? (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs font-medium border border-green-500/20">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Securely Stored</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-700/50 text-slate-400 rounded text-xs border border-slate-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Not Configured</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey[provider.id] ? 'text' : 'password'}
                  value={keys[provider.id] || ''}
                  onChange={(e) => setKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                  placeholder={`Enter your ${provider.name} API Key`}
                  className="w-full pl-3 pr-10 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                />
                <button
                  onClick={() => toggleShowKey(provider.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showKey[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                onClick={() => handleSave(provider.id)}
                disabled={loading[provider.id] || !keys[provider.id]}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading[provider.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>

              {savedStatus[provider.id] && (
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
        ))}
      </div>
    </div>
  );
}
