'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ArrowLeft, Users, Database, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountStats, Account as AccountType } from '@/lib/api-client';

export default function AccountPage() {
  const router = useRouter();
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<{ nodes: number; edges: number; users: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Load account stats
  useEffect(() => {
    if (!currentUser) return;

    const loadStats = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getAccountStats(currentUser.accountId);
        setStats(data);
      } catch (err: any) {
        console.error('Failed to load account stats:', err);
        setError(err.message || 'Failed to load account stats');
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [currentUser]);

  // Show loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading account...</p>
        </div>
      </div>
    );
  }

  const getTierBadge = (tier: string) => {
    const colors = {
      free: 'bg-slate-700 text-slate-300',
      professional: 'bg-blue-700 text-blue-300',
      business: 'bg-purple-700 text-purple-300',
    };
    return colors[tier as keyof typeof colors] || colors.free;
  };

  const getAccountTypeBadge = (type: string) => {
    return type === 'admin'
      ? 'bg-red-700 text-red-300'
      : 'bg-green-700 text-green-300';
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/canvas"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Canvas
          </Link>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 rounded-lg">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Account Settings</h1>
              <p className="text-slate-400 mt-1">
                Manage your workspace account
              </p>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Account Info */}
        {currentUser && (
          <div className="space-y-6">
            {/* Account Details */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Account Details</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400">Account Type</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded text-sm font-medium ${getAccountTypeBadge(currentUser.accountType)}`}>
                      {currentUser.accountType === 'admin' && <Crown className="w-4 h-4" />}
                      {currentUser.accountType}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Plan Tier</label>
                  <div className="mt-1">
                    <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${getTierBadge(currentUser.accountClass)}`}>
                      {currentUser.accountClass}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Your Role</label>
                  <div className="mt-1">
                    <span className="text-white font-medium capitalize">
                      {currentUser.permissionLevel}
                    </span>
                    <span className="text-slate-400 text-sm ml-2">
                      (Rank {currentUser.rank}/4)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Usage Stats */}
            {stats && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Usage Statistics</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-600/20 rounded">
                        <Database className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="text-sm text-slate-400">Nodes</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{stats.nodes.toLocaleString()}</p>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-purple-600/20 rounded">
                        <Database className="w-4 h-4 text-purple-400" />
                      </div>
                      <span className="text-sm text-slate-400">Edges</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{stats.edges.toLocaleString()}</p>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-green-600/20 rounded">
                        <Users className="w-4 h-4 text-green-400" />
                      </div>
                      <span className="text-sm text-slate-400">Users</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{stats.users.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>

              <div className="space-y-3">
                <Link
                  href="/users"
                  className="flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-slate-400 group-hover:text-white" />
                    <div>
                      <p className="text-white font-medium">Manage Users</p>
                      <p className="text-sm text-slate-400">Add, edit, or remove users</p>
                    </div>
                  </div>
                  <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white rotate-180" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
