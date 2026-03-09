'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, ArrowRight, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AccountSelector, type UserAccount } from '@/components/auth/AccountSelector';

// Separate component for reading search params (must be wrapped in Suspense)
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, selectAccount, isAuthenticated, isLoading: authLoading } = useAuth(); // rename to avoid clash
  const [isLoading, setIsLoading] = useState(false);

  console.log('[LoginPage] Render. AuthLoading:', authLoading, 'IsAuthenticated:', isAuthenticated);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Account selection state
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<UserAccount[]>([]);
  const [tempToken, setTempToken] = useState<string | null>(null);

  // Check if user was redirected due to token expiration
  const isExpired = searchParams.get('reason') === 'expired';

  // Redirect if already authenticated (in useEffect to avoid render-time navigation)
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/keimenon');
    }
  }, [isAuthenticated, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await login(email, password);

      // Check for account selection requirements
      if (
        result &&
        result.requiresAccountSelection &&
        result.availableAccounts &&
        result.tempToken
      ) {
        setAvailableAccounts(result.availableAccounts);
        setTempToken(result.tempToken);
        setShowAccountSelector(true);
        setIsLoading(false); // Stop loading to show selector
        return;
      }

      // Router push handled by AuthContext for direct login
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err.message === 'Account is locked') {
        setError('Account is locked due to too many failed attempts. Please try again later.');
      } else {
        setError(err.message || 'Login failed. Please check your credentials.');
      }
      setIsLoading(false);
    }
  };

  const handleAccountSelect = async (accountId: string, accountPassword?: string) => {
    if (!tempToken) return;

    setIsLoading(true);
    setError(null);

    try {
      await selectAccount(tempToken, accountId, accountPassword);
      // Router push handled by AuthContext
    } catch (err: any) {
      console.error('Account selection failed:', err);
      setError(err.message || 'Failed to select account');
      setIsLoading(false);
      // Keep selector open on error? Or close it?
      // Usually keep it open so they can try another account or retry password
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="w-full max-w-md space-y-8 p-8">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-purple-600">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Keimenon</h1>
          <p className="text-slate-400">Sign in to your workspace</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          {/* Session expired notification */}
          {isExpired && (
            <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-300">Session Expired</p>
                <p className="text-sm text-yellow-400 mt-1">
                  Your session has expired. Please log in again to continue.
                </p>
              </div>
            </div>
          )}

          {/* Login error notification */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Login Failed</p>
                <p className="text-sm text-red-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="admin@admin.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="any password"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-purple-300 hover:text-purple-200 transition-colors"
            >
              Forgot password? (debug)
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/30"
          >
            {isLoading ? (
              'Signing in...'
            ) : (
              <>
                Sign In
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {/* Dev Controls (only visible when explicitly enabled via query param) */}
          {searchParams.get('dev') === 'true' && (
            <div className="pt-6 border-t border-slate-700 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest text-center">
                Dev Controls
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      // Dynamic port from query param (injected by Electron) or default
                      const port = searchParams.get('apiPort') || '4001';
                      // Hit the Dev Login endpoint via fetch since context login() is for standard auth
                      const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/dev/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: 'dev@keimenon.local' }),
                      });
                      const data = await res.json();
                      if (data.token) {
                        // Manually trigger context update? Or just reload.
                        // For now, simpler to just start the standard login with dev credentials
                        // assuming the standard login() hits the same API which proxies to localhost:apiPort?
                        // Actually, client points to Next.js API, which needs to know where to proxy.
                        // But for Dev Login specifically, we are bypassing the proxy to hit the backend directly (or we should update proxy config).
                        // For now, let's assume standard login() works if we use dev creds:
                        setEmail('dev@keimenon.local');
                        setPassword('DevPass123!');
                      }
                    } catch (e) {
                      console.error(e);
                    }
                    // Always pre-fill even if fetch fails, as user might want to try manually
                    setEmail('dev@keimenon.local');
                    setPassword('DevPass123!');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-600"
                >
                  🚀 Auto-Fill Dev
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Invoke IPC
                    if ((window as any).electronAPI) {
                      (window as any).electronAPI.invoke('app:open-data-folder');
                    } else {
                      alert('Not in Electron environment');
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-600"
                >
                  📂 Open Data
                </button>
              </div>
            </div>
          )}
        </form>

        <div className="text-center text-sm text-slate-400">
          <p>
            Don't have an account?{' '}
            <Link
              href="/register"
              className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
            >
              Create one here
            </Link>
          </p>
          <p className="mt-3 text-xs text-slate-500">Development: admin@admin.com (any password)</p>
        </div>
      </div>

      {/* Account Selector Modal */}
      {showAccountSelector && tempToken && (
        <AccountSelector
          accounts={availableAccounts}
          tempToken={tempToken}
          onSelect={handleAccountSelect}
          onCancel={() => {
            setShowAccountSelector(false);
            setTempToken(null);
            setAvailableAccounts([]);
          }}
        />
      )}
    </div>
  );
}

// Wrap LoginForm in Suspense to satisfy Next.js 14.2+ requirement for useSearchParams()
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="text-white">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
