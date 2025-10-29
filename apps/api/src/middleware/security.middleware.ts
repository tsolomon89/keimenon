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
function getAllowedOrigins(): string[] {
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    // Production: only allow specific domains
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

    if (allowedOrigins.length === 0) {
      console.warn(
        '⚠️  WARNING: No ALLOWED_ORIGINS configured in production. CORS will be very restrictive.'
      );
      return ['https://yourdomain.com']; // Default placeholder
    }

    return allowedOrigins;
  }

  // Development: allow localhost on common ports
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173', // Vite default
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
}

/**
 * CORS Configuration
 * Restricts API access to known origins only
 */
export function configureCors(): RequestHandler {
  const allowedOrigins = getAllowedOrigins();
  const nodeEnv = process.env.NODE_ENV || 'development';

  console.log(`🔒 CORS configured for ${nodeEnv}:`, allowedOrigins);

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) {
        if (nodeEnv === 'development') {
          return callback(null, true);
        } else {
          // Production: require origin header
          return callback(new Error('Origin header required'), false);
        }
      }

      // Check if origin is allowed
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
  const isDev = nodeEnv === 'development';

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
  return (req, res, next) => {
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
