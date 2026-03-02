'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@keimenon/ui';

/**
 * TokenExpirationListener Component
 *
 * Listens for global 'auth:token-expired' events and displays a user-friendly
 * toast notification before redirecting to login.
 *
 * This component should be mounted at the root level (in layout.tsx or app.tsx)
 * to ensure it's always listening for token expiration events.
 *
 * Related: apps/web/src/lib/api-client.ts:42 (handleTokenExpiration - event dispatcher)
 * Related: apps/web/src/contexts/AuthContext.tsx:506 (logout function)
 *
 * @example
 * // In app/layout.tsx or root component:
 * <TokenExpirationListener />
 */
export function TokenExpirationListener() {
  const { toasts, error, removeToast } = useToast();

  // Bug fix #27: Use ref to avoid dependency array issues with error function
  // This prevents event listener thrashing when error function reference changes
  const errorRef = useRef(error);
  errorRef.current = error;

  useEffect(() => {
    function handleTokenExpired(event: Event) {
      const customEvent = event as CustomEvent<{ reason: string }>;
      const reason = customEvent.detail?.reason || 'Your session has expired';

      console.log('🔔 Token expiration detected, showing notification:', reason);

      // Show error toast with longer duration to give user time to see it
      errorRef.current(
        'Session Expired',
        'You will be redirected to the login page. Please log in again.',
        3000 // 3 seconds before redirect
      );
    }

    // Listen for token expiration events
    window.addEventListener('auth:token-expired', handleTokenExpired);

    return () => {
      window.removeEventListener('auth:token-expired', handleTokenExpired);
    };
  }, []); // Bug fix #27: Empty dependency array - uses ref for stable callback

  // Only render ToastContainer if there are toasts
  if (toasts.length === 0) {
    return null;
  }

  return <ToastContainer toasts={toasts} onClose={removeToast} />;
}
