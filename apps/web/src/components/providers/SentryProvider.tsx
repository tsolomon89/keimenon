/**
 * Sentry Provider Component
 *
 * Initializes Sentry error tracking with user consent management.
 * This is a client-side component that should be included in the root layout.
 */

'use client';

import { useEffect } from 'react';
import { initSentry } from '@/services/sentry.service';

export function SentryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize Sentry on mount (client-side only)
    // Will only activate if:
    // 1. NEXT_PUBLIC_SENTRY_DSN is set
    // 2. User has consented (via localStorage)
    initSentry();
  }, []);

  return <>{children}</>;
}
