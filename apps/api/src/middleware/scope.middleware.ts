/**
 * Data Scope Middleware
 *
 * Validates and enforces account-based scoping rules.
 */

import { Request } from 'express';

/**
 * Data scope definition (matches frontend type).
 */
export interface DataScope {
  accountIds: string[]; // ['*'] for all, or specific account IDs
  includeAdmin: boolean; // Whether to include admin account data
  userId?: string; // Optional user-level filter
}

/**
 * Apply and validate data scope from request query parameters.
 *
 * Backward compatibility:
 * - Accepts legacy `tenantIds` input parameter.
 * - Canonical output and internal usage are `accountIds`.
 */
export function applyScopeFilter(req: Request): DataScope {
  const user = (req as any).user;
  if (!user) {
    throw new Error('Authentication required - user not found in request');
  }

  const accountIdsParam = req.query.accountIds as string | undefined;
  const legacyTenantIdsParam = req.query.tenantIds as string | undefined;
  const includeAdminParam = req.query.includeAdmin as string | undefined;
  const userIdParam = req.query.userId as string | undefined;

  const requestedIds = accountIdsParam ?? legacyTenantIdsParam;
  const accountIds = requestedIds ? requestedIds.split(',') : [user.accountId];

  const requestedScope: DataScope = {
    accountIds,
    includeAdmin: includeAdminParam === 'true',
    userId: userIdParam || undefined,
  };

  validateScopeAccess(user, requestedScope);
  return requestedScope;
}

/**
 * Validate that a user is allowed to access the requested scope.
 */
function validateScopeAccess(user: any, requestedScope: DataScope): void {
  // Admin users can access any scope.
  if (user.accountType === 'admin') {
    return;
  }

  // Client users can only query their own account.
  if (
    requestedScope.accountIds.length !== 1 ||
    (requestedScope.accountIds[0] !== user.accountId && requestedScope.accountIds[0] !== '*')
  ) {
    throw new Error('Client users can only query their own account');
  }

  // Client users cannot include admin data.
  if (requestedScope.includeAdmin) {
    throw new Error('Client users cannot access admin account data');
  }
}

/**
 * Build SQL WHERE clause for scoping queries.
 */
export function buildScopeWhereClause(
  scope: DataScope,
  tableAlias: string = ''
): { where: string; params: any[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const conditions: string[] = [];
  const params: any[] = [];

  if (scope.accountIds.includes('*')) {
    if (!scope.includeAdmin) {
      conditions.push(`${prefix}account_id != ?`);
      params.push('admin');
    }
  } else {
    const accountIds = [...scope.accountIds];
    if (scope.includeAdmin) {
      accountIds.push('admin');
    }

    const placeholders = accountIds.map(() => '?').join(', ');
    conditions.push(`${prefix}account_id IN (${placeholders})`);
    params.push(...accountIds);
  }

  if (scope.userId) {
    conditions.push(`${prefix}user_id = ?`);
    params.push(scope.userId);
  }

  return { where: conditions.length > 0 ? conditions.join(' AND ') : '1=1', params };
}
