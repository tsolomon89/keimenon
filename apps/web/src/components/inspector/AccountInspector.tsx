'use client';

import { useState, useEffect } from 'react';
import { Building2, Users, Database, GitBranch, UserPlus, Crown, Zap } from 'lucide-react';
import { getAccountStats, Account } from '@/lib/api-client';
import { useShell } from '@/contexts/ShellContext';

interface AccountInspectorProps {
  account: Account;
  isMultiSelect?: boolean;
  onCreateUser: () => void;
}

export function AccountInspector({
  account,
  isMultiSelect = false,
  onCreateUser,
}: AccountInspectorProps) {
  const { setCanvasMode } = useShell();
  const [stats, setStats] = useState<{ nodes: number; edges: number; users: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const data = await getAccountStats(account.id);
        setStats(data);
      } catch (error) {
        console.error('Failed to load account stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [account.id]);

  const getTierIcon = () => {
    switch (account.account_class) {
      case 'business':
        return <Crown className="w-4 h-4" />;
      case 'professional':
        return <Zap className="w-4 h-4" />;
      default:
        return <Building2 className="w-4 h-4" />;
    }
  };

  const getTierColor = () => {
    switch (account.account_class) {
      case 'business':
        return 'text-blue-400';
      case 'professional':
        return 'text-purple-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6">
        {/* Account Header */}
        <div>
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Building2 className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">{account.name}</h3>
              <p className="text-sm text-slate-400">Account ID: {account.id.slice(0, 16)}...</p>
            </div>
          </div>

          {/* Tier Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 ${getTierColor()}`}
          >
            {getTierIcon()}
            <span className="text-sm font-medium capitalize">{account.account_class}</span>
          </div>
        </div>

        {/* Account Details */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase">Details</h4>
          <div className="space-y-2 bg-slate-800/50 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Account Type</span>
              <span className="text-white capitalize">{account.account_type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Account ID</span>
              <span className="text-white font-mono text-xs">{account.id.slice(0, 12)}...</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Created</span>
              <span className="text-white">
                {new Date(account.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Statistics */}
        {!loading && stats && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase">Statistics</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <Users className="w-4 h-4 text-green-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-white">{stats.users}</p>
                <p className="text-xs text-slate-400">Users</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <Database className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-white">{stats.nodes}</p>
                <p className="text-xs text-slate-400">Nodes</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <GitBranch className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <p className="text-xl font-bold text-white">{stats.edges}</p>
                <p className="text-xs text-slate-400">Edges</p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-4">
            <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase">Actions</h4>
          <button
            onClick={() => setCanvasMode('canvas')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            title="View this account's canvas"
          >
            <GitBranch className="w-4 h-4" />
            <span>View Canvas</span>
          </button>
          <button
            onClick={onCreateUser}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
            title="Add user to this account"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>

        {/* Multi-select Notice */}
        {isMultiSelect && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
            <p className="text-xs text-blue-300">
              You have multiple accounts selected. The user creation form will include an account
              selector.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
