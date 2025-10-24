'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Shield, UserCircle } from 'lucide-react';
import { errorCapture } from '@/services/error-capture.service';

export interface AccountInfo {
  accountId: string;
  accountName: string;
  role: string;
  accountType?: 'admin' | 'client';
}

export interface CurrentAccount {
  accountId: string;
  accountName: string;
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  permissionLevel: string;
}

interface AccountSwitcherProps {
  currentAccount: CurrentAccount;
  allAccounts: AccountInfo[];
  onSwitch: (accountId: string) => Promise<void>;
  className?: string;
}

const ACCOUNT_CLASS_COLORS: Record<string, string> = {
  free: 'text-gray-600',
  professional: 'text-blue-600',
  business: 'text-purple-600',
};

const resolveAccountIcon = (type?: string): LucideIcon => {
  return type === 'admin' ? Shield : UserCircle;
};

const resolveAccountType = (account?: AccountInfo | CurrentAccount): 'admin' | 'client' => {
  const rawType = account && 'accountType' in account ? account.accountType : undefined;
  return rawType?.toLowerCase() === 'admin' ? 'admin' : 'client';
};

export function AccountSwitcher({
  currentAccount,
  allAccounts,
  onSwitch,
  className = '',
}: AccountSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }

    return undefined;
  }, [isOpen]);

  const handleSwitch = async (accountId: string) => {
    if (accountId === currentAccount.accountId) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      await onSwitch(accountId);
      setIsOpen(false);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorCapture.capture(err, {
        domain: 'ui',
        operation: 'accountSwitcher.switch',
        metadata: { targetAccountId: accountId },
      });
    } finally {
      setIsSwitching(false);
    }
  };

  const currentColor = ACCOUNT_CLASS_COLORS[currentAccount.accountClass];
  const CurrentIcon = resolveAccountIcon(currentAccount.accountType);
  const containerClasses = className ? `relative ${className}` : 'relative';
  const accountNameClasses = `font-medium text-sm ${currentColor}`;

  // Filter out current account from dropdown list
  const otherAccounts = allAccounts.filter((acc) => acc.accountId !== currentAccount.accountId);

  return (
    <div className={containerClasses} ref={dropdownRef}>
      {/* Current Account Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        <CurrentIcon className="w-4 h-4 text-gray-500" />
        <div className="text-left">
          <div className={accountNameClasses}>{currentAccount.accountName}</div>
          <div className="text-xs text-gray-500">{currentAccount.permissionLevel}</div>
        </div>
        <svg
          className="w-4 h-4 text-gray-400 transition-transform"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* Current Account (shown but disabled) */}
          <div className="px-4 py-2 bg-blue-50">
            <div className="flex items-center space-x-2">
              <CurrentIcon className="w-4 h-4 text-gray-600" />
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">
                  {currentAccount.accountName}
                </div>
                <div className="text-xs text-gray-500">Current account</div>
              </div>
              <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          {/* Divider */}
          {otherAccounts.length > 0 && <div className="my-1 border-t border-gray-100" />}

          {/* Other Accounts */}
          {otherAccounts.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              {otherAccounts.map((account) => {
                const inferredType = resolveAccountType(account);
                const OtherIcon = resolveAccountIcon(inferredType);

                return (
                  <button
                    key={account.accountId}
                    onClick={() => handleSwitch(account.accountId)}
                    disabled={isSwitching}
                    className="w-full px-4 py-2 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="flex items-center space-x-2">
                      <OtherIcon className="w-4 h-4 text-gray-500" />
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">
                          {account.accountName}
                        </div>
                        <div className="text-xs text-gray-500">{account.accountType || 'User'}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              No other accounts available
            </div>
          )}

          {/* Account Settings Link (optional) */}
          <div className="border-t border-gray-100 mt-1">
            <a
              href="/settings/accounts"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>Account Settings</span>
              </div>
            </a>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isSwitching && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
}
