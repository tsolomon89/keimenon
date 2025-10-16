import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuditService } from '../services/audit.service';
import { SQLiteClient } from '@canvas-memory/db';

// Extend Express Request to include auth data
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        accountId: string; // Home account
        email: string;
        permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
        accountType: 'admin' | 'client';
        accountClass: 'free' | 'professional' | 'business';
        rank: number; // 1-4
        overrides?: Record<string, boolean>;
      };
      // NEW: Operating context for nested/CRM mode
      operating?: {
        mode: 'native' | 'nested' | 'crm';
        accountId: string; // May differ from user.accountId if nested
        accountType: 'admin' | 'client';
        serviceMode: boolean; // Target account's mode_service flag
        parentAccountId?: string;
      };
    }
  }
}

/**
 * Middleware to require authentication
 * Verifies JWT token and attaches user data to request
 */
export function requireAuth(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token
      const payload = await authService.verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Attach user data to request
      req.user = {
        userId: payload.userId,
        accountId: payload.accountId,
        email: payload.email,
        permissionLevel: payload.permissionLevel as any,
        accountType: payload.accountType as any,
        accountClass: payload.accountClass as any,
        rank: payload.rank || 1,
        overrides: payload.overrides,
      };

      // Check for operating context headers (nested/CRM mode)
      const operatingAccountHeader = req.headers['x-operating-account'] as string;
      const operatingModeHeader = (req.headers['x-operating-mode'] as string) || 'native';

      if (operatingAccountHeader && operatingAccountHeader !== payload.accountId) {
        // User is trying to operate in a different account context
        // This is only allowed for admin users
        if (payload.accountType !== 'admin') {
          return res.status(403).json({
            error: 'Cross-account access denied',
            message: 'Only admin accounts can operate in other accounts',
          });
        }

        // Verify admin has access to target account (check account_links)
        const database = authService['db'].getDatabase();

        const link = database
          .prepare(
            `SELECT * FROM account_links
             WHERE admin_account_id = ? AND client_account_id = ?`
          )
          .get(payload.accountId, operatingAccountHeader) as any;

        if (!link) {
          // Log failed cross-tenant access attempt
          if (global.auditService) {
            await global.auditService.logFailure({
              req: { user: req.user, operating: undefined } as any,
              action: 'read',
              resourceType: 'account',
              resourceId: operatingAccountHeader,
              reason: 'Admin not linked to target account',
            });
          }

          return res.status(403).json({
            error: 'Access denied',
            message: 'Admin account is not linked to target account',
          });
        }

        // Load target account info
        const targetAccount = database
          .prepare('SELECT * FROM accounts WHERE id = ?')
          .get(operatingAccountHeader) as any;

        if (!targetAccount) {
          return res.status(404).json({
            error: 'Target account not found',
          });
        }

        // Attach operating context
        req.operating = {
          mode: operatingModeHeader as any,
          accountId: operatingAccountHeader,
          accountType: targetAccount.account_type,
          serviceMode: targetAccount.mode_service === 1,
          parentAccountId: targetAccount.parent_account_id,
        };

        // Validate operating mode
        if (operatingModeHeader === 'nested' && !req.operating.serviceMode) {
          // Log failed nested mode attempt
          if (global.auditService) {
            await global.auditService.logFailure({
              req,
              action: 'read',
              resourceType: 'account',
              resourceId: operatingAccountHeader,
              reason: 'Nested mode requires service mode enabled',
            });
          }

          return res.status(403).json({
            error: 'Nested mode denied',
            message: 'Target account does not have service mode enabled',
          });
        }

        // Log successful cross-tenant access
        if (global.auditService) {
          await global.auditService.logSuccess({
            req,
            action: 'read',
            resourceType: 'account',
            resourceId: operatingAccountHeader,
            metadata: {
              mode: operatingModeHeader,
              serviceMode: req.operating.serviceMode,
            },
          });
        }
      } else {
        // Native mode - user operating in their own account
        req.operating = {
          mode: 'native',
          accountId: payload.accountId,
          accountType: payload.accountType as any,
          serviceMode: false,
        };
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

/**
 * Middleware to require admin account type
 * Must be used after requireAuth
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.accountType !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Middleware to require specific permission level
 * Must be used after requireAuth
 */
export function requirePermission(minLevel: 'junior' | 'senior' | 'leader' | 'admin') {
  const levels = ['junior', 'senior', 'leader', 'admin'];
  const minLevelIndex = levels.indexOf(minLevel);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userLevelIndex = levels.indexOf(req.user.permissionLevel);

    if (userLevelIndex < minLevelIndex) {
      return res.status(403).json({
        error: `Permission level '${minLevel}' or higher required`,
      });
    }

    next();
  };
}

/**
 * Middleware to isolate data by account
 * Adds account_id filter to query parameters
 * Must be used after requireAuth
 */
export function isolateByAccount(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Admin accounts can access all data (for debugging/management)
  if (req.user.accountType === 'admin') {
    // Allow admin to optionally filter by account_id via query param
    // If not provided, they see all data
    next();
    return;
  }

  // Client accounts: force account_id filter
  // Attach account_id to request for use in route handlers
  (req as any).accountId = req.user.accountId;

  next();
}

/**
 * Middleware to require Business tier account class
 * Must be used after requireAuth
 */
export function requireBusiness(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.accountClass !== 'business') {
    return res.status(403).json({
      error: 'Business tier required for this feature',
    });
  }

  next();
}

/**
 * Middleware to require Professional or Business tier
 * Must be used after requireAuth
 */
export function requireProfessional(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (req.user.accountClass === 'free') {
    return res.status(403).json({
      error: 'Professional or Business tier required for this feature',
    });
  }

  next();
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Just attaches user data if valid token exists
 */
export function optionalAuth(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided - continue without auth
        next();
        return;
      }

      const token = authHeader.substring(7);
      const payload = await authService.verifyToken(token);

      if (payload) {
        req.user = {
          userId: payload.userId,
          accountId: payload.accountId,
          email: payload.email,
          permissionLevel: payload.permissionLevel as any,
          accountType: payload.accountType as any,
          accountClass: payload.accountClass as any,
        };
      }

      next();
    } catch (error) {
      // Silently continue without auth
      next();
    }
  };
}
