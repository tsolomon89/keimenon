'use client';

import { useEffect, useState } from 'react';

/**
 * Debug page to check what environment variables are available in client-side code
 */
export default function DebugClientEnvPage() {
  const [clientEnv, setClientEnv] = useState<any>(null);

  useEffect(() => {
    // This runs in the browser
    const env = {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NEXT_PUBLIC_E2E_TESTING: process.env.NEXT_PUBLIC_E2E_TESTING,
      // Show if process.env exists at all
      hasProcessEnv: typeof process !== 'undefined',
      hasProcessEnvObject: typeof process !== 'undefined' && typeof process.env !== 'undefined',
    };

    console.log('Client-side environment:', env);
    setClientEnv(env);
  }, []);

  if (!clientEnv) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Client-Side Environment Variables</h1>
      <pre>{JSON.stringify(clientEnv, null, 2)}</pre>

      <h2>Direct Access Test</h2>
      <p>NEXT_PUBLIC_API_URL (direct): {process.env.NEXT_PUBLIC_API_URL || 'undefined'}</p>
      <p>NEXT_PUBLIC_E2E_TESTING (direct): {process.env.NEXT_PUBLIC_E2E_TESTING || 'undefined'}</p>
    </div>
  );
}
