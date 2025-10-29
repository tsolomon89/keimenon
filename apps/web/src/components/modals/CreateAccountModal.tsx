'use client';

import { useState } from 'react';
import { X, Building2, AlertCircle } from 'lucide-react';

interface CreateAccountModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAccountModal({ onClose, onSuccess }: CreateAccountModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    accountName: '',
    accountEmail: '',
    accountClass: 'free' as 'free' | 'professional' | 'business',
    userName: '',
    userEmail: '',
    userPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001'}/api/v1/admin/accounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('canvas_memory_token')}`,
          },
          body: JSON.stringify({
            accountName: formData.accountName,
            accountEmail: formData.accountEmail,
            accountClass: formData.accountClass,
            userName: formData.userName,
            userEmail: formData.userEmail,
            userPassword: formData.userPassword,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create account');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Create account error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-account-modal-title"
        aria-describedby="create-account-modal-description"
        data-testid="create-account-modal"
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Building2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 id="create-account-modal-title" className="text-xl font-bold text-white">
                Create New Account
              </h2>
              <p id="create-account-modal-description" className="text-sm text-slate-400">
                Create a new client account with an initial admin user
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            disabled={isLoading}
            aria-label="Close create account modal"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Error</p>
                <p className="text-sm text-red-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Account Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Account Details</h3>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
                <div>
                  <label
                    htmlFor="accountName"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    Account Name
                  </label>
                  <input
                    id="accountName"
                    name="accountName"
                    type="text"
                    required
                    value={formData.accountName}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="Acme Corporation"
                  />
                </div>

                <div>
                  <label
                    htmlFor="accountEmail"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    Account Email
                  </label>
                  <input
                    id="accountEmail"
                    name="accountEmail"
                    type="email"
                    required
                    value={formData.accountEmail}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="admin@acme.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="accountClass"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    Account Tier
                  </label>
                  <select
                    id="accountClass"
                    name="accountClass"
                    value={formData.accountClass}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                  >
                    <option value="free">Free - Basic features</option>
                    <option value="professional">Professional - Pro features</option>
                    <option value="business">Business - Full access</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Initial User */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Initial Admin User</h3>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
                <div>
                  <label
                    htmlFor="userName"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    User Name
                  </label>
                  <input
                    id="userName"
                    name="userName"
                    type="text"
                    required
                    value={formData.userName}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label
                    htmlFor="userEmail"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    User Email
                  </label>
                  <input
                    id="userEmail"
                    name="userEmail"
                    type="email"
                    required
                    value={formData.userEmail}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="john@acme.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="userPassword"
                    className="block text-sm font-medium text-slate-300 mb-2"
                  >
                    User Password
                  </label>
                  <input
                    id="userPassword"
                    name="userPassword"
                    type="password"
                    required
                    value={formData.userPassword}
                    onChange={handleChange}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder="Minimum 6 characters"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    The user will be created with admin permissions for this account
                  </p>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
