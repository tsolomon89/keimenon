'use client';

import { useState } from 'react';
import { Shield, Info, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { useOperating } from '@/contexts/OperatingContext';
import { useAuth } from '@/contexts/AuthContext';

interface PortalWrapperProps {
  children: React.ReactNode;
}

/**
 * Portal Wrapper - Admin controls overlay for Portal shell
 * Shows admin controls when operating on a client account
 */
export function PortalWrapper({ children }: PortalWrapperProps) {
  const { user } = useAuth();
  const { operating, switchAccount } = useOperating();
  const [showInfo, setShowInfo] = useState(false);

  const isAdmin = user?.accountType === 'admin';
  const hasAccountSelected = operating.accountId && operating.mode !== 'native';

  // If not in Portal mode or no account selected, keep a stable sizing wrapper.
  if (!isAdmin || !hasAccountSelected) {
    return <div className="relative flex flex-col flex-1 min-h-0 w-full">{children}</div>;
  }

  const handleToggleServiceMode = () => {
    // Toggle service mode
    switchAccount(operating.accountId!, operating.mode, {
      ...operating,
      serviceMode: !operating.serviceMode,
    });
  };

  const handleExitPortal = () => {
    // Exit operating mode (go back to native)
    switchAccount(user!.accountId, 'native');
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-0 w-full">
      {/* Admin Controls Banner - Top */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-purple-900/90 backdrop-blur-sm border-b border-purple-700">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-300" />
              <span className="text-sm font-medium text-purple-100">Portal Mode</span>
            </div>
            <div className="text-sm text-purple-300">
              Viewing:{' '}
              <span className="font-medium text-white">
                {operating.accountName || operating.accountId}
              </span>
            </div>
            {operating.accountType && (
              <div className="px-2 py-0.5 bg-purple-700/50 border border-purple-500/30 rounded text-xs text-purple-200">
                {operating.accountType}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Service Mode Toggle */}
            <button
              onClick={handleToggleServiceMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                operating.serviceMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
              title={
                operating.serviceMode ? 'Service Mode: Write access enabled' : 'Read-only mode'
              }
            >
              {operating.serviceMode ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  <span>Service Mode</span>
                </>
              ) : (
                <>
                  <Shield className="w-3 h-3" />
                  <span>Read Only</span>
                </>
              )}
            </button>

            {/* Info Button */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-1.5 hover:bg-purple-700/50 rounded text-purple-200 hover:text-white transition-colors"
              title="Portal info"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Exit Button */}
            <button
              onClick={handleExitPortal}
              className="p-1.5 hover:bg-purple-700/50 rounded text-purple-200 hover:text-white transition-colors"
              title="Exit Portal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Info Panel */}
        {showInfo && (
          <div className="border-t border-purple-700 bg-purple-800/50 p-4">
            <div className="max-w-3xl space-y-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-300 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-purple-200">
                  <p className="font-medium mb-1">Portal Mode</p>
                  <p className="text-purple-300">
                    You are viewing this account's keimenon as they would see it. Your actions are
                    tagged as admin operations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                {operating.serviceMode ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-green-300 mb-1">Service Mode Active</p>
                      <p className="text-purple-300">
                        You have write access. Changes will be logged in the audit trail with your
                        admin identity.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-300 mb-1">Read-Only Mode</p>
                      <p className="text-purple-300">
                        You can view but not modify data. Enable Service Mode to make changes.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Client Content - Offset by banner height */}
      <div className="flex-1 min-h-0 pt-10" style={{ paddingTop: showInfo ? '160px' : '40px' }}>
        {children}
      </div>
    </div>
  );
}
