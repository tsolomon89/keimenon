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
  'UploadItem',
  'ChatThread',
  'Message',
  'Source',
  'SourceDoc',
  'CodeBlock',
  'Group',
  'Folder',
] as const;

/**
 * UGC Spine Node Kinds (Vision V2)
 *
 * These node kinds represent the lexical spine - word/phrase/topic nodes
 * extracted from user-generated content. They form the navigable "wiki"
 * layer of the knowledge graph.
 *
 * Use cases:
 * - Lexeme: canonical word tokens with lemma and POS
 * - Phrase: n-grams, named entities, concepts
 * - Topic: clusters of phrases with semantic coherence
 */
export const SPINE_NODE_KINDS = ['Lexeme', 'Phrase', 'Topic'] as const;

/**
 * Verified Node Kinds (Vision V2)
 *
 * These node kinds represent externally verified information with
 * provenance tracking. They form the "source of truth" layer.
 *
 * Use cases:
 * - VerifiedSource: external sources with trust scores
 * - VerifiedClaim: facts anchored to verified sources
 */
export const VERIFIED_NODE_KINDS = ['VerifiedSource', 'VerifiedClaim'] as const;

/**
 * Agent Node Kinds (Agent Services)
 *
 * These node kinds represent AI agent infrastructure for automated tasks.
 * Created per-account to track agent operations, capabilities, and outputs.
 *
 * Use cases:
 * - AgentNode: AI agent identity and configuration (DEPRECATED - use Principal)
 * - CanonicalDoc: Agent-generated summaries/documents
 * - DuplicateCluster: Proposed duplicate groupings
 * - Evidence: Verification evidence chains
 */
export const AGENT_NODE_KINDS = [
  'AgentNode',
  'CanonicalDoc',
  'DuplicateCluster',
  'Evidence',
] as const;

/**
 * Principal Node Kinds (World Model V5)
 *
 * Unified principal model - same shape for humans, agents, contacts.
 * Agent-ness is a permissioned skillset, not a different species.
 *
 * The equivalence claim: Contact = Agent = Human because all are principals
 * with permissions, provenance, and relationships.
 *
 * Use cases:
 * - Principal: Unified actor (human, agent, or contact)
 * - ConversationThread: Formal join of principal + agent + context + purpose
 */
export const PRINCIPAL_NODE_KINDS = ['Principal', 'ConversationThread'] as const;

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
export const SYSTEM_NODE_KINDS = [
  'UserNode',
  'AccountNode',
  'Board',
  'Constellation',
  'AgentNode',
  'Principal',
] as const;

/**
 * All Node Kinds (Comprehensive)
 *
 * Union of all node kinds in the system. Useful for validation
 * and type checking.
 */
export const ALL_NODE_KINDS = [
  ...CANVAS_DATA_NODE_KINDS,
  ...SYSTEM_NODE_KINDS,
  ...SPINE_NODE_KINDS,
  ...VERIFIED_NODE_KINDS,
  ...AGENT_NODE_KINDS,
  ...PRINCIPAL_NODE_KINDS,
  'ObjectiveClaim', // Claims are preserved separately, not keimenon data
  'UnifiedDoc', // Documentation is preserved separately
] as const;

/**
 * Content Node Kinds
 *
 * Node kinds that have content stored externally (content_location field).
 * Useful for cleanup operations and storage management.
 */
export const CONTENT_NODE_KINDS = [
  'Source',
  'SourceDoc',
  'Message',
  'CodeBlock',
  'UnifiedDoc',
] as const;

// TypeScript type exports for type safety
export type KeimenonDataNodeKind = (typeof CANVAS_DATA_NODE_KINDS)[number];
export type SystemNodeKind = (typeof SYSTEM_NODE_KINDS)[number];
export type SpineNodeKind = (typeof SPINE_NODE_KINDS)[number];
export type VerifiedNodeKind = (typeof VERIFIED_NODE_KINDS)[number];
export type AgentNodeKind = (typeof AGENT_NODE_KINDS)[number];
export type PrincipalNodeKind = (typeof PRINCIPAL_NODE_KINDS)[number];
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
 * Helper: Check if a node kind is a UGC spine node (V2)
 *
 * @example
 * if (isSpineNode('Lexeme')) { ... }
 */
export function isSpineNode(kind: string): kind is SpineNodeKind {
  return (SPINE_NODE_KINDS as readonly string[]).includes(kind);
}

/**
 * Helper: Check if a node kind is a verified node (V2)
 *
 * @example
 * if (isVerifiedNode('VerifiedClaim')) { ... }
 */
export function isVerifiedNode(kind: string): kind is VerifiedNodeKind {
  return (VERIFIED_NODE_KINDS as readonly string[]).includes(kind);
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

/**
 * Helper: Get SQL IN clause for spine nodes (V2)
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind IN (${getSpineNodeInClause()})`;
 */
export function getSpineNodeInClause(): string {
  return SPINE_NODE_KINDS.map((k) => `'${k}'`).join(', ');
}

/**
 * Helper: Get SQL IN clause for verified nodes (V2)
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind IN (${getVerifiedNodeInClause()})`;
 */
export function getVerifiedNodeInClause(): string {
  return VERIFIED_NODE_KINDS.map((k) => `'${k}'`).join(', ');
}

/**
 * Helper: Get SQL IN clause for all V2 nodes (spine + verified)
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind IN (${getV2NodeInClause()})`;
 */
export function getV2NodeInClause(): string {
  return [...SPINE_NODE_KINDS, ...VERIFIED_NODE_KINDS].map((k) => `'${k}'`).join(', ');
}

/**
 * Helper: Check if a node kind is an agent node
 *
 * @example
 * if (isAgentNode('AgentNode')) { ... }
 */
export function isAgentNode(kind: string): kind is AgentNodeKind {
  return (AGENT_NODE_KINDS as readonly string[]).includes(kind);
}

/**
 * Helper: Get SQL IN clause for agent nodes
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind IN (${getAgentNodeInClause()})`;
 */
export function getAgentNodeInClause(): string {
  return AGENT_NODE_KINDS.map((k) => `'${k}'`).join(', ');
}

/**
 * Helper: Check if a node kind is a principal node (World Model V5)
 *
 * @example
 * if (isPrincipalNode('Principal')) { ... }
 */
export function isPrincipalNode(kind: string): kind is PrincipalNodeKind {
  return (PRINCIPAL_NODE_KINDS as readonly string[]).includes(kind);
}

/**
 * Helper: Get SQL IN clause for principal nodes (World Model V5)
 *
 * @example
 * const query = `SELECT * FROM nodes WHERE kind IN (${getPrincipalNodeInClause()})`;
 */
export function getPrincipalNodeInClause(): string {
  return PRINCIPAL_NODE_KINDS.map((k) => `'${k}'`).join(', ');
}

/**
 * Helper: Check if a node kind represents an actor (human, agent, or contact)
 *
 * This includes both legacy UserNode/AgentNode and new Principal nodes.
 *
 * @example
 * if (isActorNode('Principal')) { ... }
 * if (isActorNode('UserNode')) { ... }  // Legacy
 */
export function isActorNode(kind: string): boolean {
  const actorKinds = ['Principal', 'UserNode', 'AgentNode'];
  return actorKinds.includes(kind);
}
