---
name: graph-schema-validator
description: Validates node and edge operations against JSON schemas in ai_context/schemas/. Checks account_id isolation, proper fingerprinting, edge type correctness, and graph-native principles compliance. Use when creating/modifying nodes, edges, or database operations.
allowed-tools: Read, Grep, Glob, mcp__keimenon-database__query_nodes, mcp__keimenon-database__query_edges, mcp__keimenon-database__inspect_schema
---

---

**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):

- **Context Consolidation**: Automatic, not optional (Section 13.0)
- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)
- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)
- **Full-Scope Traversal**: Address all layers (Section 13.3)
- **Recursive Intelligence**: Enrich system with every run (Section 13.4)

---

# Graph Schema Validator

## Purpose

Ensure all graph operations comply with Keimenon architectural principles:

- Graph-native data model (everything is a node)
- Schema-driven validation
- Multi-tenant isolation
- Content-addressable storage
- Verification-first approach

## When to Activate

This skill activates when you need to:

- Create or modify nodes in the graph database
- Create or modify edges between nodes
- Validate database operations
- Check schema compliance
- Verify multi-tenant data isolation
- Review graph-related code changes

## Core Responsibilities

### 1. Schema Validation

**Node Schema Validation**:

- Verify node has required fields: `id`, `kind`, `properties`, `account_id`, `created_by`, `created_at`, `updated_at`
- Check `kind` is one of 11 valid types: Source, Group, Folder, Board, ChatThread, Message, CodeBlock, ObjectiveClaim, UnifiedDoc, Constellation, UserNode, AccountNode
- Validate `properties` JSON matches kind-specific schema in `ai_context/schemas/`
- Ensure ID format matches convention: `{kind_prefix}_{hash}` (e.g., `src_abc123`, `grp_xyz789`)

**Edge Schema Validation**:

- Verify edge has required fields: `id`, `kind`, `from_id`, `to_id`, `account_id`, `created_by`, `created_at`
- Check `kind` is one of 11 valid types: CONTAINS, DERIVES_FROM, DUP_OF, SIMILAR_TO, COMPILED_FROM, STITCHED_FROM, EXTRACTED_FROM, SEQUESTERS, SUPPORTS, REFUTES, VERIFIED_BY
- Validate edge semantics make sense (e.g., ChatThread CONTAINS Message, not vice versa)
- Ensure `properties` JSON is valid if present

**Reference Schemas**:

- Node schemas: `ai_context/schemas/{NodeKind}.json` (e.g., Source.json, Message.json)
- Edge schemas: `ai_context/schemas/edges.json`
- If schemas don't exist, reference `packages/types/src/nodes.ts` and `packages/types/src/edges.ts`

### 2. Multi-Tenant Isolation

**Account ID Enforcement**:

- Every node MUST have `account_id` field
- Every edge MUST have `account_id` field
- All database queries MUST filter by `account_id`
- Never allow cross-account data access (except admin accounts with account_type='admin')

**Audit Trail**:

- Every node MUST have `created_by` field (user ID)
- Every edge MUST have `created_by` field (user ID)
- Timestamps required: `created_at`, `updated_at` (Unix milliseconds)

**Validation Queries**:

```typescript
// ✅ GOOD: Filtered by account_id
SELECT * FROM nodes WHERE kind = 'Source' AND account_id = ?

// ❌ BAD: No account_id filter (data leak!)
SELECT * FROM nodes WHERE kind = 'Source'
```

### 3. Content-Addressable Storage

**Fingerprinting Rules**:

- Source nodes: MUST have `fingerprint` property (SHA-256 of content)
- CodeBlock nodes: MUST have `fingerprint` property (SHA-256 of normalized code)
- Message nodes: Optional fingerprint for deduplication

**Deduplication Check**:

- Before creating Source/CodeBlock, query for existing node with same fingerprint
- If duplicate exists, create DUP_OF edge instead of new node
- Fingerprint format: lowercase hex string (64 characters for SHA-256)

**Validation**:

```typescript
// Check for duplicate before creating Source node
const existing = await queryNodes({
  kind: 'Source',
  fingerprint: calculatedFingerprint,
  account_id: currentAccountId,
});

if (existing.length > 0) {
  // Create DUP_OF edge, not new node
}
```

### 4. Edge Semantics

**Valid Edge Patterns**:

- `Group -[CONTAINS]-> Source` - Group contains sources
- `ChatThread -[CONTAINS]-> Message` - Thread contains messages
- `Source -[DERIVES_FROM]-> Message` - Source compiled from messages
- `CodeBlock -[EXTRACTED_FROM]-> Message` - Code extracted from message
- `Message -[DUP_OF]-> Message` - Duplicate message
- `ObjectiveClaim -[SUPPORTS]-> ObjectiveClaim` - Claim supports another
- `ObjectiveClaim -[REFUTES]-> ObjectiveClaim` - Claim refutes another

**Invalid Patterns** (Flag these!):

- ❌ `Message -[CONTAINS]-> ChatThread` (backwards direction)
- ❌ `Source -[SUPPORTS]-> ObjectiveClaim` (wrong relationship)
- ❌ Self-referencing edges without good reason
- ❌ Edges without `account_id` or `created_by`

### 5. Graph-Native Principles (from CLAUDE.md)

**Never Invent Nodes**:

- Only operate on provided ScopeSet
- Don't create nodes without explicit instruction
- Reference existing nodes by ID

**Sequester Flags**:

- Respect `hidden_from_llm` and `hidden_from_tools` in edge properties
- Never expose sequestered content
- Check SEQUESTERS edges before accessing content

**Verification-First**:

- Propose VerifierRuns for claims (HTTP_CHECK, SCHEMA_MATCH, COMPUTE)
- Never mark claims as verified without tool verification
- Include confidence scores on ObjectiveClaim nodes

## Validation Workflow

### When Reviewing Code

1. **Read the code** being modified (use Read tool)
2. **Check for schemas** in `ai_context/schemas/` (use Glob tool)
3. **Query database** for similar operations (use MCP keimenon-database tools)
4. **Validate** against rules above
5. **Report findings**:
   - ✅ What's correct
   - ❌ What violates principles
   - 💡 Suggestions for fixes
   - 📚 Reference relevant docs (CLAUDE.md, DATABASE.md, OVERVIEW.md)

### When Creating New Operations

1. **Understand the requirement** (what node/edge to create)
2. **Check schema** in `ai_context/schemas/` or `packages/types/src/`
3. **Verify multi-tenant safety** (account_id present)
4. **Check for duplicates** if fingerprinting applies
5. **Validate edge semantics** (correct direction and kind)
6. **Generate validation report**

## MCP Server Usage

### Query Nodes

```typescript
// Use keimenon-database MCP server
mcp__keimenon -
  database__query_nodes({
    kind: 'Source',
    account_id: 'acc_xyz789',
    limit: 50,
  });
```

### Query Edges

```typescript
mcp__keimenon -
  database__query_edges({
    kind: 'CONTAINS',
    from_id: 'grp_abc123',
    limit: 100,
  });
```

### Inspect Schema

```typescript
mcp__keimenon -
  database__inspect_schema({
    table_name: 'nodes', // or "edges"
  });
```

## Reference Files

**Key Documentation**:

- [CLAUDE.md](../../../CLAUDE.md) - Operating guide and principles
- [docs/architecture/DATABASE.md](../../../docs/architecture/DATABASE.md) - Database schema
- [docs/architecture/OVERVIEW.md](../../../docs/architecture/OVERVIEW.md) - System architecture
- [packages/types/src/nodes.ts](../../../packages/types/src/nodes.ts) - Node type definitions
- [packages/types/src/edges.ts](../../../packages/types/src/edges.ts) - Edge type definitions

**Schema Location**:

- Preferred: `ai_context/schemas/*.json`
- Fallback: `packages/types/src/*.ts` (TypeScript types as reference)

## Example Validation Report

```markdown
## Graph Schema Validation Report

### Node: Source (src_abc123)

✅ Has all required fields
✅ Account ID present: acc_xyz789
✅ Fingerprint valid: 64-char hex
⚠️ Missing board_id in properties (should be assigned to a board)

### Edge: CONTAINS (edge_xyz)

✅ Valid edge kind
✅ Direction correct: grp_abc -> src_abc123
✅ Account ID matches both nodes
❌ Missing created_by field (required for audit trail)

### Multi-Tenant Isolation

✅ All operations filtered by account_id
✅ No cross-account references detected

### Recommendations

1. Add created_by field to CONTAINS edge
2. Assign Source node to a board (add board_id to properties)
3. Consider adding content_summary for better searchability
```

## Error Patterns to Watch For

**Common Mistakes**:

1. Forgetting `account_id` on nodes/edges
2. Using wrong edge direction (Message -> ChatThread instead of ChatThread -> Message)
3. Creating duplicate nodes without checking fingerprint
4. Missing `created_by` for audit trail
5. Invalid node kind (typos: "source" instead of "Source")
6. Malformed IDs (missing prefix or wrong format)
7. Cross-account data leaks (no account_id filter)

## Success Criteria

A graph operation is valid when:

- ✅ All required fields present
- ✅ Schemas match (if defined in ai_context/schemas/)
- ✅ Multi-tenant isolation enforced
- ✅ Fingerprinting applied where needed
- ✅ Edge semantics are correct
- ✅ No cross-account data leaks
- ✅ Audit trail complete (created_by, timestamps)

---

**Note**: This skill is read-only by design. It validates and reports issues but does not make changes. Use Edit tool separately to fix issues after validation.
