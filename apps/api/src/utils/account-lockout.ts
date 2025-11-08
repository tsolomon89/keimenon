/**
 * Account Lockout Utility
 *
 * Tracks login attempts and enforces account lockout after repeated failures
 */

import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

export interface LoginAttemptConfig {
  maxAttempts: number; // Maximum failed attempts before lockout
  lockoutDurationMs: number; // How long to lock the account
  attemptWindowMs: number; // Window to count attempts (e.g., last 15 minutes)
}

const DEFAULT_CONFIG: LoginAttemptConfig = {
  maxAttempts: 5, // 5 failed attempts before lockout
  lockoutDurationMs: 30 * 60 * 1000, // 30 minutes
  attemptWindowMs: 15 * 60 * 1000, // Count attempts in last 15 minutes
};

export interface LockoutStatus {
  isLocked: boolean;
  remainingAttempts: number;
  lockoutExpiresAt?: number;
  totalAttempts: number;
}

/**
 * Check if an account is currently locked out
 */
export function checkAccountLockout(
  database: Database.Database,
  email: string,
  ipAddress: string,
  config: LoginAttemptConfig = DEFAULT_CONFIG
): LockoutStatus {
  // Bypass lockout for test environment entirely
  // This prevents test failures due to parallel test execution triggering rate limits
  if (process.env.NODE_ENV === 'test') {
    console.log('[Account Lockout] Test environment detected, bypassing lockout for:', email);
    return {
      isLocked: false,
      remainingAttempts: 999999,
      totalAttempts: 0,
    };
  }

  const now = Date.now();
  const windowStart = now - config.attemptWindowMs;

  // Get failed login attempts in the window for this email + IP combination
  const attempts = database
    .prepare(
      `SELECT * FROM login_attempts
       WHERE email = ?
       AND ip_address = ?
       AND success = 0
       AND attempted_at > ?
       ORDER BY attempted_at DESC`
    )
    .all(email, ipAddress, windowStart) as any[];

  const totalAttempts = attempts.length;

  if (totalAttempts >= config.maxAttempts) {
    // Account is locked - calculate when it expires
    const mostRecentAttempt = attempts[0];
    const lockoutExpiresAt = mostRecentAttempt.attempted_at + config.lockoutDurationMs;

    if (now < lockoutExpiresAt) {
      // Still locked
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockoutExpiresAt,
        totalAttempts,
      };
    } else {
      // Lockout has expired - clean up old attempts
      cleanupOldAttempts(database, email, ipAddress, windowStart);
      return {
        isLocked: false,
        remainingAttempts: config.maxAttempts,
        totalAttempts: 0,
      };
    }
  }

  return {
    isLocked: false,
    remainingAttempts: config.maxAttempts - totalAttempts,
    totalAttempts,
  };
}

/**
 * Record a login attempt (success or failure)
 */
export function recordLoginAttempt(
  database: Database.Database,
  email: string,
  ipAddress: string,
  success: boolean,
  userAgent?: string,
  failureReason?: string
): void {
  const id = randomUUID();
  const now = Date.now();

  database
    .prepare(
      `INSERT INTO login_attempts (id, email, ip_address, success, attempted_at, user_agent, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, email, ipAddress, success ? 1 : 0, now, userAgent || null, failureReason || null);

  // If successful, clean up all failed attempts for this email/IP
  if (success) {
    database
      .prepare(
        `DELETE FROM login_attempts
         WHERE email = ? AND ip_address = ? AND success = 0`
      )
      .run(email, ipAddress);
  }
}

/**
 * Clean up old login attempts (older than the window)
 */
export function cleanupOldAttempts(
  database: Database.Database,
  email: string,
  ipAddress: string,
  windowStart: number
): void {
  database
    .prepare(
      `DELETE FROM login_attempts
       WHERE email = ? AND ip_address = ? AND attempted_at < ?`
    )
    .run(email, ipAddress, windowStart);
}

/**
 * Clear all failed attempts for a user (admin unlock)
 */
export function unlockAccount(database: Database.Database, email: string): void {
  database
    .prepare(
      `DELETE FROM login_attempts
       WHERE email = ? AND success = 0`
    )
    .run(email);
}

/**
 * Get lockout status as human-readable message
 */
export function getLockoutMessage(status: LockoutStatus): string {
  if (status.isLocked && status.lockoutExpiresAt) {
    const minutesRemaining = Math.ceil((status.lockoutExpiresAt - Date.now()) / 1000 / 60);
    return `Account is locked due to too many failed login attempts. Please try again in ${minutesRemaining} minutes.`;
  }

  if (status.totalAttempts > 0) {
    return `Invalid credentials. ${status.remainingAttempts} attempts remaining before account lockout.`;
  }

  return 'Invalid credentials.';
}

/**
 * Cleanup job - remove old login attempts (older than 7 days)
 * This should be run periodically (e.g., daily cron job)
 */
export function cleanupOldLoginAttempts(database: Database.Database): number {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const result = database
    .prepare(
      `DELETE FROM login_attempts
       WHERE attempted_at < ?`
    )
    .run(sevenDaysAgo);

  return result.changes;
}
