'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Key, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '@/lib/env.config';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password-debug`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to reset password right now.');
      }

      setSuccess('Password updated. You can log in with the new credential.');
      setEmail('');
      setNewPassword('');

      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (err: any) {
      console.error('Forgot password error:', err);
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-purple-900">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-purple-600">
            <Key className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Reset Password (Debug)</h1>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            No email needed. This insecure tool lets you set a fresh password while we debug the
            real flow.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Reset failed</p>
              <p className="text-sm text-red-400 mt-1">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-emerald-900/20 border border-emerald-500/50 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-200">Password reset</p>
              <p className="text-sm text-emerald-300 mt-1">{success}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                New password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="enter something memorable"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/30"
          >
            {isSubmitting ? 'Updating…' : 'Set new password'}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm text-slate-400">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>
          <span className="text-xs text-slate-500">Remove before production.</span>
        </div>
      </div>
    </div>
  );
}
