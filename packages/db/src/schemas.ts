/**
 * Neo4j schema initialization and management
 *
 * Node labels:
 * - Node (base label for all nodes)
 * - Source, Group, Folder, ObjectiveClaim, UnifiedDoc, Constellation
 * - UserNode, ChatThread, Message
 * - Workspace, Board
 *
 * Relationship types:
 * - CONTAINS, SEQUESTERS, DERIVES_FROM, IN_SCOPE_FOR
 * - EQUIVALENT_TO, DUP_OF, SUPPORTS, REFUTES, VERIFIED_BY
 */

export const NODE_LABELS = [
  'Node',
  'Source',
  'Group',
  'Folder',
  'ObjectiveClaim',
  'UnifiedDoc',
  'Constellation',
  'UserNode',
  'ChatThread',
  'Message',
  'CodeAsset',
  'Workspace',
  'Board',
] as const;

export const EDGE_TYPES = [
  'CONTAINS',
  'SEQUESTERS',
  'DERIVES_FROM',
  'IN_SCOPE_FOR',
  'EQUIVALENT_TO',
  'DUP_OF',
  'SUPPORTS',
  'REFUTES',
  'VERIFIED_BY',
  'OWNED_BY',
  'HAS_MESSAGE',
  'COMPILED_FROM',
] as const;

export type NodeLabel = typeof NODE_LABELS[number];
export type EdgeType = typeof EDGE_TYPES[number];
