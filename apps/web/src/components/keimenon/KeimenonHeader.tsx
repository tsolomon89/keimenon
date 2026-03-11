'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Search,
  Zap,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  Users,
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Minimize2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';
import { useImportProgress } from '@/contexts/ImportProgressContext';
import { useUIVersion } from '@/contexts/UIVersionContext';
import { AccountSwitcher } from '@/components/auth/AccountSwitcher';
import { useKeimenonStore } from '@/store/keimenonStore';
import { ENABLE_3D_RENDERER } from '@/lib/env.config';

export function KeimenonHeader() {
  const router = useRouter();
  const { user, logout, switchAccount } = useAuth();
  const { isOperatingMode } = useOperating();
  const { progress, openModal } = useImportProgress();
  const { uiVersion, toggleUIVersion } = useUIVersion();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [membershipMenuOpen, setMembershipMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const membershipMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.accountType === 'admin';

  // Prepare account switcher data
  const hasMultipleAccounts = user?.allAccounts && user.allAccounts.length > 1;
  const currentAccountForSwitcher = user
    ? {
        accountId: user.accountId,
        accountName:
          user.allAccounts?.find((acc) => acc.accountId === user.accountId)?.accountName ||
          'Current Account',
        accountType: user.accountType,
        accountClass: user.accountClass,
        permissionLevel: user.permissionLevel,
      }
    : null;

  // Get progress indicator styling
  const getProgressStyle = () => {
    if (progress.stage === 'error') {
      return {
        bg: 'bg-red-600/20',
        border: 'border-red-500/30',
        text: 'text-red-300',
        icon: 'text-red-400',
      };
    }
    if (progress.stage === 'complete') {
      return {
        bg: 'bg-green-600/20',
        border: 'border-green-500/30',
        text: 'text-green-300',
        icon: 'text-green-400',
      };
    }
    return {
      bg: 'bg-blue-600/20',
      border: 'border-blue-500/30',
      text: 'text-blue-300',
      icon: 'text-blue-400',
    };
  };

  const progressStyle = getProgressStyle();

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (membershipMenuRef.current && !membershipMenuRef.current.contains(event.target as Node)) {
        setMembershipMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Map membership to display info
  const getMembershipDisplay = () => {
    const tier = user?.accountClass || 'free';
    const colors = {
      free: {
        bg: 'bg-slate-600/20',
        border: 'border-slate-500/30',
        text: 'text-slate-300',
        icon: 'text-slate-400',
      },
      professional: {
        bg: 'bg-purple-600/20',
        border: 'border-purple-500/30',
        text: 'text-purple-300',
        icon: 'text-purple-400',
      },
      business: {
        bg: 'bg-blue-600/20',
        border: 'border-blue-500/30',
        text: 'text-blue-300',
        icon: 'text-blue-400',
      },
    };
    const labels = {
      free: 'Free',
      professional: 'Pro',
      business: 'Business',
    };

    return {
      label: labels[tier as keyof typeof labels] || 'Free',
      ...(colors[tier as keyof typeof colors] || colors.free),
    };
  };

  const membership = getMembershipDisplay();
  const searchShortcut = 'Ctrl + K';

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm flex items-center justify-between px-4 z-50">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Workspace</span>
        <ChevronRight className="w-4 h-4 text-slate-600" />
        <span className="text-white font-medium">Default Board</span>
        <ChevronRight className="w-4 h-4 text-slate-600" />
        <span className="text-slate-400">
          {ENABLE_3D_RENDERER ? '2D View' : '2D View (3D disabled)'}
        </span>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md mx-4">
        <button className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg flex items-center gap-2 text-sm text-slate-400 transition-colors">
          <Search className="w-4 h-4" />
          <span>Search or command...</span>
          <kbd className="ml-auto px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs">
            {searchShortcut}
          </kbd>
        </button>
      </div>

      {/* Right: UI Toggle, Membership & User */}
      <div className="flex items-center gap-3">
        {/* UI Version Toggle */}
        <button
          onClick={toggleUIVersion}
          className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg hover:opacity-80 transition-opacity ${
            uiVersion === 'primitives'
              ? 'bg-purple-600/20 border-purple-500/30'
              : 'bg-blue-600/20 border-blue-500/30'
          }`}
          title={uiVersion === 'primitives' ? 'Switch back to classic UI' : 'Try new primitives UI'}
        >
          <Sparkles
            className={`w-4 h-4 ${uiVersion === 'primitives' ? 'text-purple-400' : 'text-blue-400'}`}
          />
          <span
            className={`text-sm font-medium ${uiVersion === 'primitives' ? 'text-purple-300' : 'text-blue-300'}`}
          >
            {uiVersion === 'primitives' ? 'Classic UI' : 'New UI'}
          </span>
        </button>

        {/* Manual Refresh Button */}
        <button
          onClick={() => useKeimenonStore.getState().loadGraphData()}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          title="Refresh graph data"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        {/* Import Progress Indicator */}
        {progress.isProcessing && (
          <button
            onClick={openModal}
            className={`flex items-center gap-2 px-3 py-1.5 ${progressStyle.bg} border ${progressStyle.border} rounded-lg hover:opacity-80 transition-opacity cursor-pointer`}
            title="Click to view import details"
          >
            {progress.stage === 'error' ? (
              <AlertCircle className={`w-4 h-4 ${progressStyle.icon}`} />
            ) : progress.stage === 'complete' ? (
              <CheckCircle2 className={`w-4 h-4 ${progressStyle.icon}`} />
            ) : (
              <Loader2 className={`w-4 h-4 ${progressStyle.icon} animate-spin`} />
            )}
            <span className={`text-sm font-medium ${progressStyle.text}`}>{progress.message}</span>
            <span className={`text-xs ${progressStyle.text} opacity-75`}>{progress.progress}%</span>
          </button>
        )}

        {/* Account Switcher (only show if user has multiple accounts) */}
        {hasMultipleAccounts && currentAccountForSwitcher && user?.allAccounts && (
          <AccountSwitcher
            currentAccount={currentAccountForSwitcher}
            allAccounts={user.allAccounts}
            onSwitch={switchAccount}
          />
        )}

        {/* Admin Badge (when in operating mode) */}
        {isAdmin && isOperatingMode && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/20 border border-red-500/30 rounded-lg">
            <Shield className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-300">Operating Mode</span>
          </div>
        )}

        {/* Membership Badge (dropdown for admin) */}
        <div className="relative" ref={membershipMenuRef}>
          {isAdmin ? (
            <button
              onClick={() => setMembershipMenuOpen(!membershipMenuOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 ${membership.bg} border ${membership.border} rounded-lg hover:opacity-80 transition-opacity`}
            >
              <Zap className={`w-4 h-4 ${membership.icon}`} />
              <span className={`text-sm font-medium ${membership.text}`}>{membership.label}</span>
              <ChevronDown className={`w-3 h-3 ${membership.text}`} />
            </button>
          ) : (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 ${membership.bg} border ${membership.border} rounded-lg`}
            >
              <Zap className={`w-4 h-4 ${membership.icon}`} />
              <span className={`text-sm font-medium ${membership.text}`}>{membership.label}</span>
            </div>
          )}

          {/* Membership Dropdown (Admin Only) */}
          {isAdmin && membershipMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
              <div className="py-1">
                <button
                  onClick={() => {
                    // TODO: Implement tier emulation for admin testing
                    // Related: apps/web/src/contexts/AuthContext.tsx (add emulation state)
                    // See: docs/architecture/OVERVIEW.md (admin testing features)
                    setMembershipMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-slate-400" />
                    <span>Free</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    // TODO: Implement tier emulation for admin testing
                    // Related: apps/web/src/contexts/AuthContext.tsx (add emulation state)
                    // See: docs/architecture/OVERVIEW.md (admin testing features)
                    setMembershipMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" />
                    <span>Professional</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    // TODO: Implement tier emulation for admin testing
                    // Related: apps/web/src/contexts/AuthContext.tsx (add emulation state)
                    // See: docs/architecture/OVERVIEW.md (admin testing features)
                    setMembershipMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span>Business</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center transition-colors"
          >
            <User className="w-4 h-4 text-slate-400" />
          </button>

          {/* User Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
              {/* User Info */}
              <div className="px-4 py-3 border-b border-slate-700">
                <p className="text-sm font-medium text-white">{user?.email}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {user?.permissionLevel} •{' '}
                  {user?.accountType === 'admin' ? 'Admin Account' : 'Client Account'}
                </p>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={() => {
                    router.push('/account');
                    setUserMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>Account</span>
                </button>
                <button
                  onClick={() => {
                    router.push('/users');
                    setUserMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>Users</span>
                </button>
                <button
                  onClick={() => {
                    router.push('/users/' + user?.userId);
                    setUserMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Settings</span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    setUserMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
