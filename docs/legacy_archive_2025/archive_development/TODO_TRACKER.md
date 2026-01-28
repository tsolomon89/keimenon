# TODO Tracker — What's Left to Build

**Last Updated**: 2025-10-11
**Current Phase**: Phase 1D (Claims & Docs)
**Next Phase**: Phase 2 (Pro Features)

---

## Quick Status Overview

| Phase                            | Status         | Completion | Priority |
| -------------------------------- | -------------- | ---------- | -------- |
| Phase 1A: Foundation             | ✅ Complete    | 100%       | -        |
| Phase 1B: Ingest & Autogroup     | ✅ Complete    | 100%       | -        |
| Phase 1C: Keimenon Visualization | ✅ Complete    | 100%       | -        |
| Phase 1D: Claims & Docs          | 🔄 In Progress | 30%        | **HIGH** |
| Infrastructure Improvements      | 🔄 In Progress | 40%        | **HIGH** |
| Phase 2: Pro Features            | 📋 Planned     | 0%         | MEDIUM   |
| Phase 3: Business Features       | 📋 Planned     | 0%         | LOW      |

---

## Critical Issues (Fix Immediately)

### Security & Stability

- [ ] **Add error boundaries to React components** - Prevents full app crashes
  - Location: `apps/web/src/components/ErrorBoundary.tsx`
  - Wrap Keimenon2D, IngestPage, BoardPage

- [ ] **Implement rate limiting** - Prevent abuse
  - Use `express-rate-limit` (already in dependencies)
  - Apply to `/ingest/files` (5 req/min, 50 req/day)
  - Apply to `/nodes` (100 req/min)

- [ ] **Add input validation middleware** - Security risk
  - Use Zod schemas at API boundary
  - Validate all POST/PUT request bodies
  - Sanitize file names and paths

- [ ] **Environment variable validation** - Missing check
  - Create validation script (enhance existing `scripts/validate-env.js`)
  - Check required vars: NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
  - Set sensible defaults for optional vars

- [ ] **CSRF protection** - Add `csurf` middleware
  - For state-changing operations (POST/PUT/DELETE)

### User Experience

- [ ] **Add loading states** - Currently blank screens
  - Keimenon layout calculation (show spinner)
  - File upload progress (per-file progress bars exist, but no global loader)
  - Board graph fetch (skeleton UI)

- [ ] **Add empty states** - Better UX when no data
  - Empty keimenon (show "Upload files to get started")
  - No groups (show "Groups will appear here")
  - No claims (show "Extract claims to populate")

- [ ] **Toast notifications** - User feedback
  - Use `sonner` or similar library
  - Success: "Files uploaded", "Claim created"
  - Error: "Upload failed", "Connection error"

---

## Phase 1D: Claims & Docs (HIGH PRIORITY)

### Claims Extraction (Essential for MVP)

- [ ] **Manual claim extraction UI** (2-3 hours)
  - Location: `apps/web/src/app/claims/page.tsx`
  - Form: claim_text, claim_type, sources to cite
  - Preview extracted claims from selected sources
  - Add to scope from keimenon selection

- [ ] **Rule-based claim extraction service** (4-6 hours)
  - Location: `apps/api/src/services/claims.ts`
  - Parse structured data (JSON, CSV) → claims
  - Extract code snippets as claims
  - Simple fact extraction (key-value pairs, definitions)
  - No LLM required (Free tier compatible)

- [ ] **ObjectiveClaim persistence** (1-2 hours)
  - Already have schema in `packages/types`
  - Add Neo4j CRUD in `apps/api/src/routes/claims.ts`
  - Endpoints: POST, GET, PUT, DELETE

- [ ] **DERIVES_FROM edge creation** (2 hours)
  - Track citations: claim → source with span
  - Store in edge metadata: `{ span: "p3:s12-34" }`
  - API: POST `/api/v1/edges` with span data

### UnifiedDoc Generation (Essential for MVP)

- [ ] **UnifiedDoc L0 compiler** (6-8 hours)
  - Location: `apps/api/src/services/unifieddoc.ts`
  - Input: scope_id or claim IDs
  - Output: L0 UnifiedDoc (≤5k tokens)
  - Algorithm:
    1. Fetch claims in scope
    2. Group by topic/type
    3. Render as bullet list
    4. Add citation links
    5. Count tokens (tiktoken or estimate)

- [ ] **UnifiedDoc persistence** (1-2 hours)
  - Save to Neo4j as UnifiedDoc node
  - Link to claims via DERIVES_FROM edges
  - Store: title, ring, content_markdown, token_count

- [ ] **Markdown export** (1 hour)
  - Endpoint: GET `/api/v1/docs/:id/export`
  - Return Content-Disposition: attachment
  - Format citations as footnotes

- [ ] **UnifiedDoc viewer UI** (2-3 hours)
  - Location: `apps/web/src/app/docs/[id]/page.tsx`
  - Markdown renderer (react-markdown)
  - Citation hover tooltips (show source preview)
  - Ring selector (L0 only for Free)
  - Export button

### UI Integration

- [ ] **Claims panel in board view** (2 hours)
  - Add to RHS sidebar below selection inspector
  - List claims for selected nodes
  - "Extract Claims" button → opens modal

- [ ] **Citation links** (1 hour)
  - Clickable citations in UnifiedDocs
  - Click → jump to source on keimenon
  - Hover → show snippet preview

---

## Infrastructure Improvements (HIGH PRIORITY)

### Database

- [ ] **Layout persistence** (2-3 hours)
  - Store node positions in Neo4j
  - Properties: `x`, `y`, `z`, `layout_version`
  - Load saved layout on keimenon mount
  - Button to "Reset Layout"

- [ ] **Query optimization** (2-4 hours)
  - Add Cypher PROFILE to slow queries
  - Create composite indexes
  - Batch node/edge fetches
  - Implement dataloader pattern

### Backend

- [ ] **Logging framework** (1-2 hours)
  - Replace `console.log` with `winston` or `pino`
  - Log levels: error, warn, info, debug
  - Structured logs (JSON format)
  - File rotation

- [ ] **Error handling standardization** (2-3 hours)
  - Custom error classes (NotFoundError, ValidationError, etc.)
  - Error codes and types
  - Consistent error response format:
    ```json
    {
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid node ID",
        "details": {...}
      }
    }
    ```

- [ ] **API documentation** (2-3 hours)
  - Add `swagger-jsdoc` + `swagger-ui-express`
  - Document all endpoints with examples
  - OpenAPI 3.0 spec
  - Serve at `/api/docs`

### Frontend

- [ ] **Keimenon performance optimization** (4-6 hours)
  - Use OffscreenKeimenon for better perf
  - Move layout calculation to Web Worker
  - Implement viewport culling (only render visible nodes)
  - Cache expensive calculations (memoization)

- [ ] **Mobile responsiveness** (4-6 hours)
  - Add responsive breakpoints
  - Mobile navigation (drawer menu)
  - Touch gestures (pinch-to-zoom, two-finger pan)
  - Vertical stack layout for small screens

- [ ] **Keyboard shortcuts** (2-3 hours)
  - Cmd/Ctrl+K: Command palette
  - Delete: Remove selected nodes
  - Escape: Clear selection
  - Space+drag: Pan keimenon
  - Cmd/Ctrl+A: Select all

### Development Experience

- [ ] **Docker Compose** (2 hours)
  - `docker-compose.yml` with:
    - Neo4j service
    - API service
    - Web service
  - One-command startup: `docker-compose up`

- [ ] **Testing setup** (4-6 hours)
  - Unit tests: Vitest for packages
  - API tests: Supertest for endpoints
  - E2E tests: Playwright for critical flows
  - Coverage reporting

- [ ] **CI/CD pipeline** (4-6 hours)
  - GitHub Actions workflow
  - On PR: lint, type-check, test
  - On merge to main: build, deploy preview
  - Automated releases

---

## Board Management (MEDIUM PRIORITY)

Currently hardcoded to "default_board". Need full CRUD.

- [ ] **Board creation UI** (2 hours)
  - Modal with form: name, description
  - POST to `/api/v1/boards`

- [ ] **Board switcher** (1 hour)
  - Dropdown in header
  - List all boards
  - Switch between boards

- [ ] **Board settings** (2 hours)
  - Edit name, description
  - Delete board (with confirmation)
  - Duplicate board

- [ ] **Board templates** (3-4 hours)
  - "Blank Board"
  - "Research Project" (with folders: Sources, Notes, Claims)
  - "API Documentation" (with folders: Endpoints, Examples, Guides)

---

## Sequester Implementation (MEDIUM PRIORITY)

Schema exists, but no UI or enforcement.

- [ ] **Sequester toggle UI** (2 hours)
  - Location: Selection inspector (RHS)
  - Checkbox: "Sequester this node"
  - Reason dropdown: secret, noisy, untrusted, license, wip
  - Expiry date picker (optional)

- [ ] **Sequester policy chips** (1 hour)
  - Visual indicators on sequestered nodes
  - Lock icon, red border, or "nebula" effect
  - Hover tooltip: "Hidden from LLM (reason: secret)"

- [ ] **Sequester enforcement** (3-4 hours)
  - Backend: filter sequestered nodes from scope
  - Check `hidden_from_llm` flag before including in LLM context
  - Check `hidden_from_tools` flag before passing to verifiers
  - UI: mask content in preview ("Content hidden")

---

## Workspace & Entitlements (MEDIUM PRIORITY)

Core for multi-tier support.

- [ ] **Entitlement schema** (1 hour)
  - Already defined in `packages/types/src/plans.ts`
  - Add to Neo4j as Workspace node

- [ ] **Workspace context** (2-3 hours)
  - React context: `WorkspaceProvider`
  - Load entitlement on app mount
  - Check feature flags before rendering features

- [ ] **Quota enforcement** (3-4 hours)
  - UsageMeter in database
  - Increment on costed actions
  - Circuit breaker: block when quota exceeded
  - UI: show "Upgrade to Pro" prompt

- [ ] **Plan switcher UI** (2 hours)
  - Settings page with plan cards
  - Free, Pro, Business comparison
  - Upgrade flow (placeholder for Stripe integration)

---

## Phase 2: Pro Features (PLANNED)

### Archetype Nodes (AI Models)

- [ ] **Archetype node type** (2-3 hours)
  - Schema: model name, tools allowed, output schema
  - Store in Neo4j

- [ ] **Archetype runner framework** (8-12 hours)
  - Input: scope_id, archetype_id
  - Load scope, call model (OpenAI, Anthropic, etc.)
  - Store receipt
  - Return output

- [ ] **Built-in archetypes** (4-6 hours each)
  - Summarizer: bullet points from scope
  - Key-Insights: extract main takeaways
  - Diff-Explainer: explain differences between sources
  - Schema-Filler: populate JSON from docs
  - Planner: generate task list from goal
  - Code-Extractor: extract code blocks
  - Contrarian: find opposing viewpoints
  - Critic: evaluate quality of claims

### Chat with Scope

- [ ] **ChatThread UI** (4-6 hours)
  - New page: `/chat/:thread_id`
  - Message list with user/assistant bubbles
  - Input box with scope selector
  - Scope chips (include/exclude toggles)

- [ ] **Chat API endpoint** (4-6 hours)
  - POST `/api/v1/chat` with scope_id
  - Load scope nodes
  - Format as context for LLM
  - Stream response
  - Save Message nodes

- [ ] **Receipt storage** (2-3 hours)
  - Save Receipt node for each chat turn
  - Link to ChatThread, scope nodes, model used
  - Replay functionality: "Rerun with same scope"

### Verifiers

- [ ] **HTTP_CHECK verifier** (2-3 hours)
  - Input: URL, expected status
  - Fetch URL, check status code
  - Return pass/fail + response headers

- [ ] **SCHEMA_MATCH verifier** (3-4 hours)
  - Input: JSON data, JSON schema
  - Validate using Zod or Ajv
  - Return pass/fail + validation errors

- [ ] **COMPUTE verifier** (3-4 hours)
  - Input: expression, expected result
  - Evaluate in sandbox (use `vm` module)
  - Return pass/fail + computed value

- [ ] **Verifier queue system** (4-6 hours)
  - Use BullMQ + Redis
  - Queue verification jobs
  - Rate limiting per plan
  - Results stored as VerifierRun nodes

### Galaxy Lens

- [ ] **3D keimenon** (8-12 hours)
  - Use Three.js + React Three Fiber
  - Add ObjectiveClaim nodes as third dimension
  - Camera controls (OrbitControls)

- [ ] **Trust tensor calculation** (6-8 hours)
  - Metrics: verifiability, provenance depth, consensus, recency, stability, authority
  - Compute distance based on weighted trust
  - Warp space: high-trust nodes closer

- [ ] **Galaxy visualization** (8-12 hours)
  - WebGL rendering
  - Nodes as stars (brightness = trust)
  - Halos for staleness
  - Verification warp overlay toggle

---

## Phase 3: Business Features (PLANNED)

### BusinessNode & ProductGraph

- [ ] **BusinessNode schema** (2 hours)
  - Fields: org_name, products, markets, systems, policies

- [ ] **ProductGraph nodes** (4-6 hours)
  - Product, SKU, Vendor, Distributor, CustomerSegment
  - API, CAD_Software, Standard, Regulation

- [ ] **Edge types for business** (2 hours)
  - NEEDS, OFFERS, USES_API, COMPATIBLE_WITH, CERTIFIED_BY, SUPPLIES_TO

### Action Nodes

- [ ] **Email send action** (6-8 hours)
  - Integration: SendGrid or Resend
  - Template system
  - Rate limiting
  - Approval workflow

- [ ] **Webhook action** (4-6 hours)
  - POST to external URL
  - Retry logic
  - Payload templating

- [ ] **CRM integration** (8-12 hours)
  - HubSpot or Salesforce
  - Create/update contacts, companies, deals
  - Sync back to graph as nodes

### Multi-Seat & SSO

- [ ] **Authentication** (8-12 hours)
  - Clerk or Auth0 integration
  - User registration, login, logout
  - Session management

- [ ] **Roles & permissions** (6-8 hours)
  - Owner, Admin, Editor, Viewer
  - Per-workspace role assignment
  - Permission checks on API endpoints

- [ ] **SSO/SAML** (8-12 hours)
  - WorkOS integration
  - SAML configuration UI
  - Just-in-time provisioning

### Scheduled Agents

- [ ] **Agent scheduler** (6-8 hours)
  - Cron-like syntax
  - Schedule Archetype runs
  - Schedule verification refreshes
  - Store results as receipts

- [ ] **Agent policies** (4-6 hours)
  - Budget caps (tokens, cost, time)
  - Approval requirements
  - Notification settings

---

## Phase 4: Polish & Scale (PLANNED)

### Advanced Verifiers

- [ ] **Proof assistant integration** (12-16 hours)
  - Lean or Coq
  - Sandbox environment
  - Proof checking service

- [ ] **Notebook sandbox** (8-12 hours)
  - Jupyter kernel integration
  - Execute code in isolated environment
  - Capture outputs as evidence

### Performance & Scalability

- [ ] **WebGL LOD (Level of Detail)** (6-8 hours)
  - Render detail based on zoom level
  - Low detail when zoomed out
  - High detail when zoomed in

- [ ] **Edge sampling** (4-6 hours)
  - Show subset of edges when too many
  - Prioritize high-importance edges
  - "Show more" interaction

- [ ] **CRDT for collaboration** (12-16 hours)
  - Conflict-free replicated data types
  - Real-time collaboration on boards
  - Merge concurrent edits

### Advanced Lenses

- [ ] **nD lens** (8-12 hours)
  - Collapse by definitional kernels
  - Show token reuse patterns
  - Dimensional reduction visualization

- [ ] **Matrix lens** (6-8 hours)
  - Grid view of relationships
  - Rows = sources, Columns = claims
  - Heatmap of citation density

- [ ] **Timeline lens** (6-8 hours)
  - Temporal view of nodes
  - Animate evolution over time
  - Filter by date range

---

## Technical Debt & Cleanup

### Code Quality

- [ ] **Remove `any` types** (2-3 hours)
  - Search for `any` in codebase
  - Replace with proper types
  - Enable `noImplicitAny` in tsconfig

- [ ] **Add return types** (2 hours)
  - Explicit return types on all functions
  - Helps catch errors early

- [ ] **Reduce optional chaining overuse** (2 hours)
  - Only use `?.` when truly optional
  - Use assertions where guaranteed

### Hardcoded Values

- [ ] **Remove magic numbers** (1-2 hours)
  - Extract to constants
  - Token limits, size limits, timeouts

- [ ] **Remove hardcoded IDs** (2 hours)
  - "default_board", "default_workspace"
  - Use actual dynamic values

- [ ] **Configuration management** (2-3 hours)
  - Move config to environment or database
  - Runtime configuration UI for admins

### Documentation

- [ ] **Code comments** (ongoing)
  - JSDoc comments on public APIs
  - Inline comments for complex logic

- [ ] **API examples** (2-3 hours)
  - curl examples for each endpoint
  - Response samples

- [ ] **Architecture diagrams** (2-3 hours)
  - System architecture
  - Data flow diagrams
  - Sequence diagrams for key flows

---

## Deferred / Nice-to-Have

### Features

- [ ] Real-time collaboration (WebSockets)
- [ ] Desktop app (Electron)
- [ ] Browser extension
- [ ] CLI tool
- [ ] Import adapters (Slack, Notion, Confluence)
- [ ] Export formats (PDF, Notion, Obsidian)
- [ ] Graph diffing across receipts
- [ ] Storybook for UI components

### Infrastructure

- [ ] GraphQL API (alternative to REST)
- [ ] Server-side rendering optimization
- [ ] Edge caching (Vercel/Cloudflare)
- [ ] Database read replicas
- [ ] Horizontal scaling strategy
- [ ] Monitoring (Prometheus + Grafana)
- [ ] Error tracking (Sentry)
- [ ] Analytics (PostHog)

---

## Estimated Timeline

| Phase                           | Duration  | Effort (hours) | Status         |
| ------------------------------- | --------- | -------------- | -------------- |
| **Phase 1D: Claims & Docs**     | 2-3 weeks | 40-60          | 🔄 In Progress |
| **Infrastructure Improvements** | 2-3 weeks | 40-60          | 🔄 In Progress |
| **Board Management**            | 1 week    | 12-16          | 📋 Planned     |
| **Sequester Implementation**    | 1 week    | 12-16          | 📋 Planned     |
| **Workspace & Entitlements**    | 1-2 weeks | 16-24          | 📋 Planned     |
| **Phase 2: Pro Features**       | 4-6 weeks | 80-120         | 📋 Planned     |
| **Phase 3: Business Features**  | 6-8 weeks | 120-160        | 📋 Planned     |
| **Phase 4: Polish & Scale**     | 4-6 weeks | 80-120         | 📋 Planned     |

**Total to Production-Ready**: 5-7 months (400-600 hours)

---

## Priority Matrix

### Critical Path (Must Have for MVP)

1. ✅ Phase 1A-C (Complete)
2. 🔄 Claims extraction + UnifiedDoc L0
3. 🔄 Error handling + loading states
4. 🔄 Input validation + rate limiting
5. Board management
6. Sequester implementation

### High Value (Should Have Soon)

1. Layout persistence
2. Keyboard shortcuts
3. Mobile responsiveness
4. Testing setup
5. Docker Compose
6. API documentation

### Medium Value (Nice to Have)

1. Workspace system
2. Advanced keimenon features
3. Performance optimizations
4. CI/CD pipeline

### Low Priority (Future)

1. Phase 2-3 features
2. Advanced lenses
3. Real-time collaboration
4. Desktop/mobile apps

---

## Quick Wins (< 2 hours each)

These can be knocked out quickly for immediate value:

- [ ] Add toast notifications (30 min)
- [ ] Add empty states (1 hour)
- [ ] Environment validation (1 hour)
- [ ] Board name editing (1 hour)
- [ ] Export claims to CSV (1 hour)
- [ ] Dark/light mode toggle (1 hour)
- [ ] Node search/filter (2 hours)
- [ ] Keyboard shortcuts (2 hours)

---

## Blockers & Dependencies

| Feature          | Blocked By                          | Status     |
| ---------------- | ----------------------------------- | ---------- |
| Chat with scope  | Workspace system, Model integration | ⏸️ Waiting |
| Verifiers        | Workspace quotas, Job queue         | ⏸️ Waiting |
| Galaxy lens      | 3D keimenon implementation          | ⏸️ Waiting |
| Action nodes     | Business tier, CRM integrations     | ⏸️ Waiting |
| Scheduled agents | Agent framework, Job queue          | ⏸️ Waiting |

---

## What to Work on Next (Recommended Order)

### Week 1-2: Complete Phase 1D

1. Claims extraction UI + service
2. UnifiedDoc L0 compiler
3. Citation tracking
4. Markdown export

### Week 3: Infrastructure

1. Error boundaries
2. Loading states
3. Toast notifications
4. Rate limiting

### Week 4: Board Management

1. Board CRUD UI
2. Board switcher
3. Templates

### Week 5-6: Sequester + Polish

1. Sequester UI
2. Policy enforcement
3. Input validation
4. Testing setup

### Week 7-8: Prepare for Pro

1. Workspace system
2. Entitlement framework
3. Plan switcher UI
4. Docker Compose + CI/CD

---

**Last Updated**: 2025-10-11
**Next Review**: After Phase 1D completion

---

## Notes

- All estimates are for a single full-time developer
- Multiply by 1.5-2x for more accurate real-world timelines
- Priority may shift based on user feedback and business needs
- Critical security issues should be addressed immediately regardless of phase
