---
name: code-review-enforcer
description: Reviews code changes for graph-native patterns, schema compliance, proper TODO formatting, citation requirements, and architectural contracts. Checks CLAUDE.md rules, verification-first approach, and scope-based context. Use when reviewing PRs, commits, or code changes.
allowed-tools: Read, Grep, Glob, Edit, mcp__keimenon-docs__list_todos, mcp__keimenon-docs__search_docs, mcp__keimenon-database__query_nodes
---

---

**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):

- **Context Consolidation**: Automatic, not optional (Section 13.0)
- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)
- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)
- **Full-Scope Traversal**: Address all layers (Section 13.3)
- **Recursive Intelligence**: Enrich system with every run (Section 13.4)

---

# Code Review Enforcer

## Purpose

Automated code review against Keimenon architectural principles, enforcing:

- Graph-native patterns
- Schema-driven development
- Verification-first approach
- Proper TODO/FIXME documentation
- Citation requirements
- Scope-based context rules

## When to Activate

This skill activates when you need to:

- Review pull requests
- Validate code changes before commit
- Check adherence to CLAUDE.md operating guide
- Audit TODO/FIXME/HACK comments
- Verify architectural contract compliance
- Ensure proper documentation cross-references

## Core Review Criteria

### 1. CLAUDE.md Compliance

**Graph-Native Principles** (CLAUDE.md §0):

- ✅ Everything operates on nodes/edges
- ✅ Never invents nodes outside provided ScopeSet
- ✅ Respects Sequester flags (hidden_from_llm, hidden_from_tools)
- ❌ Direct file access without node representation
- ❌ Creating nodes without explicit scope

**Message Contract** (CLAUDE.md §2):

- ✅ Outputs structured as `plan` + `artifacts`
- ✅ All artifacts match schemas in `ai_context/schemas/`
- ✅ Citations use `{node_id, span}` format
- ❌ Free-form analysis without citations
- ❌ JSON that doesn't match schema

**Verification-First** (CLAUDE.md §7):

- ✅ Claims marked as `unverified` initially
- ✅ Proposes VerifierRuns (HTTP_CHECK, SCHEMA_MATCH, COMPUTE)
- ✅ Includes confidence scores
- ❌ Marking claims as verified without tool execution
- ❌ Truth assertions without evidence

### 2. TODO Comment Standards (CLAUDE.md §8.1)

**Required Format**:

```typescript
// TODO: [Description of what needs to be done]
// FIXME: [Bug or issue that needs fixing]
// HACK: [Temporary workaround, include why and what's needed]
// NOTE: [Important implementation detail or context]
// XXX: [Critical attention required]
// BUG: [Known bug that needs addressing]
```

**Best Practice Checklist**:

- ✅ References related files: `// TODO: Update AuthContext.tsx when adding MFA (see docs/architecture/AUTH.md)`
- ✅ Includes context: `// FIXME: Race condition in useEffect - need to debounce API calls`
- ✅ Links to docs: `// TODO: Implement schema validation per ai_context/schemas/Claim.json`
- ✅ Specifies owner: `// TODO(@api-team): Add rate limiting middleware`
- ✅ Estimates scope: `// TODO(2h): Refactor to use new factory pattern`

**Invalid TODOs** (Flag these!):

- ❌ `// todo fix this` (wrong case, no context)
- ❌ `// TODO` (no description)
- ❌ `// Fix later` (not standard format)
- ❌ Uncommented TODO in string literals

### 3. Citation Requirements

**When Citations Needed**:

- Factual statements about the codebase
- Claims about system behavior
- References to documentation
- Architectural decisions

**Proper Citation Format**:

```typescript
// ✅ GOOD:
{
  "claim_text": "Auth middleware verifies JWT on every request",
  "citations": [
    { "node_id": "src_auth_middleware", "span": "line:42-58" }
  ]
}

// ❌ BAD: No citation
{
  "claim_text": "Auth middleware verifies JWT on every request",
  "citations": []
}
```

**File Reference Format** (in code comments):

```typescript
// ✅ GOOD: See docs/architecture/OVERVIEW.md:649
// ✅ GOOD: Related: components/settings/DataManagementCard.tsx:42
// ❌ BAD: See the overview doc (not specific)
```

### 4. Graph-Native Code Patterns

**Database Operations**:

```typescript
// ✅ GOOD: Uses DatabaseClient abstraction
const db = global.dbClient;
const node = await db.getNode(nodeId);

// ❌ BAD: Direct SQL without abstraction
const result = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);

// ✅ GOOD: Filters by account_id
SELECT * FROM nodes WHERE kind = 'Source' AND account_id = ?

// ❌ BAD: No account_id filter (data leak!)
SELECT * FROM nodes WHERE kind = 'Source'
```

**Node/Edge Creation**:

```typescript
// ✅ GOOD: All required fields present
await db.createNode({
  id: `src_${fingerprint}`,
  kind: 'Source',
  properties: { title, fingerprint, mime_type },
  account_id: req.user.account_id,
  created_by: req.user.id,
  created_at: Date.now(),
  updated_at: Date.now(),
});

// ❌ BAD: Missing account_id (breaks isolation)
await db.createNode({
  id: `src_${fingerprint}`,
  kind: 'Source',
  properties: { title },
  // Missing: account_id, created_by, timestamps
});
```

### 5. Schema Compliance

**Type Safety**:

- ✅ Uses Zod schemas from `packages/types/`
- ✅ Runtime validation on API boundaries
- ✅ TypeScript types inferred from Zod
- ❌ Manual type definitions without runtime validation
- ❌ Any types on API responses

**Example**:

```typescript
// ✅ GOOD: Zod validation + type inference
import { NodeSchema } from '@keimenon/types';
const node = NodeSchema.parse(req.body);

// ❌ BAD: No validation
const node = req.body as Node;
```

### 6. Architecture Contract Compliance

**Cross-Reference Protocol** (CLAUDE.md §11.4):

Before modifying code, must check:

1. `docs/architecture/*.md` - System design patterns
2. `docs/features/*.md` - Feature specifications
3. `ai_context/schemas/*.json` - Data contracts
4. Related component test files
5. Existing TODOs in modified files

**Validation**:

- ✅ References checked architecture docs
- ✅ Follows established patterns
- ✅ Updates docs if implementation differs
- ❌ Changes pattern without documenting
- ❌ Ignores related TODOs

## Review Workflow

### Step 1: Understand the Change

```bash
# Get file list
git diff --name-only

# Read changed files
Read each modified file

# Search for related TODOs
mcp__keimenon-docs__list_todos({ path: "specific/directory" })
```

### Step 2: Cross-Reference Documentation

```bash
# Search for related architecture docs
mcp__keimenon-docs__search_docs({
  query: "authentication RBAC",
  limit: 5
})

# Find related feature specs
Glob docs/features/*.md
```

### Step 3: Validate Against Principles

For each file:

1. **CLAUDE.md Compliance**: Check graph-native, verification-first, scope rules
2. **TODO Format**: Validate TODO/FIXME/HACK comments
3. **Citations**: Ensure proper references in comments/docs
4. **Multi-Tenant**: Verify account_id filtering
5. **Schema**: Check runtime validation exists
6. **Patterns**: Follow established architecture

### Step 4: Generate Review Report

```markdown
## Code Review Report

### Files Reviewed

- [apps/api/src/routes/auth.ts](apps/api/src/routes/auth.ts)
- [apps/api/src/middleware/auth.middleware.ts](apps/api/src/middleware/auth.middleware.ts)

### CLAUDE.md Compliance

✅ Graph-native: All operations use DatabaseClient
✅ Verification-first: JWT validation uses tool (jsonwebtoken)
✅ Scope-based: Only operates on provided session scope
⚠️ Message contract: Some responses lack structured format

### TODO Comment Review

✅ 5 TODOs properly formatted with context
❌ 2 TODOs missing file references:

- Line 42: `// TODO: Add refresh tokens` → Should reference schema file
- Line 89: `// FIXME: Handle expired sessions` → Should include context

### Citation Review

✅ Auth flow documented with line references
❌ Missing citation for JWT expiry claim (line 156)

### Multi-Tenant Safety

✅ All queries filter by account_id
✅ Session table includes account_id FK
✅ Middleware attaches req.user.account_id

### Schema Compliance

✅ Uses Zod validation on /login endpoint
❌ Missing validation on /refresh endpoint (line 234)

### Architecture Compliance

✅ Follows patterns in docs/architecture/AUTHENTICATION.md
✅ Cross-referenced related TODOs
⚠️ TODO at OVERVIEW.md:649 suggests MFA - should be prioritized

### Recommendations

1. **High Priority**:
   - Add Zod validation to /refresh endpoint
   - Fix 2 TODOs missing file references
   - Add citation for JWT expiry claim

2. **Medium Priority**:
   - Structure responses per CLAUDE.md message contract
   - Consider implementing MFA (per OVERVIEW.md:649)

3. **Low Priority**:
   - Add more inline documentation for complex logic
   - Consider extracting JWT config to separate file

### Approval Status

⚠️ **Conditional Approval** - Fix high priority items before merge
```

## MCP Tools Usage

### List TODOs

```typescript
// Find all TODOs in a specific area
const todos =
  (await mcp__keimenon) -
  docs__list_todos({
    path: 'apps/api/src/routes',
    type: 'TODO',
  });

// Find critical items (XXX, BUG)
const critical =
  (await mcp__keimenon) -
  docs__list_todos({
    type: 'XXX',
  });
```

### Search Documentation

```typescript
// Find related architecture docs
const docs =
  (await mcp__keimenon) -
  docs__search_docs({
    query: 'authentication JWT session',
    context_lines: 3,
    limit: 10,
  });
```

### Query Database for Context

```typescript
// Check existing patterns
const nodes =
  (await mcp__keimenon) -
  database__query_nodes({
    kind: 'Source',
    limit: 5,
  });
```

## Review Checklists

### Backend Code (apps/api/)

- [ ] Uses DatabaseClient interface (not direct SQL)
- [ ] All queries filter by account_id
- [ ] Runtime validation with Zod on API boundaries
- [ ] Error handling with proper middleware
- [ ] TODOs follow standard format with context
- [ ] References architecture docs in comments
- [ ] Audit trail (created_by, timestamps) on all mutations

### Frontend Code (apps/web/)

- [ ] API calls include Authorization header
- [ ] Error states handled gracefully
- [ ] Loading states for async operations
- [ ] Accessibility attributes (aria-\*, role)
- [ ] TODOs reference related components/docs
- [ ] No hardcoded API URLs (uses env vars)

### Database Code (packages/db/)

- [ ] Multi-tenant isolation enforced
- [ ] Foreign key constraints defined
- [ ] Indexes on frequently queried columns
- [ ] WAL mode enabled for SQLite
- [ ] Migration scripts idempotent
- [ ] Schema documented

### Shared Packages (packages/\*)

- [ ] Zod schemas for all data models
- [ ] TypeScript types exported
- [ ] No external dependencies without justification
- [ ] Unit tests for critical logic
- [ ] README with usage examples

## Common Anti-Patterns

### 1. Scope Hallucination

```typescript
// ❌ BAD: Inventing nodes without scope
const newNode = createNode({ kind: 'Source', ... });

// ✅ GOOD: Only operate on provided scope
if (!scope.includes(nodeId)) {
  throw new Error('Node not in scope');
}
```

### 2. Missing Verification

```typescript
// ❌ BAD: Asserting truth without verification
claim.status = 'verified';

// ✅ GOOD: Propose verification
return {
  claim,
  verifier_plan: {
    runs: [{ kind: 'HTTP_CHECK', url: '...' }],
  },
};
```

### 3. Cross-Account Data Leak

```typescript
// ❌ BAD: No account filter
SELECT * FROM nodes WHERE kind = 'Source'

// ✅ GOOD: Always filter by account_id
SELECT * FROM nodes WHERE kind = 'Source' AND account_id = ?
```

### 4. Poor TODO Documentation

```typescript
// ❌ BAD: No context
// TODO: fix this

// ✅ GOOD: Full context with references
// TODO(2h): Refactor to use factory pattern per docs/architecture/DATABASE.md:856
// Currently using direct instantiation which breaks with hybrid storage mode
```

## Success Metrics

A code change passes review when:

- ✅ All CLAUDE.md principles followed
- ✅ TODOs properly formatted (if any added)
- ✅ Citations present for factual claims
- ✅ Multi-tenant isolation enforced
- ✅ Schema validation on API boundaries
- ✅ Architecture docs cross-referenced
- ✅ No critical anti-patterns detected
- ✅ Related TODOs acknowledged/addressed

## Reference Files

- [CLAUDE.md](../../../CLAUDE.md) - Operating guide (primary reference)
- [docs/architecture/OVERVIEW.md](../../../docs/architecture/OVERVIEW.md) - System architecture
- [docs/architecture/DATABASE.md](../../../docs/architecture/DATABASE.md) - Database patterns
- [docs/architecture/API_DESIGN.md](../../../docs/architecture/API_DESIGN.md) - API conventions
- [packages/types/src/](../../../packages/types/src/) - Schema definitions

---

**Note**: This skill can propose edits but requires confirmation. Use Edit tool to fix issues after generating report.
