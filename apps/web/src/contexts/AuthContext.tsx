'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKeimenonStore } from '@/store/keimenonStore';
import { logApiEvent } from '@/lib/error-handler';

interface AccountInfo {
  accountId: string;
  accountName: string;
  role: string;
}

interface User {
  userId: string;
  accountId: string;
  email: string;
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  rank: number;
  overrides?: Record<string, boolean>;
  sessionId?: string;
  allAccounts?: AccountInfo[];
}

interface UserAccount {
  accountId: string;
  accountName: string;
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  permission_level: 'junior' | 'senior' | 'leader' | 'admin';
  role_rank: number;
  status: 'active' | 'pending' | 'suspended' | 'left';
  last_accessed?: number;
}

interface LoginResult {
  requiresAccountSelection?: boolean;
  availableAccounts?: UserAccount[];
  tempToken?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult | void>;
  selectAccount: (tempToken: string, accountId: string, accountPassword?: string) => Promise<void>;
  switchAccount: (accountId: string, accountPassword?: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    accountClass?: 'free' | 'professional' | 'business'
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
}

import { API_BASE_URL } from '@/lib/env.config';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'keimenon_token';

/**
 * CRITICAL FIX #4: Get test headers for E2E test isolation
 * Reads X-Test-DB-Path from window (injected by Playwright) and includes it in requests
 * This ensures frontend fetch() calls use the correct worker-specific test database
 */
function getTestHeaders(): Record<string, string> {
  const testHeaders: Record<string, string> = {};

  // Check if we're in test mode (Playwright injects this)
  if (typeof window !== 'undefined' && (window as any).__TEST_DB_PATH__) {
    testHeaders['X-Test-DB-Path'] = (window as any).__TEST_DB_PATH__;
  }

  return testHeaders;
}

/**
 * Decode JWT payload (base64)
 * Returns null if invalid
 */
function decodeJWT(token: string): any {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Check if JWT is expired
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return true;

  // exp is in seconds, Date.now() is in milliseconds
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * Parse user from JWT payload (M:N aware)
 */
function parseUserFromToken(token: string): User | null {
  const payload = decodeJWT(token);
  if (!payload) return null;

  return {
    userId: payload.userId,
    accountId: payload.accountId,
    email: payload.email,
    permissionLevel: payload.permissionLevel,
    accountType: payload.accountType,
    accountClass: payload.accountClass,
    rank: payload.rank || 1,
    overrides: payload.overrides,
    sessionId: payload.sessionId,
    allAccounts: payload.allAccounts,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  /**
   * Load user from stored token on mount
   */
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    console.log('[AuthContext] Init check. Token present:', !!token);

    if (!token) {
      console.log('[AuthContext] No token, stopping load.');
      setIsLoading(false);
      return;
    }

    // Check if token is expired
    if (isTokenExpired(token)) {
      console.log('Token expired, clearing storage');
      localStorage.removeItem(TOKEN_KEY);
      setIsLoading(false);
      return;
    }

    // Parse user from token
    const parsedUser = parseUserFromToken(token);
    if (parsedUser) {
      setUser(parsedUser);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }

    setIsLoading(false);
  }, []);

  /**
   * Reset keimenon store when account changes
   */
  useEffect(() => {
    if (user && user.accountId) {
      const currentAccountId = useKeimenonStore.getState().currentAccountId;

      // If account changed (or first login), reset keimenon store
      if (currentAccountId && currentAccountId !== user.accountId) {
        console.log(
          `🔄 Account switched from ${currentAccountId} to ${user.accountId} - resetting keimenon store`
        );
        useKeimenonStore.getState().reset();
      }

      // Update stored account ID
      useKeimenonStore.getState().setCurrentAccountId(user.accountId);
    }
  }, [user?.accountId]);

  /**
   * Login user with email and password (M:N aware)
   * Returns LoginResult if account selection is needed
   */
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult | void> => {
      setIsLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getTestHeaders(), // CRITICAL FIX #4: Include test DB path for E2E isolation
          },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();

        // Check if account selection is required (multi-account user)
        if (data.requiresAccountSelection) {
          setIsLoading(false);
          return {
            requiresAccountSelection: true,
            availableAccounts: data.availableAccounts,
            tempToken: data.tempToken,
          };
        }

        // Single account - direct login
        const { token } = data;

        if (!token) {
          throw new Error('No token received from server');
        }

        // Store token
        localStorage.setItem(TOKEN_KEY, token);

        // Parse and set user
        const parsedUser = parseUserFromToken(token);
        if (!parsedUser) {
          throw new Error('Failed to parse user from token');
        }

        setUser(parsedUser);
        setIsLoading(false);

        console.log('Login successful:', {
          email: parsedUser.email,
          accountId: parsedUser.accountId,
          rank: parsedUser.rank,
          accountType: parsedUser.accountType,
        });

        // Redirect to keimenon
        router.push('/keimenon');
      } catch (error: any) {
        setIsLoading(false);
        console.error('Login error:', error);
        throw error;
      }
    },
    [router]
  );

  /**
   * Register new user account
   */
  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      accountClass: 'free' | 'professional' | 'business' = 'free'
    ) => {
      // TODO: Add client-side validation for registration fields
      // Related: apps/web/src/app/register/page.tsx (registration form)
      // See: docs/features/INPUT_VALIDATION.md (needs creation)
      // Validate: email format, password strength, name length, accountClass enum
      setIsLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            name,
            accountType: 'client', // New registrations are always client accounts
            accountClass,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          // Server returned an error response
          throw new Error(error.error || 'Registration failed. Please try again.');
        }

        const data = await response.json();
        const { token } = data;

        if (!token) {
          throw new Error('No token received from server');
        }

        // Store token
        localStorage.setItem(TOKEN_KEY, token);

        // Parse and set user
        const parsedUser = parseUserFromToken(token);
        if (!parsedUser) {
          throw new Error('Failed to parse user from token');
        }

        setUser(parsedUser);
        setIsLoading(false);

        console.log('Registration successful:', {
          email: parsedUser.email,
          accountType: parsedUser.accountType,
          accountClass: parsedUser.accountClass,
        });

        // Redirect to keimenon
        router.push('/keimenon');
      } catch (error: any) {
        setIsLoading(false);
        console.error('Registration error:', error);

        // Detect network errors (connection failures, timeouts, etc.)
        if (
          error instanceof TypeError &&
          (error.message.includes('fetch') || error.message.includes('NetworkError'))
        ) {
          throw new Error('Network error. Please check your connection and try again.');
        }

        // Re-throw other errors (server errors, validation errors, etc.)
        throw error;
      }
    },
    [router]
  );

  /**
   * Select account after multi-account login
   */
  const selectAccount = useCallback(
    async (tempToken: string, accountId: string, accountPassword?: string) => {
      setIsLoading(true);

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/select-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken, accountId, accountPassword }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Account selection failed');
        }

        const data = await response.json();
        const { token } = data;

        if (!token) {
          throw new Error('No token received from server');
        }

        // Store token
        localStorage.setItem(TOKEN_KEY, token);

        // Parse and set user
        const parsedUser = parseUserFromToken(token);
        if (!parsedUser) {
          throw new Error('Failed to parse user from token');
        }

        setUser(parsedUser);
        setIsLoading(false);

        console.log('Account selected:', {
          accountId: parsedUser.accountId,
          email: parsedUser.email,
        });

        // Redirect to keimenon
        router.push('/keimenon');
      } catch (error: any) {
        setIsLoading(false);
        console.error('Account selection error:', error);
        throw error;
      }
    },
    [router]
  );

  /**
   * Switch to a different account
   *
   * CRITICAL SECURITY FIX: Comprehensive cache clearing to prevent cross-account data leakage
   * This function clears ALL cached data before switching accounts to ensure complete isolation
   */
  const switchAccount = useCallback(async (accountId: string, accountPassword?: string) => {
    setIsLoading(true);

    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        throw new Error('Not authenticated');
      }

      // CRITICAL FIX #1: Clear keimenon store BEFORE API call
      // This prevents cached nodes/edges from Account A appearing in Account B
      console.log('🧹 Clearing keimenon store before account switch...');
      useKeimenonStore.getState().reset();

      // CRITICAL FIX #2: Clear window globals that might cache account data
      if (typeof window !== 'undefined') {
        // Clear operating context globals
        delete (window as any).__operatingAccount;
        delete (window as any).__operatingMode;

        // Clear any other cached window properties
        delete (window as any).__cachedNodes;
        delete (window as any).__cachedEdges;
        delete (window as any).__cachedGroups;
        delete (window as any).__cachedBoards;
      }

      // CRITICAL FIX #3: Clear sessionStorage (except sensitive data)
      // sessionStorage can cache API responses that should be account-specific
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && !key.startsWith('__SENSITIVE__')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => sessionStorage.removeItem(key));
        console.log(`🧹 Cleared ${keysToRemove.length} sessionStorage items`);
      }

      // Make API call to switch account
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/switch-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId, accountPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Account switch failed');
      }

      const data = await response.json();
      const newToken = data.token;

      if (!newToken) {
        throw new Error('No token received from server');
      }

      // Store new token
      localStorage.setItem(TOKEN_KEY, newToken);

      // Parse and set user
      const parsedUser = parseUserFromToken(newToken);
      if (!parsedUser) {
        throw new Error('Failed to parse user from token');
      }

      setUser(parsedUser);

      // Log account switch event
      logApiEvent(`Switched to account: ${parsedUser.accountId}`, {
        domain: 'api',
        operation: 'auth.switchAccount',
        metadata: {
          accountId: parsedUser.accountId,
          userId: parsedUser.userId,
          accountType: parsedUser.accountType,
        },
      });

      console.log('✅ Account switched successfully:', {
        accountId: parsedUser.accountId,
        email: parsedUser.email,
      });

      setIsLoading(false);

      // CRITICAL FIX #4: Force hard reload to clear all React state and caches
      // This ensures Background Operations, any SWR/React Query caches, and all
      // component state is completely reset for the new account
      console.log('🔄 Performing hard reload to clear all application state...');
      window.location.reload();
    } catch (error: any) {
      setIsLoading(false);
      console.error('❌ Account switch error:', error);
      throw error;
    }
  }, []);

  /**
   * Logout user
   */
  const logout = useCallback(() => {
    // Clear token from storage
    localStorage.removeItem(TOKEN_KEY);

    // Clear user state
    setUser(null);

    // Reset keimenon store (clear all selected nodes, loaded data, etc.)
    useKeimenonStore.getState().reset();

    // Redirect to login
    router.push('/login');

    console.log('Logged out');
  }, [router]);

  /**
   * Refresh user from stored token
   * Useful after token updates
   */
  const refreshUser = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      setUser(null);
      return;
    }

    if (isTokenExpired(token)) {
      logout();
      return;
    }

    const parsedUser = parseUserFromToken(token);
    if (parsedUser) {
      setUser(parsedUser);
    } else {
      logout();
    }
  }, [logout]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    selectAccount,
    switchAccount,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Get stored token for API calls
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
