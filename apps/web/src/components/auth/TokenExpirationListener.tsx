'use client';

import { useEffect } from 'react';
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

  useEffect(() => {
    function handleTokenExpired(event: Event) {
      const customEvent = event as CustomEvent<{ reason: string }>;
      const reason = customEvent.detail?.reason || 'Your session has expired';

      console.log('🔔 Token expiration detected, showing notification:', reason);

      // Show error toast with longer duration to give user time to see it
      error(
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
  }, [error]);

  // Only render ToastContainer if there are toasts
  if (toasts.length === 0) {
    return null;
  }

  return <ToastContainer toasts={toasts} onClose={removeToast} />;
}
