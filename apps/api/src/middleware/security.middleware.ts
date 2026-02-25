/**
 * Security Middleware
 *
 * Configures security headers and CORS for production safety
 */

import helmet from 'helmet';
import cors from 'cors';
import { RequestHandler } from 'express';

/**
 * Get allowed origins based on environment
 */
import { SECURITY_CONFIG } from '../config/security.config';

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins(): string[] {
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    // Production: only allow specific domains
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

    if (allowedOrigins.length === 0) {
      console.warn(
        '⚠️  WARNING: No ALLOWED_ORIGINS configured in production. CORS will be very restrictive.'
      );
      return SECURITY_CONFIG.cors.productionDefault;
    }

    return allowedOrigins;
  }

  // Development: allow localhost on common ports
  return SECURITY_CONFIG.cors.developmentOrigins;
}

/**
 * CORS Configuration
 * Restricts API access to known origins only
 *
 * CRITICAL FIX #2: More permissive CORS in test mode
 * - Detects test mode via NODE_ENV=test or PLAYWRIGHT_TEST env var
 * - Allows all localhost/127.0.0.1 origins in test mode
 * - Adds x-test-db-path header for test isolation
 */
export function configureCors(): RequestHandler {
  const allowedOrigins = getAllowedOrigins();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isTestMode = nodeEnv === 'test' || process.env.PLAYWRIGHT_TEST === 'true';

  console.log(`🔒 CORS configured for ${nodeEnv} (test mode: ${isTestMode}):`, allowedOrigins);

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) {
        if (nodeEnv === 'development' || nodeEnv === 'test' || isTestMode) {
          return callback(null, true);
        } else {
          // Production: require origin header
          return callback(new Error('Origin header required'), false);
        }
      }

      // In test mode OR development, always allow localhost/127.0.0.1/app:// origin
      // This ensures Electron (app://) and hybrid dev (localhost) works reliably
      if (isTestMode || nodeEnv === 'development') {
        if (
          origin.includes('localhost') ||
          origin.includes('127.0.0.1') ||
          origin.startsWith('app://')
        ) {
          return callback(null, true);
        }
      }

      // Check if origin is in the allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`❌ CORS blocked request from origin: ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    credentials: true, // Allow cookies and auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Account-Id',
      'X-Operating-Account',
      'X-Operating-Mode',
      'x-test-id',
      'x-test-source',
      'x-test-db-path', // CRITICAL: Required for test isolation
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400, // Cache preflight for 24 hours
  });
}

/**
 * Helmet Security Headers Configuration
 * Adds various security headers to protect against common attacks
 */
export function configureHelmet(): RequestHandler {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const _isDev = nodeEnv === 'development';

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for dev
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },

    // DNS Prefetch Control
    dnsPrefetchControl: {
      allow: false,
    },

    // Frameguard - prevent clickjacking
    frameguard: {
      action: 'deny',
    },

    // Hide X-Powered-By header
    hidePoweredBy: true,

    // HTTP Strict Transport Security (HTTPS only)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },

    // IE No Open - prevent IE from executing downloads
    ieNoOpen: true,

    // Don't sniff MIME types
    noSniff: true,

    // Referrer Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    // XSS Filter for older browsers
    xssFilter: true,
  });
}

/**
 * Custom security headers for additional protection
 */
export function addCustomSecurityHeaders(): RequestHandler {
  return (_req, res, next) => {
    // Prevent browsers from caching sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Permissions Policy (formerly Feature-Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    return next();
  };
}
