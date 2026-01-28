/**
 * Node Kind Constants
 *
 * Single source of truth for node kinds used across deletion operations,
 * queries, and tests. Prevents copy-paste errors and ensures consistency.
 *
 * Related:
 * - apps/api/src/modules/workers/infrastructure/DeleteWorker.ts
 * - apps/api/src/routes/data-management.ts
 * - apps/api/src/__tests__/jobs-batched-delete.test.ts
 * - packages/types/src/nodes.ts (schema definitions)
 * - packages/types/src/plans.ts (Board schema)
 */

/**
 * Keimenon Data Node Kinds
 *
 * These node kinds represent user-generated content and conversation data.
 * They are safe to delete when clearing keimenon data without affecting
 * system integrity.
 *
 * Use cases:
 * - Delete keimenon data operations (scope: 'keimenon')
 * - Data export/import
 * - User data queries
 */
export const CANVAS_DATA_NODE_KINDS = [
  'ChatThread',
  'Message',
  'Source',
  'CodeBlock',
  'Group',
  'Folder',
] as const;

/**
 * System Node Kinds
 *
 * These node kinds represent system-critical data that should NEVER be
 * deleted during keimenon data operations. Deleting these would corrupt
 * the account structure or user identity.
 *
 * Use cases:
 * - Exclusion filters for delete operations
 * - System integrity checks
 * - Multi-tenant boundary verification
 */
export const SYSTEM_NODE_KINDS = ['UserNode', 'AccountNode', 'Board', 'Constellation'] as const;

/**
 * All Node Kinds (Comprehensive)
 *
 * Union of all node kinds in the system. Useful for validation
 * and type checking.
 */
export const ALL_NODE_KINDS = [
  ...CANVAS_DATA_NODE_KINDS,
  ...SYSTEM_NODE_KINDS,
  'ObjectiveClaim', // Claims are preserved separately, not keimenon data
  'UnifiedDoc', // Documentation is preserved separately
] as const;

/**
 * Content Node Kinds
 *
 * Node kinds that have content stored externally (content_location field).
 * Useful for cleanup operations and storage management.
 */
export const CONTENT_NODE_KINDS = ['Source', 'Message', 'CodeBlock', 'UnifiedDoc'] as const;

// TypeScript type exports for type safety
export type KeimenonDataNodeKind = (typeof CANVAS_DATA_NODE_KINDS)[number];
export type SystemNodeKind = (typeof SYSTEM_NODE_KINDS)[number];
export type NodeKind = (typeof ALL_NODE_KINDS)[number];
export type ContentNodeKind = (typeof CONTENT_NODE_KINDS)[number];

/**
 * Helper: Check if a node kind is keimenon data
 *
 * @example
 * if (isKeimenonDataNode('Message')) { ... }
 */
export function isKeimenonDataNode(kind: string): kind is KeimenonDataNodeKind {
  return (CANVAS_DATA_NODE_KINDS as readonly string[]).includes(kind);
}

/**
 * Helper: Check if a node kind is system-critical
 *
 * @example
 * if (isSystemNode('UserNode')) { ... }
 */
export function isSystemNode(kind: string): kind is SystemNodeKind {
  return (SYSTEM_NODE_KINDS as readonly string[]).includes(kind);
}

/**
 * Helper: Get SQL IN clause for keimenon data nodes
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind IN (${getKeimenonDataInClause()})`;
 */
export function getKeimenonDataInClause(): string {
  return CANVAS_DATA_NODE_KINDS.map((k) => `'${k}'`).join(', ');
}

/**
 * Helper: Get SQL IN clause for system nodes
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind NOT IN (${getSystemNodeInClause()})`;
 */
export function getSystemNodeInClause(): string {
  return SYSTEM_NODE_KINDS.map((k) => `'${k}'`).join(', ');
}
