/**
 * Rate Limiting Middleware
 *
 * Protects against brute force attacks and API abuse
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';

// Extend Express Request to include rate limit data
declare global {
  namespace Express {
    interface Request {
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime: Date;
      };
    }
  }
}

const DISABLE_RATE_LIMIT =
  process.env.DISABLE_RATE_LIMIT === '1' || process.env.NODE_ENV !== 'production';
const noopLimiter = ((_req: any, _res: any, next: any) =>
  next()) as unknown as RateLimitRequestHandler;

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force password attacks
 */
// ... (imports remain)

// ... (imports remain)

// Cast to any to avoid "Dictionary" type mismatches with Express Router
export const authRateLimiter = (DISABLE_RATE_LIMIT
  ? noopLimiter
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many login attempts from this IP, please try again after 15 minutes',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,

      // Custom key generator (use IP + optional user identifier)
      keyGenerator: (req: any): string => {
        // Use IP address as the key
        const ip = req.ip || req.socket.remoteAddress || 'unknown';

        // If email is in the body, include it (prevents attacks from distributed IPs)
        const email = (req.body as any)?.email;
        if (email) {
          return `${ip}:${email}`;
        }

        return ip;
      },

      // Custom handler for rate limit exceeded
      handler: (req: any, res: any) => {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Too many login attempts. Please try again later.',
          retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000),
        });
      },
    })) as any;

/**
 * Standard rate limiter for general API endpoints
 * Prevents API abuse
 */
export const apiRateLimiter = (DISABLE_RATE_LIMIT
  ? noopLimiter
  : rateLimit({
      windowMs: 1 * 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP, please try again later',
      standardHeaders: true,
      legacyHeaders: false,

      // Skip rate limiting for certain paths
      skip: (req: any): boolean => {
        // Don't rate limit health checks
        if (req.path === '/health' || req.path === '/ready') {
          return true;
        }
        return false;
      },

      handler: (req: any, res: any) => {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please slow down.',
          retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000),
        });
      },
    })) as any;

/**
 * Strict rate limiter for password reset endpoints
 * Prevents email enumeration and spam
 */
export const passwordResetRateLimiter = (DISABLE_RATE_LIMIT
  ? noopLimiter
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 3,
      message: 'Too many password reset attempts, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,

      keyGenerator: (req: any): string => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const email = (req.body as any)?.email;
        if (email) {
          return `reset:${ip}:${email}`;
        }
        return `reset:${ip}`;
      },

      handler: (req: any, res: any) => {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Too many password reset attempts. Please try again later.',
          retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000),
        });
      },
    })) as any;

/**
 * Strict rate limiter for user registration
 * Prevents spam account creation
 */
export const registrationRateLimiter = (DISABLE_RATE_LIMIT
  ? noopLimiter
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 5,
      message: 'Too many registration attempts, please try again later',
      standardHeaders: true,
      legacyHeaders: false,

      keyGenerator: (req: any): string => {
        return req.ip || req.socket.remoteAddress || 'unknown';
      },

      handler: (req: any, res: any) => {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Too many registration attempts. Please try again later.',
          retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000),
        });
      },
    })) as any;

/**
 * Moderate rate limiter for import endpoints
 * Prevents server overload from excessive imports
 */
export const importRateLimiter = (DISABLE_RATE_LIMIT
  ? noopLimiter
  : rateLimit({
      windowMs: 5 * 60 * 1000,
      max: 10,
      message: 'Too many import requests, please wait before importing again',
      standardHeaders: true,
      legacyHeaders: false,

      handler: (req: any, res: any) => {
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Too many import requests. Please wait a few minutes before trying again.',
          retryAfter: Math.ceil((req.rateLimit?.resetTime?.getTime() || Date.now()) / 1000),
        });
      },
    })) as any;
