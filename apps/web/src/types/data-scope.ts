/**
 * Data Scoping Types
 *
 * Defines how data visibility is scoped across account types.
 */

import { User } from '@/lib/api-client';

/**
 * Scope object that defines which account data should be included in queries.
 */
export interface DataScope {
  /**
   * List of account IDs to include.
   * - ['*'] = all accounts (admin only)
   * - [accountId] = specific account
   * - multiple IDs = specific subset
   */
  accountIds: string[];

  /**
   * Whether to include admin account data.
   */
  includeAdmin: boolean;

  /**
   * Optional user-level filtering.
   */
  userId?: string;
}

/**
 * Get the appropriate data scope for a given user.
 */
export function getScopeForUser(user: User): DataScope {
  if (user.permission_level === 'admin') {
    return {
      accountIds: ['*'],
      includeAdmin: true,
    };
  }

  return {
    accountIds: [user.account_id],
    includeAdmin: false,
  };
}

/**
 * Serialize scope to URL query parameters.
 */
export function scopeToQueryParams(scope: DataScope): string {
  const params = new URLSearchParams();
  params.set('accountIds', scope.accountIds.join(','));
  params.set('includeAdmin', String(scope.includeAdmin));
  if (scope.userId) {
    params.set('userId', scope.userId);
  }
  return params.toString();
}

/**
 * Parse scope from URL query parameters.
 *
 * Backward compatibility:
 * - Accepts legacy `tenantIds` query key.
 */
export function scopeFromQueryParams(queryParams: any): DataScope | null {
  const accountIdsParam = queryParams.accountIds || queryParams.tenantIds;
  if (!accountIdsParam) {
    return null;
  }

  return {
    accountIds: accountIdsParam.split(','),
    includeAdmin: queryParams.includeAdmin === 'true',
    userId: queryParams.userId || undefined,
  };
}

/**
 * Validate that a user is allowed to access a given scope.
 */
export function validateScopeAccess(user: User, requestedScope: DataScope): void {
  if (user.permission_level === 'admin') {
    return;
  }

  if (requestedScope.accountIds.length !== 1 || requestedScope.accountIds[0] !== user.account_id) {
    throw new Error('Client users can only query their own account');
  }

  if (requestedScope.includeAdmin) {
    throw new Error('Client users cannot access admin account data');
  }
}
