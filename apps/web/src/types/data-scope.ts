/**
 * Data Scoping Types
 *
 * Defines how data visibility is scoped across different account types.
 * Used throughout the application to enforce tenant isolation and permissions.
 *
 * @see docs/architecture/PERMISSIONS.md for full scoping rules
 * @see docs/migrations/MANAGER_MODE_PARITY.md for implementation guide
 */

import { User } from '@/lib/api-client';

/**
 * Scope object that defines which tenant data should be included in queries
 */
export interface DataScope {
  /**
   * List of tenant account IDs to include
   * - ['*'] = all tenants (admin only)
   * - [accountId] = specific tenant
   * - multiple IDs = specific subset
   */
  tenantIds: string[];

  /**
   * Whether to include admin account data
   * - true = include admin account in results
   * - false = exclude admin account
   */
  includeAdmin: boolean;

  /**
   * Optional user-level filtering
   * When provided, further restrict to specific user's data
   */
  userId?: string;
}

/**
 * Get the appropriate data scope for a given user
 *
 * Rules:
 * - Admin users can access all tenant data + admin account
 * - Client users can only access their own tenant data
 *
 * @param user - The authenticated user
 * @returns DataScope appropriate for the user's permissions
 *
 * @example
 * // Admin user
 * const adminScope = getScopeForUser(adminUser);
 * // { tenantIds: ['*'], includeAdmin: true }
 *
 * @example
 * // Client user
 * const clientScope = getScopeForUser(clientUser);
 * // { tenantIds: ['client-account-id-123'], includeAdmin: false }
 */
export function getScopeForUser(user: User): DataScope {
  if (user.permission_level === 'admin') {
    return {
      tenantIds: ['*'], // All tenants
      includeAdmin: true, // Include admin account
    };
  } else {
    return {
      tenantIds: [user.account_id], // Only this client's tenant
      includeAdmin: false, // Exclude admin account
    };
  }
}

/**
 * Serialize scope to URL query parameters
 * Used for passing scope in API requests
 *
 * @param scope - The data scope to serialize
 * @returns URL query parameter string
 *
 * @example
 * const params = scopeToQueryParams(scope);
 * // "tenantIds=*&includeAdmin=true"
 */
export function scopeToQueryParams(scope: DataScope): string {
  const params = new URLSearchParams();
  params.set('tenantIds', scope.tenantIds.join(','));
  params.set('includeAdmin', String(scope.includeAdmin));
  if (scope.userId) {
    params.set('userId', scope.userId);
  }
  return params.toString();
}

/**
 * Parse scope from URL query parameters
 * Used in API routes to extract scope from request
 *
 * @param queryParams - URL query parameters object
 * @returns Parsed data scope, or null if not provided
 *
 * @example
 * const scope = scopeFromQueryParams(req.query);
 */
export function scopeFromQueryParams(queryParams: any): DataScope | null {
  if (!queryParams.tenantIds) {
    return null;
  }

  return {
    tenantIds: queryParams.tenantIds.split(','),
    includeAdmin: queryParams.includeAdmin === 'true',
    userId: queryParams.userId || undefined,
  };
}

/**
 * Validate that a user is allowed to access a given scope
 * Throws error if user tries to access data they shouldn't
 *
 * @param user - The requesting user
 * @param requestedScope - The scope they're trying to access
 * @throws Error if user cannot access requested scope
 *
 * @example
 * validateScopeAccess(clientUser, { tenantIds: ['other-account'], includeAdmin: false });
 * // Throws: "Client users can only query their own tenant"
 */
export function validateScopeAccess(user: User, requestedScope: DataScope): void {
  // Admin can access any scope
  if (user.permission_level === 'admin') {
    return;
  }

  // Client users can ONLY query their own tenant
  if (requestedScope.tenantIds.length !== 1 || requestedScope.tenantIds[0] !== user.account_id) {
    throw new Error('Client users can only query their own tenant');
  }

  // Client users cannot include admin data
  if (requestedScope.includeAdmin) {
    throw new Error('Client users cannot access admin account data');
  }
}
