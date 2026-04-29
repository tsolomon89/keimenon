import { Request, Response, NextFunction } from 'express';
import {
  AuthServiceV2,
  CapabilityAuthorizationService,
  PrincipalCapabilities,
} from '../services/auth.service';
import { PrincipalService } from '../services/principal-service';

function shouldLogCapabilityLookupWarnings(): boolean {
  if (process.env.AUTH_CAPABILITY_LOOKUP_LOG_ERRORS === '1') {
    return true;
  }

  return process.env.NODE_ENV !== 'test';
}

function shouldLogCapabilityGuardErrors(): boolean {
  if (process.env.AUTH_CAPABILITY_GUARD_LOG_ERRORS === '1') {
    return true;
  }

  return process.env.NODE_ENV !== 'test';
}

// Extend Express Request to include auth data
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        accountId: string; // Current active account
        email: string;
        permissionLevel: 'junior' | 'senior' | 'leader' | 'admin'; // Permission for current account
        accountType: 'admin' | 'client';
        accountClass: 'free' | 'professional' | 'business';
        rank: number; // 1-4 (role_rank for current account)
        overrides?: Record<string, boolean>;
        sessionId: string; // Session ID for tracking
        allAccounts?: string[]; // All accessible account IDs
        principalId?: string; // Resolved human principal id for current account
        // World Model V5: Principal capabilities for unified authorization
        capabilities?: PrincipalCapabilities;
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
 * Updated for M:N user-account relationships
 */
export function requireAuth(authService: AuthServiceV2) {
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

      // Attach user data to request (from JWT payload)
      req.user = {
        userId: payload.userId,
        accountId: payload.accountId, // Current active account
        email: payload.email,
        permissionLevel: payload.permissionLevel as any, // Permission for current account
        accountType: payload.accountType as any,
        accountClass: payload.accountClass as any,
        rank: payload.rank || 1, // role_rank for current account
        overrides: payload.overrides,
        sessionId: payload.sessionId,
        allAccounts: payload.allAccounts, // All accounts user has access to
      };

      // World Model V5: Fetch principal capabilities for unified authorization
      // This enables capability-based checks (F1: Principal Equivalence)
      try {
        // AuthServiceV2 has a private 'db' property of type SQLiteClient
        const dbClient = (authService as any).db;
        if (dbClient) {
          const capabilityService = new CapabilityAuthorizationService(dbClient);
          let capabilityPrincipalId = payload.userId;

          try {
            const principalService = new PrincipalService(dbClient);
            const principal = await principalService.resolveHumanPrincipal(
              payload.accountId,
              payload.userId,
              payload.email,
              payload.email
            );
            if (principal?.id) {
              capabilityPrincipalId = principal.id;
            }
          } catch (principalResolveError) {
            if (shouldLogCapabilityLookupWarnings()) {
              console.warn(
                '[AuthMiddleware] Could not resolve human principal for capability lookup:',
                principalResolveError
              );
            }
          }

          const capabilities = await capabilityService.getPrincipalCapabilities(
            capabilityPrincipalId,
            payload.accountId
          );
          req.user.capabilities = capabilities;
          req.user.principalId = capabilityPrincipalId;
        }
      } catch (capError) {
        // Non-fatal: default to no special capabilities if lookup fails
        // This maintains backward compatibility with existing auth flows
        if (shouldLogCapabilityLookupWarnings()) {
          console.warn('[AuthMiddleware] Could not fetch principal capabilities:', capError);
        }
      }

      // Check for operating context headers (nested/CRM mode)
      const operatingAccountHeader = req.headers['x-operating-account'] as string;
      const operatingModeHeader = (req.headers['x-operating-mode'] as string) || 'native';

      if (operatingAccountHeader && operatingAccountHeader !== payload.accountId) {
        // User is trying to operate in a different account context
        // First check if user has direct membership in target account (M:N relationship)
        const database = authService['db'].getDatabase();

        const membership = database
          .prepare(
            `SELECT * FROM user_accounts
             WHERE user_id = ? AND account_id = ? AND status = 'active'`
          )
          .get(payload.userId, operatingAccountHeader) as any;

        if (membership) {
          // User has direct access to this account
          // This is allowed - user can switch between their accounts
          // No additional checks needed for direct membership
        } else if (payload.accountType === 'admin') {
          // User doesn't have direct membership, but is an admin
          // Check if admin has access via account_links
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
                reason: 'User not member and admin not linked to target account',
              });
            }

            return res.status(403).json({
              error: 'Access denied',
              message: 'You do not have access to this account',
            });
          }
        } else {
          // User is not a member and not an admin
          return res.status(403).json({
            error: 'Cross-account access denied',
            message: 'You do not have access to this account',
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

      return next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldLog =
        process.env.AUTH_MIDDLEWARE_LOG_ERRORS === '1' ||
        !(
          process.env.NODE_ENV === 'test' &&
          (message === 'Invalid token' ||
            message.toLowerCase().includes('invalid token') ||
            message.toLowerCase().includes('jwt'))
        );

      if (shouldLog) {
        console.error('Auth middleware error:', error);
      }
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

  return next();
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

    return next();
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
    return next();
  }

  // Client accounts: force account_id filter
  // Attach account_id to request for use in route handlers
  (req as any).accountId = req.user.accountId;

  return next();
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

  return next();
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

  return next();
}

/**
 * Middleware to require a specific capability
 * World Model V5: Capability-based authorization (F1: Principal Equivalence)
 * Must be used after requireAuth
 *
 * @param capability - The capability to check (can_upload, can_run_tools, etc.)
 */
export function requireCapability(capability: keyof PrincipalCapabilities) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check if capabilities were loaded
    if (!req.user.capabilities) {
      // Security fix: Do NOT fall back to next() - this creates auth bypass
      // If capabilities are required but not loaded, deny access
      if (shouldLogCapabilityGuardErrors()) {
        console.error('[RequireCapability] Capabilities not loaded - denying access');
      }
      return res.status(403).json({
        error: 'Authorization failed',
        message: 'Could not verify capabilities. Please try again.',
      });
    }

    // Check the specific capability
    const hasCapability = req.user.capabilities[capability];
    if (!hasCapability) {
      return res.status(403).json({
        error: 'Capability required',
        message: `This action requires the '${capability}' capability`,
        capability,
      });
    }

    return next();
  };
}

/**
 * Middleware to require any of the specified capabilities
 * Must be used after requireAuth
 *
 * @param capabilities - Array of capabilities, user needs at least one
 */
export function requireAnyCapability(capabilities: Array<keyof PrincipalCapabilities>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.user.capabilities) {
      // Security fix: Do NOT fall back to next() - this creates auth bypass
      if (shouldLogCapabilityGuardErrors()) {
        console.error('[RequireAnyCapability] Capabilities not loaded - denying access');
      }
      return res.status(403).json({
        error: 'Authorization failed',
        message: 'Could not verify capabilities. Please try again.',
      });
    }

    const hasAny = capabilities.some((cap) => req.user!.capabilities![cap]);
    if (!hasAny) {
      return res.status(403).json({
        error: 'Capability required',
        message: `This action requires one of: ${capabilities.join(', ')}`,
        required: capabilities,
      });
    }

    return next();
  };
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Just attaches user data if valid token exists
 */
export function optionalAuth(authService: AuthServiceV2) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No token provided - continue without auth
        return next();
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
          rank: payload.rank || 1,
          overrides: payload.overrides,
          sessionId: payload.sessionId,
          allAccounts: payload.allAccounts,
        };
      }

      return next();
    } catch (error) {
      // Silently continue without auth
      return next();
    }
  };
}
