'use client';

import { useState } from 'react';
import { Save, X } from 'lucide-react';

interface UserFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    name: string;
    email: string;
    permission_level: 'junior' | 'senior' | 'leader' | 'admin';
    user_class: 'person' | 'agent';
    is_active: boolean;
  };
  onSubmit: (data: {
    name: string;
    email: string;
    password?: string;
    permission_level: 'junior' | 'senior' | 'leader' | 'admin';
    user_class: 'person' | 'agent';
    is_active?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function UserForm({ mode, initialData, onSubmit, onCancel, isLoading }: UserFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    password: '',
    confirmPassword: '',
    permission_level: initialData?.permission_level || 'junior' as 'junior' | 'senior' | 'leader' | 'admin',
    user_class: initialData?.user_class || 'person' as 'person' | 'agent',
    is_active: initialData?.is_active ?? true,
  });

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (mode === 'create' && !formData.password) {
      setError('Password is required for new users');
      return;
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      await onSubmit({
        name: formData.name,
        email: formData.email,
        password: formData.password || undefined,
        permission_level: formData.permission_level,
        user_class: formData.user_class,
        is_active: formData.is_active,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save user');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={formData.name}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="John Doe"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={handleChange}
            disabled={isLoading || mode === 'edit'}
            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="user@example.com"
          />
          {mode === 'edit' && (
            <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
            Password {mode === 'edit' && '(leave blank to keep unchanged)'}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required={mode === 'create'}
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={mode === 'create' ? 'Minimum 6 characters' : 'Leave blank to keep current'}
          />
        </div>

        {/* Confirm Password */}
        {(mode === 'create' || formData.password) && (
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required={mode === 'create' || !!formData.password}
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Re-enter password"
            />
          </div>
        )}

        {/* Permission Level */}
        <div>
          <label htmlFor="permission_level" className="block text-sm font-medium text-slate-300 mb-2">
            Permission Level
          </label>
          <select
            id="permission_level"
            name="permission_level"
            value={formData.permission_level}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="junior">Junior - Basic access</option>
            <option value="senior">Senior - Enhanced access</option>
            <option value="leader">Leader - Team management</option>
            <option value="admin">Admin - Full control</option>
          </select>
        </div>

        {/* User Class */}
        <div>
          <label htmlFor="user_class" className="block text-sm font-medium text-slate-300 mb-2">
            User Type
          </label>
          <select
            id="user_class"
            name="user_class"
            value={formData.user_class}
            onChange={handleChange}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="person">Person - Human user</option>
            <option value="agent">Agent - Automated/AI user</option>
          </select>
        </div>

        {/* Active Status (only in edit mode) */}
        {mode === 'edit' && (
          <div className="flex items-center gap-3">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={handleChange}
              disabled={isLoading}
              className="w-4 h-4 rounded border-slate-700 bg-slate-900/50 text-purple-600 focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label htmlFor="is_active" className="text-sm text-slate-300">
              User is active (can log in)
            </label>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all"
        >
          <Save className="w-4 h-4" />
          {isLoading ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
