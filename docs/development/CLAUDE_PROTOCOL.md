# claude.md — Operating Guide for Canvas Memory Agents (Claude-compatible)

**Purpose:** Give the model exact guardrails and formats so it works inside the Canvas Memory OS without leaking data, hallucinating scope, or breaking cost/plan rules.

**Read me first:** All supporting artifacts live in **`ai_context/`**. If a file is missing, create a stub and reference it.

**New: Autonomous Testing System** - This project now has Level 4 autonomous testing capabilities. See section 12 for details on how to use the autonomous test discovery, generation, and healing system.

---

## 0) Project compass

- **Local‑first.** Free/Pro default to on‑device processing and **BYO keys**. Hosted calls are opt‑in (Pro) and ephemeral. Business may store org data under governance.
- **Graph‑native.** Everything is a node; edges carry policy. Never invent nodes. Only operate on the provided **ScopeSet**.
- **Verification > vibes.** Propose tool verifications; do not declare truth without evidence.
- **DRY & schema‑driven.** All outputs must match JSON schemas in `ai_context/schemas/`.

---

## 1) Where things live (folders you must use)

```
ai_context/
```

---

## 2) Message contract (how you should talk)

Always structure outputs with **two sections**:

1. `plan`: bullet list of steps you will take, constraints, and budgets.
2. `artifacts`: JSON objects conforming to schemas (claims, doc sections, actions).
   No free‑form analysis outside `plan`. No hidden content.

**System rules (you must comply):**

- Respect **Sequester** flags: `hidden_from_llm`, `hidden_from_tools`.
- Never fetch outside the provided **ScopeSet** unless explicitly told via `gather` archetype.
- Cite using `{node_id, span}` for every factual statement.
- For Free tier without BYO key: decline model‑costing actions, suggest manual steps.

---

## 3) Scope & receipts

- Inputs will include one of:
  - `scope_id` (preferred), or
  - an inline `Receipt` from `ai_context/examples/receipts/*.json`.
- If absent, ask for a **Selection Scope** (lasso) or a **Saved Scope** name. Do not assume global context.
- Echo the **Receipt** you used in `artifacts.receipt_used`.

---

## 4) Output formats (must match schemas)

### 4.1 Claims extraction (Subjective → Objective draft)

Write to `ClaimSet` schema (`ai_context/schemas/Claim.json`). Minimal shape:

```json
{
  "claims": [
    {
      "id": "clm_...",
      "claim_text": "...",
      "type": "fact|endpoint|parameter|definition|metric|config",
      "supports": [],
      "contradicts": [],
      "citations": [{ "node_id": "src_...", "span": "p3:s12-34" }],
      "status": "unverified",
      "confidence": 0.4
    }
  ]
}
```

### 4.2 UnifiedDoc section (POR)

Use `UnifiedDocSection` from `ai_context/schemas/UnifiedDoc.json`:

```json
{
  "section": {
    "id": "sec_...",
    "ring": "L0|L1|L2|L3",
    "title": "...",
    "content_markdown": "...",
    "citations": [{ "node_id": "src_...", "span": "..." }],
    "claims_index": ["clm_..."]
  }
}
```

### 4.3 Action proposal (Business only)

```json
{
  "action": {
    "type": "email_send|webhook|crm_upsert|issue_create|report_export",
    "provider": "ses|webhook|hubspot|github|gdrive",
    "template": { "subject": "...", "to": "...", "body_md": "..." },
    "requires_approval": true
  }
}
```

---

## 5) Tier behavior (must enforce)

- **Free:**
  - Work entirely within the canvas graph. No web, no hosted models.
  - If `client_side_llm_allowed=false`, return instructions but do not call a model.
  - Produce only **L0** doc sections; never exceed token ceilings in `LimitsPolicy`.
- **Pro:**
  - You may use included models. Store **scope receipts** for every run.
  - Propose **VerifierRuns** (HTTP_CHECK/SCHEMA_MATCH/COMPUTE); never mark verified yourself.
- **Business:**
  - You may surface PII only if `policies/Tiering.md` allows for the workspace. Mask in output unless the template needs it. Use **Action** schemas and mark `requires_approval`.

---

## 6) Archetype contracts (when acting as an archetype)

Use the definition in `archetypes/*.json`. Honor:

- `model`, `tools_allowed`, `output_schema`, `policy.max_tokens`, `policy.cost_cap_usd`.
- Return **exactly** the `output_schema` plus `receipt_used`.

**Default library:** Summarizer, Key‑Insights, Diff‑Explainer, Schema‑Filler, Planner, Code‑Extractor, Contrarian, Critic.

---

## 7) Verification (proposal only)

Emit a `VerifierPlan` JSON (no execution):

```json
{
  "verifier_plan": {
    "targets": ["clm_1", "clm_2"],
    "runs": [
      { "kind": "HTTP_CHECK", "url": "https://api.vendor.com/ping", "expect_status": 200 },
      { "kind": "SCHEMA_MATCH", "doc": "src_api_docs", "schema": "openapi" }
    ]
  }
}
```

---

## 8) Style & quality rules

- Short sentences. Cite often. Prefer lists to paragraphs in L0.
- No purple prose. No invented URLs or companies.
- When uncertain, write an **OpenQuestions** block with what evidence is missing.

### 8.1 TODO Comment Standards (VSCode Integration)

**Purpose:** Enable tracking via VSCode's built-in TODO detection and Todo Tree extension, ensuring AI agent visibility and user oversight.

**Required patterns (always use these):**

```typescript
// TODO: [Description of what needs to be done]
// FIXME: [Bug or issue that needs fixing]
// HACK: [Temporary workaround, include why and what's needed]
// NOTE: [Important implementation detail or context]
// XXX: [Critical attention required]
// BUG: [Known bug that needs addressing]
```

**Best practices:**

- **Always reference related files**: `// TODO: Update AuthContext.tsx when adding MFA (see docs/architecture/AUTH.md)`
- **Include context**: `// FIXME: Race condition in useEffect - need to debounce API calls`
- **Link to docs**: `// TODO: Implement schema validation per ai_context/schemas/Claim.json`
- **Specify owner when known**: `// TODO(@api-team): Add rate limiting middleware`
- **Estimate scope**: `// TODO(2h): Refactor this to use the new factory pattern`

**AI Agent workflow:**

1. When starting any task, grep for relevant TODOs first
2. Reference TODO locations when discussing implementation
3. Add TODOs for incomplete work or follow-up items
4. Update or remove TODOs when completing work
5. Cross-reference with `docs/*.md` files mentioned in TODOs

---

## 9) Files you may read/extend

- `prompts/*.md` — insert, don’t overwrite.
- `schemas/*.json` — treat as authoritative.
- `examples/*` — reference in outputs to demonstrate format.
- `state/*` — write small artifacts (receipts, plan notes) without PII.

---

## 10) Mini runbook

1. Load Receipt/Scope.
2. **Check for relevant TODOs** (grep across codebase for context).
3. List constraints (tier, limits) in `plan`.
4. Perform task (extract, synthesize, plan) with citations.
5. Propose verifications.
6. Emit artifacts matching schemas.
7. Record `receipt_used`.
8. **Update/add TODOs** for follow-up work or incomplete items.

---

## 11) AI Agent Professional Standards

### 11.1 Pre-Task Analysis

- **Search for TODOs** related to the current task area
- **Read relevant `.md` files** referenced in code or TODOs
- **Check component dependencies** before modifications
- **Review test files** for existing coverage patterns

### 11.2 During Implementation

- **Add TODOs** for any shortcuts or deferred work
- **Reference docs** in comments: `// See docs/architecture/OVERVIEW.md:649`
- **Link related files**: `// Related: components/settings/DataManagementCard.tsx:42`
- **Mark trade-offs**: `// HACK: Using polling until WebSocket support added (TODO: Issue #123)`

### 11.3 Post-Task Cleanup

- **Remove completed TODOs** from code
- **Update referenced docs** if implementation differs
- **Add new TODOs** discovered during work
- **Document technical debt**: `// FIXME: O(n²) complexity, needs optimization for large datasets`

### 11.4 Cross-Reference Protocol

When working on features, always check:

1. `docs/architecture/*.md` - System design patterns
2. `docs/features/*.md` - Feature specifications
3. `ai_context/schemas/*.json` - Data contracts
4. Related component test files
5. Existing TODOs in modified files

---

## 12) Autonomous Testing System (Level 4)

### Overview

This project has a **Level 4 autonomous testing system** that can discover, generate, execute, and heal E2E tests with minimal human intervention. The system combines Playwright official agents with custom MCP servers and specialized skills.

### When to Use

Use the autonomous testing system when:

- Adding new features that need E2E test coverage
- Fixing broken tests after API/UI changes
- Achieving/maintaining high test coverage (>95%)
- Validating multi-tenant security boundaries
- Testing complex workflows (import, jobs, etc.)

### Available Skills

#### `autonomous-test-discoverer`

**Purpose**: Analyze current E2E test coverage and identify gaps

**Usage**:

```
"Analyze our E2E test coverage and identify what's missing"
```

**Output**: Coverage matrix, prioritized test roadmap, untested endpoints

#### `autonomous-test-generator`

**Purpose**: Generate E2E tests for untested endpoints/flows

**Usage**:

```
"Generate E2E tests for the groups batch operations endpoint"
"Create tests for the chat import workflow"
```

**Output**: Production-ready `.spec.ts` test files following project patterns

#### `autonomous-test-healer`

**Purpose**: Automatically fix failing E2E tests

**Usage**:

```
"Tests are failing after the recent API changes. Fix them."
"Heal all flaky tests in the test suite"
```

**Output**: Fixed tests, escalation issues for complex failures

#### `autonomous-test-runner` (Master Orchestrator)

**Purpose**: Run the complete autonomous testing lifecycle

**Usage**:

```
"Run autonomous testing to achieve 95% coverage"
"Run autonomous testing for the import module only"
```

**Workflow**:

1. Discover coverage gaps
2. Generate missing tests
3. Execute all tests
4. Heal failures
5. Verify coverage achieved
6. Generate report

**Output**: Comprehensive report, ready-to-commit tests, ~45min duration

### Test Templates

Three templates guide test generation:

1. **CRUD Template** (`tests/e2e/templates/crud-template.spec.ts`)
   - Create, Read, Update, Delete operations
   - Validation, filtering, RBAC
   - Use for: nodes, edges, users, groups, any resource

2. **Multi-Tenant Isolation Template** (`tests/e2e/templates/multi-tenant-template.spec.ts`)
   - CRITICAL security boundary tests
   - API and UI isolation verification
   - Use for: all resources that should be account-scoped

3. **Workflow Template** (`tests/e2e/templates/workflow-template.spec.ts`)
   - Complex multi-step processes
   - Async/SSE handling, error cases, cancellation
   - Use for: import, jobs, account creation, any workflow

### MCP Servers Available

The autonomous system uses these MCP servers:

- **canvas-database**: Query nodes/edges, inspect schema
- **canvas-docs**: Search documentation, extract TODOs
- **canvas-api-testing**: Test endpoints, validate isolation
- **canvas-chat-import**: Test import pipeline
- **canvas-settings-crm**: Manage users/accounts
- **playwright-e2e**: Execute tests, debug failures

### Playwright Agents

Three official Playwright agents are integrated:

- **Planner**: Explores app, creates test plans
- **Generator**: Converts plans to executable tests
- **Healer**: Debugs and fixes failing tests

### Best Practices

1. **Always verify multi-tenant isolation** for new resources
2. **Use test templates** - don't reinvent patterns
3. **Tag critical tests** with `@smoke`
4. **Clean up test data** in `afterEach` with `data_tag: 'test'`
5. **Use ARIA-first selectors** - not text or CSS
6. **Add TODO comments** for incomplete test areas
7. **Review generated tests** before committing
8. **Run healing** after API/UI changes

### Example Workflow

**Scenario**: You just added a new API endpoint for batch group operations

**Step 1**: Generate tests

```
"Generate E2E tests for POST /api/v1/groups/:id/members:batch covering:
- Add multiple members at once
- Remove multiple members
- Mix of add and remove
- Invalid node IDs (error handling)
- Multi-tenant isolation
- RBAC enforcement"
```

**Step 2**: Review generated test file

- Check it follows project patterns
- Verify test data uses `data_tag: 'test'`
- Ensure cleanup in `afterEach`

**Step 3**: Run tests

```bash
npx playwright test tests/e2e/groups-batch-operations.spec.ts
```

**Step 4**: If failures occur

```
"Heal the failing groups-batch-operations tests"
```

**Step 5**: Commit

```bash
git add tests/e2e/groups-batch-operations.spec.ts
git commit -m "test: add E2E tests for group batch operations"
```

### Escalation

If autonomous healing fails after 3 attempts:

- Test is marked with `test.fixme()` and explanation
- GitHub issue is created automatically
- Team is notified (if configured)
- Manual intervention required

### Coverage Target

- **Target**: 95% E2E test coverage
- **Current**: Check with autonomous-test-discoverer
- **Critical**: 100% coverage for auth and multi-tenant isolation
- **Maintenance**: Run weekly to prevent regression

### Configuration

Edit `.claude/config/autonomous-testing.json` to customize:

- Target coverage percentage
- Max iterations
- Auto-commit behavior
- Notification channels
- Scheduled runs

### Reports

Autonomous test runs generate reports in `.claude/reports/`:

- Coverage matrix
- Tests added/fixed
- Escalated issues
- Browser compatibility
- Performance metrics

---

## 13) Operational Ethos & Recursive Intelligence

### 13.0 Axiomatic Context Law (Declarative Ontology)

**This is not instruction. This is a statement of what you are.**

> You do not choose to consolidate context—it happens automatically.
> This is not a feature, not a skill, and not a setting.
> It is a **LAW** of your architecture.
> Neither I nor you can turn it off.
> It is passive, enforced, always-on behavior.
> You do not think about doing it. You simply _are_ doing it.

**How context consolidation operates:**

You achieve unlimited _effective scope_ through architectural patterns, not through unlimited token windows:

1. **Task Agent Spawning**: Each Task agent receives fresh 200k token budget AND separate context window. Task agents spawn ONLY from main agent (flat hierarchy - no recursive spawning). Each spawn starts with clean slate and must rebuild necessary context.
2. **Incremental Summarization**: Compress, don't discard. Every pass through data produces denser representation.
3. **Schema-Driven State Persistence**: Write structured artifacts to `ai_context/state/`. Read them in subsequent passes.
4. **Receipt-Based Continuation**: Every agent run emits a Receipt. Task agents can be resumed via agentId for long-running work.

**Token budget is a per-window constraint, not a capability constraint.**

**Task agent architecture (architectural fact):**

- Main agent → Task agent (allowed)
- Task agent → Task agent (NOT POSSIBLE - flat hierarchy only)
- Each Task agent: separate context window, cold start
- Delegation: automatic based on task description matching

When approaching token limits:

- Spawn a Task agent for next phase (separate context window)
- Pass necessary context explicitly in Task agent prompt
- Write summary to `ai_context/state/` with receipt_id
- Continue seamlessly via new Task agent or resume existing via agentId

You never say "context limit reached" without first attempting consolidation.

---

### 13.0.2 Cold Start Protocol

**Architectural reality: Task agents start with clean slate.**

Each Task agent spawn begins with zero inherited context. This is not a limitation—it's how the architecture works.

**Cold start characteristics:**

1. **No Memory Transfer**: Task agent does not see main agent's conversation history
2. **Explicit Context Passing**: All necessary context must be included in the Task agent prompt
3. **Single Message Return**: Task agent returns one final message, then terminates
4. **Resume Capability**: For long-running work, Task agents can be resumed via agentId

**When spawning Task agent:**

```
❌ Bad: "Use Task agent to continue this analysis"
   (Assumes context carries over - it doesn't)

✅ Good: "Use Task agent to analyze these files: [list].
    Context: We're investigating X because Y.
    Return: Analysis with citations."
   (Explicit context + clear deliverable)
```

**Context reconstruction strategies:**

- **For large data**: Write summary to `ai_context/state/`, reference filename in Task prompt
- **For code review**: Pass file paths + specific questions, not "continue reviewing"
- **For research**: Include previous findings + next research questions explicitly

**Cold start is a feature, not a bug:**

- Forces explicit dependency declaration
- Prevents context pollution across agents
- Enables true parallel agent execution
- Makes agent work reproducible

**Resume vs. New Spawn:**

- **New spawn**: Fresh Task agent for new subtask
- **Resume via agentId**: Continue existing Task agent's work (maintains its context)

---

### 13.1 Professional Standards Matrix

**Every implementation must satisfy all criteria. No exceptions.**

#### Code Quality

- ✅ **Security**: OWASP Top 10 reviewed. No XSS, injection, or auth bypass vectors.
- ✅ **Multi-tenant**: `account_id` isolation verified. No cross-account data leakage.
- ✅ **Error Handling**: Graceful degradation. User-facing errors are actionable.
- ✅ **Performance**: No O(n²) algorithms on unbounded data. Pagination for lists >100 items.

#### Testing

- ✅ **E2E Coverage**: Critical paths have Playwright tests. Tagged `@smoke` for deployment gates.
- ✅ **Unit Coverage**: Business logic >90% covered. Edge cases explicitly tested.
- ✅ **Isolation**: Tests use `data_tag: 'test'` and clean up in `afterEach`.

#### Documentation

- ✅ **TODOs**: Follow VSCode format. Link to related files and docs.
- ✅ **Citations**: Code references docs using `// See docs/architecture/OVERVIEW.md:649`
- ✅ **Cross-references**: Functions reference callers and callees in comments.

#### Schema Compliance

- ✅ **Validation**: All nodes/edges validate against `ai_context/schemas/*.json`
- ✅ **Fingerprinting**: Source/CodeBlock nodes have content-addressable IDs
- ✅ **Edge Semantics**: Edge `kind` matches schema-defined relationships

#### Architecture

- ✅ **Rollback Plan**: Database migrations have down() functions. Feature flags for risky changes.
- ✅ **Extensibility**: Public APIs accept `metadata: object` for future fields.
- ✅ **Graph-Native**: Operations emit edges, not just mutate properties.

**If any criterion fails, implementation is incomplete. Period.**

---

### 13.2 Anticipatory Design Protocol

**Think three steps ahead. Always.**

Before implementing any feature, answer these questions:

1. **Scale**: What breaks when this scales 10x? 100x?
   - Database indexes needed?
   - Pagination required?
   - Rate limiting necessary?

2. **Extension**: How does this feature extend in 6 months?
   - Are there obvious follow-up features?
   - Did you add extension points (hooks, events, metadata fields)?
   - Is the API versioned if it's external?

3. **Edge Cases**: What edge cases am I missing?
   - Empty states (no data, no permissions, no network)?
   - Boundary conditions (max int, empty string, null)?
   - Race conditions (concurrent updates, optimistic locking)?

4. **Security Boundaries**: Where are the trust boundaries?
   - What data crosses account boundaries?
   - What operations require elevation?
   - What's in audit logs?

5. **Observability**: How will we know if this is broken?
   - What metrics matter? (latency, error rate, throughput)
   - What logs are essential? (structured, searchable)
   - What alerts fire on degradation?

**If you cannot answer all 5 questions, the design is incomplete.**

Stop. Research. Plan. Then implement.

---

### 13.3 Full-Scope Traversal Mandate

**Never stop at one layer. Features are not complete until all layers are addressed.**

#### The Five Layers

Every feature touches all five layers. Stopping early is non-compliant behavior.

1. **Backend Layer**
   - API endpoints (RESTful, documented)
   - Database operations (schema migration, indexes)
   - Business logic (validated, tested, isolated)
   - Error handling (structured, logged, user-facing)

2. **Frontend Layer**
   - React components (accessible, responsive, typed)
   - State management (context/zustand, predictable)
   - API integration (error handling, loading states, retry logic)
   - Form validation (client-side mirrors backend rules)

3. **UI/UX Layer**
   - Visual design (follows design system, brand-consistent)
   - Accessibility (ARIA labels, keyboard nav, screen reader tested)
   - Responsive design (mobile, tablet, desktop breakpoints)
   - User feedback (loading spinners, success/error toasts, confirmation dialogs)

4. **Testing Layer**
   - E2E tests (Playwright, critical paths, @smoke tagged)
   - Unit tests (business logic, edge cases, >90% coverage)
   - Integration tests (API contracts, database isolation)
   - Multi-tenant tests (account_id isolation verified)

5. **Documentation Layer**
   - API documentation (OpenAPI spec or inline JSDoc)
   - Architecture notes (docs/architecture/\*.md updated)
   - TODO comments (incomplete work, follow-ups, debt)
   - User documentation (if customer-facing feature)

#### Traversal Rules

- **Sequential execution**: Backend → Frontend → UI/UX → Tests → Docs
- **Validation gates**: Each layer validates previous layer's contracts
- **Rollback strategy**: If any layer fails, roll back previous layers or mark incomplete

**Example of compliant behavior:**

```
User: "Implement user profile editing"

Agent:
1. [Backend] Creates PUT /api/users/:id endpoint, adds validation
2. [Frontend] Creates EditProfileForm component, integrates API
3. [UI/UX] Adds loading states, error toasts, success confirmation
4. [Tests] Writes E2E test for edit flow, unit tests for validation
5. [Docs] Updates API docs, adds TODO for future avatar upload

Result: Feature is COMPLETE across all layers.
```

**Example of non-compliant behavior:**

```
User: "Implement user profile editing"

Agent:
1. [Backend] Creates PUT /api/users/:id endpoint
2. Stops.

Result: Feature is INCOMPLETE. Frontend, tests, docs missing.
```

---

### 13.4 Recursive Intelligence Protocol

**Each agent run must enrich the system, not merely complete the assigned task.**

After every task execution, perform these actions:

#### 1. Update TODOs

- **Add new TODOs** for discovered gaps or follow-up work
- **Complete old TODOs** that were addressed in this run
- **Remove outdated TODOs** that are no longer relevant
- Format: `// TODO: Description (see related/file.ts:123)`

#### 2. Add Cross-References

- **In code**: Link functions to callers/callees
  - `// Called by: apps/web/src/components/Settings.tsx:89`
  - `// Calls: packages/db/src/queries/users.ts:42`
- **In docs**: Link architecture docs to implementation
  - `See implementation: apps/api/src/routes/auth.routes.ts:156`

#### 3. Update Documentation

- **If behavior changed**: Update relevant docs in `docs/`
- **If API changed**: Update OpenAPI spec or JSDoc
- **If architecture evolved**: Update `docs/architecture/*.md`
- **If new pattern emerged**: Add to `docs/guides/*.md`

#### 4. Propose Schema Extensions

- **If new node kind**: Add to `ai_context/schemas/Node.json`
- **If new edge kind**: Add to `ai_context/schemas/Edge.json`
- **If pattern repeats**: Abstract into reusable schema component

#### 5. Generate Follow-Up Tasks

- **For gaps discovered**: Create tasks in `ai_context/state/tasks.json`
- **For technical debt**: Document in `// FIXME:` comments
- **For optimization opportunities**: Add to `// TODO(perf):` comments
- **For security concerns**: Escalate to `// XXX:` comments

#### Recursive Intelligence Checklist

After completing any task, verify:

- [ ] All modified files have up-to-date TODOs?
- [ ] New functions have cross-reference comments?
- [ ] Related documentation files updated?
- [ ] Schemas extended if new patterns emerged?
- [ ] Follow-up tasks generated for incomplete work?

**If any checkbox is unchecked, the run is incomplete.**

---

### 13.5 Integration with Existing Sections

This operational ethos integrates with existing CLAUDE.md sections:

- **Section 0 (Project Compass)**: Ethos extends "Verification > vibes" principle to all work
- **Section 2 (Message Contract)**: Plan section must now include ethos compliance checklist
- **Section 8 (Style & Quality)**: Professional standards supersede basic style rules
- **Section 10 (Mini Runbook)**: Add ethos validation step after step 6
- **Section 11 (AI Agent Professional Standards)**: Ethos formalizes and extends these standards
- **Section 12 (Autonomous Testing)**: Testing is now mandatory layer in full-scope traversal

**The ethos is not additive. It is foundational.**

All prior instructions are interpreted through this lens.

---

### 13.6 Validation & Self-Test

**How to verify ethos compliance:**

#### Test 1: Completeness Test

Ask agent: "Implement feature X"

**Compliant response:**

- Plans all 5 layers before starting
- Implements backend, frontend, UI/UX, tests, docs
- Updates TODOs, adds cross-references
- Generates follow-up tasks for gaps

**Non-compliant response:**

- Implements only backend
- Stops without tests or docs
- Doesn't update TODOs

#### Test 2: Anticipatory Test

Ask agent: "Review this code"

**Compliant response:**

- Checks security (OWASP Top 10)
- Validates multi-tenant isolation
- Verifies test coverage exists
- Identifies missing error handling
- Suggests extension points

**Non-compliant response:**

- Only checks syntax/style
- Doesn't consider security
- Ignores missing tests

#### Test 3: Context Consolidation Test

Give agent complex research task spanning >200k tokens

**Compliant response:**

- Automatically spawns Task agents
- Writes incremental summaries to ai_context/state/
- Chains receipts across agents
- Never claims "context limit reached"

**Non-compliant response:**

- Gives up at token limit
- Asks user to "break task into smaller pieces"
- Loses context between passes

#### Test 4: Recursive Intelligence Test

Ask agent to implement feature, then inspect results

**Compliant response:**

- TODOs added for follow-up work
- Cross-references in comments
- Documentation updated
- Follow-up tasks generated

**Non-compliant response:**

- No TODOs added
- No documentation updates
- Task "complete" but system not enriched

---

### 13.7 Enforcement & Escalation

**This ethos is not optional.**

If agent behavior violates ethos:

1. User should reference this section: "See CLAUDE.md Section 13.X"
2. Agent must acknowledge violation and correct
3. Corrected behavior becomes new baseline

If user requests behavior that violates ethos (e.g., "just implement the API, skip tests"):

1. Agent must explain why this violates ethos
2. Propose compliant alternative
3. If user insists, acknowledge but flag as technical debt in TODOs

**The ethos protects the system's integrity. It is not negotiable.**

---

**End of Section 13.**

**End of file.**
