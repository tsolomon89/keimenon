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
export declare const NODE_LABELS: readonly ["Node", "Source", "Group", "Folder", "ObjectiveClaim", "UnifiedDoc", "Constellation", "UserNode", "ChatThread", "Message", "CodeAsset", "Workspace", "Board"];
export declare const EDGE_TYPES: readonly ["CONTAINS", "SEQUESTERS", "DERIVES_FROM", "IN_SCOPE_FOR", "EQUIVALENT_TO", "DUP_OF", "SUPPORTS", "REFUTES", "VERIFIED_BY", "OWNED_BY", "HAS_MESSAGE", "COMPILED_FROM"];
export type NodeLabel = typeof NODE_LABELS[number];
export type EdgeType = typeof EDGE_TYPES[number];
//# sourceMappingURL=schemas.d.ts.map