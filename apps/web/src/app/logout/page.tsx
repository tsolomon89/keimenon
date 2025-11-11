'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Logout Page
 *
 * CRITICAL FIX #11: E2E tests navigate to /logout for account switching
 * This page immediately logs out the user and redirects to login
 *
 * Related test: tests/e2e/multi-tenant-groups-isolation.spec.ts:352
 * Related: apps/web/src/contexts/AuthContext.tsx:455 (logout function)
 */
export default function LogoutPage() {
  const router = useRouter();
  const { logout, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      logout();
    } else {
      // Already logged out, redirect to login
      router.push('/login');
    }
  }, [isAuthenticated, logout, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4" />
        <p className="text-white text-lg">Logging out...</p>
      </div>
    </div>
  );
}
