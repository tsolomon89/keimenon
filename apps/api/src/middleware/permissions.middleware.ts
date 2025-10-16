import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit.service';

/**
 * Permission check options
 */
export interface PermissionOptions {
  capability: 'read' | 'write' | 'delete';
  resourceType: 'source' | 'user' | 'account' | 'settings' | 'edge' | 'node' | 'board' | 'group';
  requireServiceMode?: boolean; // Require mode_service=true for nested operations
  projection?: 'basic' | 'full'; // For admin-junior basic read
}

/**
 * Capability matrix based on role and overrides
 * Default permissions for each role
 */
const DEFAULT_CAPABILITIES: Record<string, Record<string, string[]>> = {
  // Client roles
  client: {
    junior: ['read:source', 'read:user', 'read:node', 'read:edge', 'read:board', 'read:group'],
    senior: [
      'read:source',
      'write:source',
      'read:user',
      'read:node',
      'write:node',
      'read:edge',
      'write:edge',
      'read:board',
      'read:group',
      'write:group',
    ],
    leader: [
      'read:source',
      'write:source',
      'read:user',
      'write:user',
      'read:node',
      'write:node',
      'read:edge',
      'write:edge',
      'read:board',
      'write:board',
      'read:group',
      'write:group',
    ],
    admin: [
      'read:source',
      'write:source',
      'delete:source',
      'read:user',
      'write:user',
      'delete:user',
      'read:account',
      'write:settings',
      'read:node',
      'write:node',
      'delete:node',
      'read:edge',
      'write:edge',
      'delete:edge',
      'read:board',
      'write:board',
      'delete:board',
      'read:group',
      'write:group',
      'delete:group',
    ],
  },
  // Admin roles (in their own admin account)
  admin: {
    junior: [
      'read:source',
      'read:user',
      'read:account', // Basic client read
      'read:node',
      'read:edge',
      'read:board',
      'read:group',
    ],
    senior: [
      'read:source',
      'write:source',
      'read:user',
      'read:account',
      'write:account', // Can modify client accounts
      'read:node',
      'write:node',
      'read:edge',
      'write:edge',
      'read:board',
      'write:board',
      'read:group',
      'write:group',
    ],
    leader: [
      'read:source',
      'write:source',
      'read:user',
      'write:user',
      'read:account',
      'write:account',
      'write:settings', // Can change client settings
      'read:node',
      'write:node',
      'read:edge',
      'write:edge',
      'read:board',
      'write:board',
      'read:group',
      'write:group',
    ],
    admin: [
      'read:source',
      'write:source',
      'delete:source',
      'read:user',
      'write:user',
      'delete:user',
      'read:account',
      'write:account',
      'delete:account',
      'write:settings', // Global settings
      'read:node',
      'write:node',
      'delete:node',
      'read:edge',
      'write:edge',
      'delete:edge',
      'read:board',
      'write:board',
      'delete:board',
      'read:group',
      'write:group',
      'delete:group',
    ],
  },
};

/**
 * Check if user has a specific capability
 * Takes into account base role + overrides
 */
function hasCapability(
  req: Request,
  capability: string,
  resourceType: string
): { allowed: boolean; reason?: string } {
  if (!req.user) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  const capabilityKey = `${capability}:${resourceType}`;

  // Get base capabilities for user's role
  const accountType = req.user.accountType || 'client';
  const permissionLevel = req.user.permissionLevel;

  const baseCapabilities = DEFAULT_CAPABILITIES[accountType]?.[permissionLevel] || [];

  // Check if capability is in base permissions
  let hasBaseCap = baseCapabilities.includes(capabilityKey);

  // Apply overrides
  if (req.user.overrides) {
    const overrideKey = capabilityKey.replace(':', '_'); // e.g., "write_source"

    if (overrideKey in req.user.overrides) {
      // Override explicitly grants or denies
      hasBaseCap = req.user.overrides[overrideKey];
    }
  }

  if (!hasBaseCap) {
    return {
      allowed: false,
      reason: `Insufficient permissions: ${permissionLevel} lacks ${capabilityKey}`,
    };
  }

  return { allowed: true };
}

/**
 * Middleware to check if user has required permission for an action
 * Usage: checkPermission({ capability: 'write', resourceType: 'source' })
 */
export function checkPermission(options: PermissionOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { capability, resourceType, requireServiceMode, projection } = options;

      // Check if user has the capability
      const capCheck = hasCapability(req, capability, resourceType);

      if (!capCheck.allowed) {
        // Log failed permission check
        if (global.auditService) {
          await global.auditService.logFailure({
            req,
            action: capability as any,
            resourceType: resourceType as any,
            reason: capCheck.reason || 'Permission denied',
          });
        }

        return res.status(403).json({
          error: 'Permission denied',
          message: capCheck.reason,
        });
      }

      // If in nested mode, check service mode requirement
      if (req.operating && req.operating.mode === 'nested' && requireServiceMode) {
        if (!req.operating.serviceMode) {
          if (global.auditService) {
            await global.auditService.logFailure({
              req,
              action: capability as any,
              resourceType: resourceType as any,
              reason: 'Nested mode requires service mode enabled',
            });
          }

          return res.status(403).json({
            error: 'Service mode required',
            message: 'Target account does not have service mode enabled for nested operations',
          });
        }
      }

      // If admin-junior viewing client data, enforce basic projection
      if (
        req.user.accountType === 'admin' &&
        req.user.permissionLevel === 'junior' &&
        req.operating?.mode === 'crm' &&
        capability === 'read'
      ) {
        // Set flag for route handler to apply basic projection
        (req as any).useBasicProjection = true;
      }

      // Permission granted
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Middleware to check rank ceiling for user modification operations
 * Ensures: target.rank <= actor.rank
 *
 * Usage: checkRankCeiling() - place after requireAuth and checkPermission
 */
export function checkRankCeiling() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const actorRank = req.user.rank;

      // Get target user's rank
      let targetRank: number | undefined;
      let targetUserId: string | undefined;

      // Case 1: Updating/deleting existing user (GET from DB)
      if (req.params.id || req.params.userId) {
        targetUserId = req.params.id || req.params.userId;

        // Load target user from database
        const database = global.dbClient?.getDatabase();
        if (!database) {
          return res.status(500).json({ error: 'Database not available' });
        }

        const targetUser = database
          .prepare('SELECT rank, permission_level FROM users WHERE id = ?')
          .get(targetUserId) as any;

        if (!targetUser) {
          return res.status(404).json({ error: 'Target user not found' });
        }

        targetRank = targetUser.rank || mapPermissionToRank(targetUser.permission_level);
      }

      // Case 2: Creating new user (GET from request body)
      if (req.body.permission_level && req.method === 'POST') {
        targetRank = mapPermissionToRank(req.body.permission_level);
      }

      // Case 3: Updating user's permission_level (GET from request body)
      if (req.body.permission_level && (req.method === 'PUT' || req.method === 'PATCH')) {
        targetRank = mapPermissionToRank(req.body.permission_level);
      }

      // If we couldn't determine target rank, allow (let route handler deal with it)
      if (targetRank === undefined) {
        return next();
      }

      // Check rank ceiling: target must be <= actor
      if (targetRank > actorRank) {
        if (global.auditService) {
          await global.auditService.logFailure({
            req,
            action: req.method === 'POST' ? 'create' : req.method === 'DELETE' ? 'delete' : 'update',
            resourceType: 'user',
            resourceId: targetUserId,
            reason: `Rank ceiling violation: actor rank ${actorRank} cannot modify rank ${targetRank}`,
          });
        }

        return res.status(403).json({
          error: 'Rank ceiling violation',
          message: `You cannot modify users with rank ${targetRank} (${rankToPermission(targetRank)}). Your rank: ${actorRank} (${rankToPermission(actorRank)})`,
        });
      }

      // Rank check passed
      next();
    } catch (error) {
      console.error('Rank ceiling check error:', error);
      return res.status(500).json({ error: 'Rank check failed' });
    }
  };
}

/**
 * Helper: Map permission level string to numeric rank
 */
function mapPermissionToRank(permissionLevel: string): number {
  const rankMap: Record<string, number> = {
    junior: 1,
    senior: 2,
    leader: 3,
    admin: 4,
  };
  return rankMap[permissionLevel] || 1;
}

/**
 * Helper: Map numeric rank to permission level string
 */
function rankToPermission(rank: number): string {
  const permissionMap: Record<number, string> = {
    1: 'junior',
    2: 'senior',
    3: 'leader',
    4: 'admin',
  };
  return permissionMap[rank] || 'junior';
}

/**
 * Middleware to apply basic read projection for admin-junior
 * Only returns: id, name, email, created_at
 *
 * Usage: applyBasicProjection() - place at end of middleware chain
 */
export function applyBasicProjection() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if basic projection was requested
    if ((req as any).useBasicProjection) {
      // Store original res.json
      const originalJson = res.json.bind(res);

      // Override res.json to apply projection
      res.json = function (data: any) {
        if (Array.isArray(data)) {
          // Apply projection to array of objects
          data = data.map((item) => applyProjectionToObject(item));
        } else if (typeof data === 'object' && data !== null) {
          // Apply projection to single object
          if (data.users) {
            data.users = data.users.map((user: any) => applyProjectionToObject(user));
          } else if (data.user) {
            data.user = applyProjectionToObject(data.user);
          } else {
            data = applyProjectionToObject(data);
          }
        }

        return originalJson(data);
      } as any;
    }

    next();
  };
}

/**
 * Helper: Apply basic projection to a single object
 */
function applyProjectionToObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  // Basic projection: only these fields
  const { id, name, email, created_at } = obj;

  return { id, name, email, created_at };
}

/**
 * Global declaration for audit service
 */
declare global {
  var auditService: AuditService | undefined;
  var dbClient: any;
}
