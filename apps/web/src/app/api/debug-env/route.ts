import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check what environment variables are available
 * GET /api/debug-env
 */
export async function GET() {
  return NextResponse.json({
    // Server-side env vars
    serverSide: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      API_URL: process.env.API_URL,
    },
    // Client-side env vars (NEXT_PUBLIC_*)
    clientSide: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NEXT_PUBLIC_E2E_TESTING: process.env.NEXT_PUBLIC_E2E_TESTING,
    },
  });
}
