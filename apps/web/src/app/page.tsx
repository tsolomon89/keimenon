'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) return;

    const currentParams =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const startupParams = new URLSearchParams();
    for (const key of ['apiPort', 'dev']) {
      const value = currentParams.get(key);
      if (value) {
        startupParams.set(key, value);
      }
    }
    const startupQuery = startupParams.toString();

    // Redirect based on auth status
    if (isAuthenticated) {
      router.push(startupQuery ? `/keimenon?${startupQuery}` : '/keimenon');
    } else {
      router.push(startupQuery ? `/login?${startupQuery}` : '/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-4 text-slate-400">Loading...</p>
      </div>
    </div>
  );
}
