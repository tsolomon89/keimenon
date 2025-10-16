'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  userId: string;
  accountId: string;
  email: string;
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  rank: number;
  overrides?: Record<string, boolean>;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, accountClass?: 'free' | 'professional' | 'business') => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'canvas_memory_token';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

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
 * Parse user from JWT payload
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

    if (!token) {
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
   * Login user with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
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

      console.log('Login successful:', {
        email: parsedUser.email,
        rank: parsedUser.rank,
        accountType: parsedUser.accountType,
      });

      // Redirect to canvas
      router.push('/canvas');
    } catch (error: any) {
      setIsLoading(false);
      console.error('Login error:', error);
      throw error;
    }
  }, [router]);

  /**
   * Register new user account
   */
  const register = useCallback(async (
    email: string,
    password: string,
    name: string,
    accountClass: 'free' | 'professional' | 'business' = 'free'
  ) => {
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
        throw new Error(error.error || 'Registration failed');
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

      // Redirect to canvas
      router.push('/canvas');
    } catch (error: any) {
      setIsLoading(false);
      console.error('Registration error:', error);
      throw error;
    }
  }, [router]);

  /**
   * Logout user
   */
  const logout = useCallback(() => {
    // Clear token from storage
    localStorage.removeItem(TOKEN_KEY);

    // Clear user state
    setUser(null);

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
