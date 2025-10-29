'use client';

import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Account, createUser } from '@/lib/api-client';
import { logApiEvent } from '@/lib/error-handler';

interface CreateUserInAccountModalProps {
  account: Account;
  accounts?: Account[]; // For multi-select mode
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateUserInAccountModal({
  account,
  accounts = [],
  onClose,
  onSuccess,
}: CreateUserInAccountModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    permissionLevel: 'junior' as 'junior' | 'senior' | 'leader' | 'admin',
    accountId: account.id, // Default to the primary account
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isMultiSelect = accounts.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const targetAccountId = isMultiSelect ? formData.accountId : account.id;

      // Use API client instead of raw fetch
      const result = await createUser(targetAccountId, {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        permission_level: formData.permissionLevel,
        user_class: 'person',
      });

      // Log successful user creation
      logApiEvent(`User created: ${formData.name} (${formData.email})`, {
        domain: 'api',
        operation: 'users.create',
        metadata: {
          accountId: targetAccountId,
          userId: result.user.id,
          permissionLevel: formData.permissionLevel,
        },
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-modal-title"
        data-testid="create-user-modal"
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 id="create-user-modal-title" className="text-lg font-semibold text-white">
            Add User
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
            aria-label="Close add user modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-500/30 rounded text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Account selector (multi-select mode) */}
          {isMultiSelect && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Account</label>
              <select
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                required
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.account_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Single account display */}
          {!isMultiSelect && (
            <div className="px-4 py-3 bg-slate-900/50 border border-slate-700 rounded">
              <p className="text-sm font-medium text-slate-300">{account.name}</p>
              <p className="text-xs text-slate-500">
                {account.account_type} - {account.account_class}
              </p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="John Doe"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="john@example.com"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="••••••••"
              required
              minLength={8}
            />
            <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
          </div>

          {/* Permission Level */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Permission Level
            </label>
            <select
              value={formData.permissionLevel}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  permissionLevel: e.target.value as typeof formData.permissionLevel,
                })
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              required
            >
              <option value="junior">Junior</option>
              <option value="senior">Senior</option>
              <option value="leader">Leader</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
