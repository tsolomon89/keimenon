/**
 * AccountSelector Component
 *
 * Shown after login when a user has multiple accounts.
 * Allows user to select which account to use for this session.
 */

import React, { useState } from 'react';

export interface UserAccount {
  accountId: string;
  accountName: string;
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  permission_level: 'junior' | 'senior' | 'leader' | 'admin';
  role_rank: number;
  status: 'active' | 'pending' | 'suspended' | 'left';
  last_accessed?: number;
}

interface AccountSelectorProps {
  accounts: UserAccount[];
  tempToken: string;
  onSelect: (accountId: string, accountPassword?: string) => Promise<void>;
  onCancel?: () => void;
}

const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  admin: '🛡️',
  client: '💼',
};

const ACCOUNT_CLASS_BADGES: Record<string, { label: string; color: string }> = {
  free: { label: 'Free', color: 'bg-gray-100 text-gray-800' },
  professional: { label: 'Pro', color: 'bg-blue-100 text-blue-800' },
  business: { label: 'Business', color: 'bg-purple-100 text-purple-800' },
};

const ROLE_LABELS: Record<string, string> = {
  junior: 'Junior',
  senior: 'Senior',
  leader: 'Team Leader',
  admin: 'Administrator',
};

export function AccountSelector({
  accounts,
  tempToken: _tempToken,
  onSelect,
  onCancel,
}: AccountSelectorProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountPassword, setAccountPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sort accounts by last_accessed (most recent first), then by name
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (a.last_accessed && b.last_accessed) {
      return b.last_accessed - a.last_accessed;
    }
    if (a.last_accessed) return -1;
    if (b.last_accessed) return 1;
    return a.accountName.localeCompare(b.accountName);
  });

  const handleAccountClick = (account: UserAccount) => {
    setSelectedAccountId(account.accountId);
    setError(null);

    // Check if account requires password (you can extend this logic)
    // For now, we'll assume accounts don't require passwords
    setShowPasswordInput(false);
  };

  const handleContinue = async () => {
    if (!selectedAccountId) {
      setError('Please select an account');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSelect(selectedAccountId, showPasswordInput ? accountPassword : undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to select account');
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && selectedAccountId) {
      handleContinue();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900">Select Account</h2>
          <p className="text-sm text-gray-600 mt-1">Choose which account you'd like to use</p>
        </div>

        {/* Account List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {sortedAccounts.map((account) => {
              const isSelected = selectedAccountId === account.accountId;
              // Defensive coding: Handle missing or invalid fields from API
              const accountClass = account.accountClass || 'free';
              const accountType = account.accountType || 'client';
              const status = account.status || 'active';
              const permission = account.permission_level || 'junior';
              
              const classBadge = ACCOUNT_CLASS_BADGES[accountClass] || ACCOUNT_CLASS_BADGES['free'];
              const icon = ACCOUNT_TYPE_ICONS[accountType] || ACCOUNT_TYPE_ICONS['client'];
              const roleLabel = ROLE_LABELS[permission] || 'Member';

              return (
                <button
                  key={account.accountId}
                  onClick={() => handleAccountClick(account)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="text-3xl mt-1">{icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-gray-900">{account.accountName || 'Unnamed Account'}</h3>
                          <span
                            className={`px-2 py-0.5 text-xs font-medium rounded ${classBadge.color}`}
                          >
                            {classBadge.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {roleLabel}
                          {account.last_accessed && (
                            <span className="text-gray-400 ml-2">
                              • Last used {new Date(account.last_accessed).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                        {status !== 'active' && (
                          <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
                            {status.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="text-blue-500">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Account Password (if needed) */}
          {showPasswordInput && (
            <div className="mt-4">
              <label
                htmlFor="account-password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Password
              </label>
              <input
                id="account-password"
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter account password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={handleContinue}
            disabled={!selectedAccountId || isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Loading...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
