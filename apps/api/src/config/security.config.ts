/**
 * Security Configuration
 * Centralizes security-related constants and defaults
 */

export const SECURITY_CONFIG = {
  cors: {
    // Development origins allowed by default
    developmentOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173', // Vite default
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      // Electron app protocols
      'app://keimenon',
      'app://.',
    ],
    // Default fallback for production if env var not set
    productionDefault: ['https://yourdomain.com'],
  },
  headers: {
    // Cache control for sensitive routes
    noCache: 'no-store, no-cache, must-revalidate, proxy-revalidate',
    // Permissions policy
    permissions: 'geolocation=(), microphone=(), camera=()',
  },
};
