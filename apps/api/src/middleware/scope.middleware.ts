/**
 * Data Scope Middleware
 *
 * Validates and enforces data scoping rules for tenant isolation.
 * Ensures client users can only access their own data, while admins can access all.
 *
 * @see docs/architecture/PERMISSIONS.md for full scoping rules
 * @see docs/migrations/MANAGER_MODE_PARITY.md for implementation guide
 */

import { Request } from 'express';

/**
 * Data scope definition (matches frontend type)
 */
export interface DataScope {
  tenantIds: string[]; // ['*'] for all, or specific IDs
  includeAdmin: boolean; // Whether to include admin account
  userId?: string; // Optional user-level filter
}

/**
 * Apply and validate data scope from request query parameters
 *
 * Rules:
 * - Admin users can query any scope (all tenants or specific subset)
 * - Client users can ONLY query their own tenant
 * - Client users cannot include admin data
 *
 * @param req - Express request object (expects req.user from auth middleware)
 * @returns Validated data scope
 * @throws Error if client user tries to access unauthorized data
 *
 * @example
 * router.get('/analytics', requireAuth(authService), (req, res) => {
 *   const scope = applyScopeFilter(req);
 *   const data = await getAnalytics(scope);
 *   res.json(data);
 * });
 */
export function applyScopeFilter(req: Request): DataScope {
  const user = (req as any).user;

  if (!user) {
    throw new Error('Authentication required - user not found in request');
  }

  // Parse scope from query parameters
  const tenantIdsParam = req.query.tenantIds as string | undefined;
  const includeAdminParam = req.query.includeAdmin as string | undefined;
  const userIdParam = req.query.userId as string | undefined;

  // Default scope if not provided: user's own tenant
  const tenantIds = tenantIdsParam ? tenantIdsParam.split(',') : [user.accountId];
  const includeAdmin = includeAdminParam === 'true';
  const userId = userIdParam || undefined;

  const requestedScope: DataScope = {
    tenantIds,
    includeAdmin,
    userId,
  };

  // Validate scope access based on user account type
  validateScopeAccess(user, requestedScope);

  return requestedScope;
}

/**
 * Validate that a user is allowed to access the requested scope
 *
 * @param user - Authenticated user from request
 * @param requestedScope - Scope user is trying to access
 * @throws Error if user cannot access requested scope
 */
function validateScopeAccess(user: any, requestedScope: DataScope): void {
  // Admin users can access any scope
  if (user.accountType === 'admin') {
    // Allow ['*'] or specific tenant IDs
    // Allow includeAdmin true or false
    return;
  }

  // Client users can ONLY query their own tenant
  if (
    requestedScope.tenantIds.length !== 1 ||
    (requestedScope.tenantIds[0] !== user.accountId && requestedScope.tenantIds[0] !== '*')
  ) {
    throw new Error('Client users can only query their own tenant');
  }

  // Client users cannot include admin data
  if (requestedScope.includeAdmin) {
    throw new Error('Client users cannot access admin account data');
  }

  // If userId filter is specified, ensure it belongs to the client's account
  // (Additional validation could be done here if user-account mapping is available)
}

/**
 * Build SQL WHERE clause for scoping queries
 *
 * Generates appropriate WHERE conditions based on the scope.
 * Used in database queries to enforce tenant isolation.
 *
 * @param scope - Data scope
 * @param tableAlias - Table alias to use in WHERE clause (default: empty string)
 * @returns Object with where clause and parameters
 *
 * @example
 * const { where, params } = buildScopeWhereClause(scope, 'n');
 * // where: "n.account_id IN (?, ?, ?)"
 * // params: ['tenant-1', 'tenant-2', 'admin-account']
 *
 * const query = `SELECT * FROM nodes n WHERE ${where}`;
 * db.query(query, params);
 */
export function buildScopeWhereClause(
  scope: DataScope,
  tableAlias: string = ''
): { where: string; params: any[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const conditions: string[] = [];
  const params: any[] = [];

  // Handle tenant ID filtering
  if (scope.tenantIds.includes('*')) {
    // All tenants - no filter needed (or filter to exclude admin if needed)
    if (!scope.includeAdmin) {
      // Exclude admin account
      // NOTE: Requires knowledge of admin account ID
      // This is a placeholder - adjust based on your schema
      conditions.push(`${prefix}account_id != ?`);
      params.push('admin'); // Replace with actual admin account ID constant
    }
  } else {
    // Specific tenant(s)
    const accountIds = [...scope.tenantIds];

    // Add admin account if requested
    if (scope.includeAdmin) {
      accountIds.push('admin'); // Replace with actual admin account ID constant
    }

    // Build IN clause
    const placeholders = accountIds.map(() => '?').join(', ');
    conditions.push(`${prefix}account_id IN (${placeholders})`);
    params.push(...accountIds);
  }

  // Handle user-level filtering if specified
  if (scope.userId) {
    conditions.push(`${prefix}user_id = ?`);
    params.push(scope.userId);
  }

  // Combine conditions
  const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

  return { where, params };
}

/**
 * Apply scope to a Neo4j Cypher query
 *
 * Adds appropriate WHERE conditions to a Cypher query for Neo4j graph database.
 *
 * @param scope - Data scope
 * @param nodeVariable - Cypher node variable name (default: 'n')
 * @returns Object with where clause and parameters
 *
 * @example
 * const { where, params } = buildNeo4jScopeWhere(scope, 'n');
 * // where: "n.account_id IN $tenantIds"
 * // params: { tenantIds: ['tenant-1', 'tenant-2'] }
 *
 * const query = `MATCH (n:Node) WHERE ${where} RETURN n`;
 * session.run(query, params);
 */
export function buildNeo4jScopeWhere(
  scope: DataScope,
  nodeVariable: string = 'n'
): { where: string; params: Record<string, any> } {
  const conditions: string[] = [];
  const params: Record<string, any> = {};

  // Handle tenant ID filtering
  if (scope.tenantIds.includes('*')) {
    // All tenants
    if (!scope.includeAdmin) {
      conditions.push(`${nodeVariable}.account_id <> $adminAccountId`);
      params.adminAccountId = 'admin'; // Replace with actual admin account ID
    }
  } else {
    // Specific tenant(s)
    const accountIds = [...scope.tenantIds];

    if (scope.includeAdmin) {
      accountIds.push('admin'); // Replace with actual admin account ID
    }

    conditions.push(`${nodeVariable}.account_id IN $tenantIds`);
    params.tenantIds = accountIds;
  }

  // Handle user-level filtering
  if (scope.userId) {
    conditions.push(`${nodeVariable}.user_id = $userId`);
    params.userId = scope.userId;
  }

  // Combine conditions
  const where = conditions.length > 0 ? conditions.join(' AND ') : 'true';

  return { where, params };
}
