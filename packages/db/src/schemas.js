"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDGE_TYPES = exports.NODE_LABELS = void 0;
exports.NODE_LABELS = [
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
];
exports.EDGE_TYPES = [
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
];
//# sourceMappingURL=schemas.js.map