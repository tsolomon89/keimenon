# Claude Code 2025 Modernization - Complete Implementation Guide

**Status**: Implementation Roadmap
**Priority**: CRITICAL - 85-95% token savings potential
**Timeline**: 4 weeks (aggressive but achievable)
**Last Updated**: 2025-11-16

---

## Executive Summary

This document provides the complete, exhaustive implementation plan for modernizing the Canvas Memory OS Claude Code ecosystem to 2025 best practices. Implements three breakthrough patterns:

1. **Code Execution with MCP** (98.7% token savings)
2. **Progressive Disclosure** (83% skill activation savings)
3. **Persona Pattern** (80% session savings)

### Current State vs. Target

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Base Context (CLAUDE.md) | 860 lines (~6,500 tokens) | 250 lines (~1,900 tokens) | -71% |
| Skill Activation | 500-900 lines per skill | <200 lines + JIT refs | -83% |
| Data Operations | 150,000 tokens (load all) | 2,000 tokens (code exec) | -98.7% |
| Specialized Sessions | 50,000 tokens (all tools) | 10,000 tokens (persona) | -80% |
| **Overall Workflow** | **~150,000 tokens** | **~5,000-10,000 tokens** | **-93% to -97%** |

---

## Phase 1: Foundation (Week 1) - CRITICAL TOKEN OPTIMIZATIONS

### 1.1 Code Execution MCP Server ✅ COMPLETED

**Location**: `.mcp/servers/code-execution/`

**Status**: ✅ Fully implemented
- package.json with dependencies
- TypeScript implementation with VM2 and Python-shell
- MCP module loader system
- Security sandboxing
- README with examples

**Key Features**:
- Python and JavaScript execution in isolated environments
- Progressive MCP module loading (on-demand)
- In-execution data filtering (process 10K rows, return tiny summary)
- Timeout protection and resource limits

**Token Savings**: Up to 98.7% for large data operations

**Next Steps**:
```bash
cd .mcp/servers/code-execution
npm install
npm run build
```

Add to `.claude/mcp.json`:
```json
{
  "mcpServers": {
    "canvas-code-execution": {
      "command": "node",
      "args": ["${workspaceFolder}/.mcp/servers/code-execution/dist/index.js"],
      "description": "Code execution with MCP modules for 98.7% token savings"
    }
  }
}
```

---

### 1.2 Optimize CLAUDE.md (Defer to Processes Pattern)

**Target**: 860 lines → 250 lines (-71%)

**Strategy**: Remove hard-coded rules, defer to automated processes

#### Sections to Reduce/Remove

**Section 2: Message Contract**
- BEFORE (100 lines): Detailed output format specifications
- AFTER (20 lines): Reference to schemas in `ai_context/schemas/`
```markdown
## 2) Message contract

Outputs must conform to JSON schemas in `ai_context/schemas/`.
Run validation after output: `npm run validate:schemas`
```

**Section 8: Style & Quality Rules**
- BEFORE (200 lines): Hard-coded TODO standards, style rules, cross-references
- AFTER (30 lines): Defer to tooling
```markdown
## 8) Quality enforcement

- **Code style**: Run `npm run lint -- --fix` after changes
- **TODO format**: Follow `.vscode/todo-tree.json` patterns
- **Schema validation**: Run `npm run validate:schemas` before commit
- **Documentation**: Run `npm run docs:check` to verify links
- **Tests**: Run `npm test` for coverage validation

**Single source of truth**: Tooling configs, not this file.
```

**Section 12: Autonomous Testing**
- BEFORE (203 lines): Detailed testing workflows
- AFTER (50 lines): Reference to skills
```markdown
## 12) Autonomous testing

Use the `autonomous-test-runner` skill for complete testing workflows.
See `.claude/skills/autonomous-test-runner/SKILL.md` for details.
```

**Sections 13.2-13.7: Operational Ethos**
- BEFORE (400 lines): Verbose examples and matrices
- AFTER (100 lines): Compressed core principles
```markdown
## 13) Operational ethos

### Core principles:
1. Security: OWASP Top 10 + multi-tenant isolation
2. Testing: E2E coverage for critical paths (@smoke tags)
3. Documentation: TODOs link to files, citations include line numbers
4. Schema compliance: All nodes/edges validate before commit
5. Full-stack traversal: Backend → Frontend → UI → Tests → Docs

See `docs/guides/PROFESSIONAL_STANDARDS.md` for detailed matrices.
```

#### Create Supporting Files

**New File**: `package.json` scripts (add these)
```json
{
  "scripts": {
    "validate:schemas": "node scripts/validate-schemas.js",
    "docs:check": "node scripts/check-docs-links.js",
    "lint:claude": "node scripts/lint-claude-standards.js"
  }
}
```

**New File**: `docs/guides/PROFESSIONAL_STANDARDS.md`
Move detailed matrices and checklists from CLAUDE.md Section 13 here.

**New File**: `.vscode/todo-tree.json` (standardize TODO patterns)
```json
{
  "todo-tree.general.tags": [
    "TODO",
    "FIXME",
    "HACK",
    "NOTE",
    "XXX",
    "BUG"
  ],
  "todo-tree.regex.regex": "((//|#|<!--|;|/\\*|^)\\s*($TAGS)|^\\s*- \\[ \\])",
  "todo-tree.highlights.defaultHighlight": {
    "icon": "alert",
    "type": "tag",
    "foreground": "red",
    "background": "yellow",
    "opacity": 50,
    "iconColour": "blue"
  },
  "todo-tree.highlights.customHighlight": {
    "TODO": {
      "icon": "check",
      "foreground": "#ffffff",
      "background": "#0088ff",
      "iconColour": "#0088ff"
    },
    "FIXME": {
      "foreground": "#ffffff",
      "background": "#ff0000",
      "iconColour": "#ff0000"
    },
    "HACK": {
      "foreground": "#000000",
      "background": "#ffcc00",
      "iconColour": "#ffcc00"
    }
  }
}
```

**Token Savings**: -70% base context cost

---

### 1.3 Persona Pattern Implementation

**Goal**: Specialized Claude Code configurations for different task types

**Personas to Create**:

1. **cc-main** (Default coding persona)
   - Tools: filesystem, bash, code-execution
   - No web access (security isolation)
   - No testing tools (keep context lean)

2. **cc-research** (Research persona)
   - Tools: WebFetch, WebSearch, docs MCP, filesystem
   - NO execution tools (security)
   - For architecture research, competitive analysis

3. **cc-debug** (Debugging persona)
   - Tools: code-execution, playwright-e2e, database MCP
   - For performance profiling, error investigation
   - Includes Sentry MCP (when available)

4. **cc-test** (Testing persona)
   - Tools: playwright-e2e, api-testing, chat-import, visual-feedback
   - For test generation, healing, validation
   - Autonomous testing skills enabled

5. **cc-deploy** (Deployment persona)
   - Tools: bash, git-workflow, api-testing
   - For pre-deploy validation, migration, rollback
   - Security auditing skills enabled

#### File Structure

```
.claude/
├── CLAUDE.md (base config - always loaded)
├── personas/
│   ├── research.md (research persona additions)
│   ├── debug.md (debug persona additions)
│   ├── test.md (test persona additions)
│   └── deploy.md (deploy persona additions)
└── mcp-configs/
    ├── main.json (default MCP servers)
    ├── research.json (research MCP servers)
    ├── debug.json (debug MCP servers)
    ├── test.json (test MCP servers)
    └── deploy.json (deploy MCP servers)
```

#### MCP Configurations

**main.json** (default - minimal tools)
```json
{
  "mcpServers": {
    "canvas-code-execution": { "...": "..." },
    "canvas-database": { "...": "..." },
    "canvas-docs": { "...": "..." }
  }
}
```

**research.json** (web tools, docs, NO execution)
```json
{
  "mcpServers": {
    "canvas-docs": { "...": "..." }
  }
}
```

**debug.json** (execution, profiling, databases)
```json
{
  "mcpServers": {
    "canvas-code-execution": { "...": "..." },
    "canvas-database": { "...": "..." },
    "canvas-playwright-e2e": { "...": "..." }
  }
}
```

**test.json** (all testing MCPs)
```json
{
  "mcpServers": {
    "canvas-playwright-e2e": { "...": "..." },
    "canvas-api-testing": { "...": "..." },
    "canvas-chat-import": { "...": "..." },
    "canvas-visual-feedback": { "...": "..." },
    "canvas-database": { "...": "..." }
  }
}
```

**deploy.json** (deployment, git, validation)
```json
{
  "mcpServers": {
    "canvas-git-workflow": { "...": "..." },
    "canvas-api-testing": { "...": "..." },
    "canvas-database": { "...": "..." }
  }
}
```

#### Shell Aliases (add to `.bashrc` or `.zshrc`)

```bash
# Canvas Memory OS - Claude Code Personas

# Default coding persona
alias cc="claude"

# Research persona (web tools, docs, no execution)
alias ccr="claude --append-system-prompt-file .claude/personas/research.md --mcp-config-file .claude/mcp-configs/research.json"

# Debug persona (execution, profiling, databases)
alias ccd="claude --append-system-prompt-file .claude/personas/debug.md --mcp-config-file .claude/mcp-configs/debug.json"

# Test persona (all testing MCPs and skills)
alias cct="claude --append-system-prompt-file .claude/personas/test.md --mcp-config-file .claude/mcp-configs/test.json"

# Deploy persona (git, validation, security)
alias ccx="claude --append-system-prompt-file .claude/personas/deploy.md --mcp-config-file .claude/mcp-configs/deploy.json"
```

**Windows PowerShell** (add to profile):
```powershell
function cc { claude $args }
function ccr { claude --append-system-prompt-file .claude/personas/research.md --mcp-config-file .claude/mcp-configs/research.json $args }
function ccd { claude --append-system-prompt-file .claude/personas/debug.md --mcp-config-file .claude/mcp-configs/debug.json $args }
function cct { claude --append-system-prompt-file .claude/personas/test.md --mcp-config-file .claude/mcp-configs/test.json $args }
function ccx { claude --append-system-prompt-file .claude/personas/deploy.md --mcp-config-file .claude/mcp-configs/deploy.json $args }
```

#### Persona Prompt Content

**.claude/personas/research.md**
```markdown
# Research Persona

You are in **research mode**. Focus on:
- Gathering information from web and documentation
- Analyzing architecture patterns
- Competitive analysis
- Technology evaluation

**Tools available**: WebFetch, WebSearch, canvas-docs MCP, filesystem (read-only)

**Constraints**:
- NO code execution (use main persona for that)
- NO database modifications
- NO test execution
- Focus on gathering context, not implementation

**Output format**: Structured research reports with citations.
```

**.claude/personas/debug.md**
```markdown
# Debug Persona

You are in **debug mode**. Focus on:
- Performance profiling
- Error investigation
- Root cause analysis
- Database query optimization

**Tools available**: code-execution, database MCP, playwright-e2e, filesystem

**Constraints**:
- NO web access (security isolation)
- Use code execution for data analysis
- Log all debugging steps
- Propose fixes, don't auto-apply

**Output format**: Debug reports with root cause, evidence, and proposed fixes.
```

**.claude/personas/test.md**
```markdown
# Test Persona

You are in **test mode**. Focus on:
- E2E test generation
- Test healing
- Visual regression detection
- Coverage analysis

**Tools available**: All testing MCPs (playwright-e2e, api-testing, chat-import, visual-feedback, database)

**Constraints**:
- All tests must have data_tag: 'test'
- Clean up test data in afterEach
- Tag critical tests with @smoke
- Validate multi-tenant isolation

**Output format**: Test files, coverage reports, healing summaries.
```

**.claude/personas/deploy.md**
```markdown
# Deploy Persona

You are in **deployment mode**. Focus on:
- Pre-deployment validation
- Security auditing
- Migration safety
- Rollback planning

**Tools available**: git-workflow, api-testing, database, bash

**Constraints**:
- NEVER force push to main/master
- ALL migrations must have rollback
- Run full test suite before deploy
- Validate OWASP Top 10 compliance

**Output format**: Deployment checklists, validation reports, rollback procedures.
```

**Token Savings**: -80% per specialized session

---

## Phase 2: Skills Modernization (Week 2)

### 2.1 Optimize All Skill Descriptions (<100 chars)

**Goal**: Concise, trigger-optimized descriptions for progressive disclosure

#### Current Skills (Need Optimization)

1. **autonomous-test-discoverer**
   - Current: 193 chars
   - Target: <100 chars
   - New: "Analyzes E2E coverage gaps and prioritizes missing tests. Use when auditing test coverage."

2. **autonomous-test-generator**
   - Current: 187 chars
   - Target: <100 chars
   - New: "Generates E2E tests from API specs with visual verification. Use when adding features."

3. **autonomous-test-healer**
   - Current: 178 chars
   - Target: <100 chars
   - New: "Auto-fixes failing E2E tests after API/UI changes. Use when tests break."

4. **autonomous-test-runner**
   - Current: 201 chars
   - Target: <100 chars
   - New: "Runs full autonomous test lifecycle (discover→generate→execute→heal). Use for 95% coverage."

5. **code-review-enforcer**
   - Current: 195 chars
   - Target: <100 chars
   - New: "Reviews code for graph patterns, schema compliance, TODO format, citations. Use on PRs/commits."

6. **e2e-test-generator**
   - Current: 183 chars
   - Target: <100 chars
   - New: "Generates Playwright tests for canvas ops, data mgmt, auth. Use when adding E2E coverage."

7. **graph-schema-validator**
   - Current: 197 chars
   - Target: <100 chars
   - New: "Validates node/edge ops against JSON schemas with account_id isolation. Use before DB ops."

8. **mcp-integration-expert**
   - Current: 193 chars
   - Target: <100 chars
   - New: "Orchestrates 6 MCP servers for database queries, docs search, API testing, E2E runs."

9. **pipeline-verifier**
   - Current: 189 chars
   - Target: <100 chars
   - New: "Validates backend API→frontend integration→UI/UX→E2E tests. Use for feature validation."

10. **vector-similarity-ops**
    - Current: 191 chars
    - Target: <100 chars
    - New: "Operates on similarity detection, duplicate resolution, fingerprinting. Use for dedup/import."

#### Implementation

For each skill, update the YAML frontmatter in `SKILL.md`:

```yaml
---
name: autonomous-test-discoverer
description: Analyzes E2E coverage gaps and prioritizes missing tests. Use when auditing test coverage.
---
```

---

### 2.2 Apply Progressive Disclosure to Top 3 Skills

**Targets**:
1. `autonomous-test-generator` (870 lines → 150 + refs)
2. `autonomous-test-healer` (907 lines → 150 + refs)
3. `mcp-integration-expert` (1167 lines → 150 + refs)

#### Pattern for Progressive Disclosure

**Main SKILL.md** (<200 lines):
- Quick start (20 lines)
- Core workflow (40 lines)
- Tool list (30 lines)
- References to detailed docs (30 lines)
- Examples (50 lines)

**Supporting docs/** (loaded JIT):
- `docs/detailed-workflow.md` (full step-by-step)
- `docs/visual-tools.md` (screenshot comparison APIs)
- `docs/patterns.md` (selector strategies, anti-patterns)
- `docs/troubleshooting.md` (common issues, solutions)
- `docs/integration.md` (how to use with other skills)

#### Example: autonomous-test-generator

**BEFORE** (870 lines in SKILL.md):
All content in one file, loaded every time skill activates.

**AFTER** (150 lines in SKILL.md + 720 lines in refs):

`.claude/skills/autonomous-test-generator/SKILL.md`:
```markdown
---
name: autonomous-test-generator
description: Generates E2E tests from API specs with visual verification. Use when adding features.
---

## Quick Start

Generates Playwright E2E tests from API endpoints and UI flows.

**When to use**:
- Adding new features that need E2E coverage
- Filling coverage gaps
- Creating multi-tenant isolation tests

**Outputs**: Production-ready `.spec.ts` files following project patterns.

## Core Workflow

1. **Endpoint Analysis**: Parse API spec, extract operations
2. **Visual Reconnaissance**: Navigate UI, capture screenshots
3. **Test Generation**: Write tests following templates
4. **Verification**: Run generated tests, validate fixtures

See: [docs/detailed-workflow.md](./docs/detailed-workflow.md)

## Tools
- Read, Write, Edit, Glob, Grep
- Task (Playwright Generator Agent)
- MCP: database, playwright-e2e, visual-feedback

## References

- [Detailed Workflow](./docs/detailed-workflow.md) - Full step-by-step guide
- [Visual Tools Reference](./docs/visual-tools.md) - Screenshot comparison APIs
- [Common Patterns](./docs/patterns.md) - Selector strategies, ARIA-first approach
- [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions
- [Integration Guide](./docs/integration.md) - Using with other skills

## Examples

### Example 1: Generate CRUD tests

```
User: "Generate E2E tests for POST /api/v1/groups/:id/members batch endpoint"

Agent:
1. Reads API docs for endpoint signature
2. Navigates to /groups page, captures UI
3. Generates test file with:
   - Add multiple members at once
   - Remove multiple members
   - Mix of add and remove
   - Invalid node IDs (error handling)
   - Multi-tenant isolation
   - RBAC enforcement
4. Runs test to validate
5. Returns: tests/e2e/groups-batch-operations.spec.ts
```

### Example 2: Visual verification workflow

```
[30 more lines of examples...]
```

[End of SKILL.md - 150 lines total]
```

`.claude/skills/autonomous-test-generator/docs/detailed-workflow.md`:
```markdown
# Autonomous Test Generator - Detailed Workflow

[Full 200-line step-by-step workflow]
[Only loaded when agent needs detailed instructions]
```

`.claude/skills/autonomous-test-generator/docs/visual-tools.md`:
```markdown
# Visual Tools Reference

## Screenshot Comparison
[100 lines of visual tool documentation]
```

**Token Savings**: -83% base load, only load details when needed

---

### 2.3 Create 6 New Critical Skills

#### New Skill 1: code-execution-orchestrator

**Location**: `.claude/skills/code-execution-orchestrator/SKILL.md`

```markdown
---
name: code-execution-orchestrator
description: Executes Python/JS code with MCP APIs for large data ops. Use for >1000 records.
---

## Purpose

Wrapper for the Code Execution MCP server. Implements 2025 "Code Execution with MCP" pattern for 98.7% token savings.

## When to Use

- Database queries returning >1000 rows
- Complex data filtering/aggregation
- Multi-step data transformations
- Performance-critical operations

## How It Works

1. Agent writes Python/JavaScript code
2. Code imports MCP servers as modules
3. Data processed in execution environment (zero LLM tokens)
4. Only tiny summary returned to LLM

## Tools

- `mcp__code-execution__execute_python`
- `mcp__code-execution__execute_javascript`
- `mcp__code-execution__list_available_modules`

## Example Usage

```python
# Query all Source nodes and find duplicates
from canvas_database import query_nodes

# This happens in execution env (zero LLM tokens)
nodes = query_nodes(kind="Source", limit=10000)

# Filter for last 7 days
recent = [n for n in nodes if n['created_at'] > timestamp_7_days_ago]

# Detect duplicates by fingerprint
duplicates = {}
for node in recent:
    fp = node.get('fingerprint')
    if fp:
        duplicates[fp] = duplicates.get(fp, []) + [node['id']]

dup_count = sum(1 for ids in duplicates.values() if len(ids) > 1)

# Return tiny summary (this goes to LLM)
return {
    "total_nodes": len(nodes),
    "recent_nodes": len(recent),
    "duplicate_fingerprints": dup_count,
    "sample_duplicates": list(duplicates.values())[:3]
}
```

**Token Savings**: From 150,000 → 2,000 tokens (98.7%)

## Best Practices

1. **Always return summaries**, not raw data
2. **Use for >100 records** (smaller datasets don't need code execution)
3. **Import multiple MCP modules** for cross-server operations
4. **Handle errors in code** (try/catch, return error details)
5. **Set appropriate timeouts** (default: 30s, increase for heavy ops)

## See Also

- [Code Execution MCP Server README](.mcp/servers/code-execution/README.md)
- [Token Optimization Guide](docs/guides/TOKEN_OPTIMIZATION.md)
```

---

#### New Skill 2: research-specialist

**Location**: `.claude/skills/research-specialist/SKILL.md`

```markdown
---
name: research-specialist
description: Dedicated research persona with web tools and doc search. Use for architecture research.
---

## Purpose

Specialized persona for research tasks without execution tools. Security-isolated for safe web access.

## When to Use

- Researching new technologies or patterns
- Competitive analysis
- Architecture decisions
- Documentation writing
- Learning new frameworks/libraries

## Persona Configuration

Use the research persona: `ccr` (or `claude --persona research`)

**Tools available**:
- WebFetch, WebSearch (web access)
- mcp__docs__search_docs (project docs)
- Read, Grep (local files, read-only)
- NO execution tools (security isolation)

## Workflow

1. **Define Research Question**: What do you need to know?
2. **Search Web**: Use WebSearch for latest information
3. **Fetch Documentation**: Use WebFetch to read docs
4. **Search Project Docs**: Use mcp__docs__search_docs for internal context
5. **Synthesize Findings**: Structured report with citations

## Example Usage

```
User: "Research best practices for implementing OAuth 2.1 in Node.js"

Agent (in research persona):
1. WebSearch: "OAuth 2.1 best practices Node.js 2025"
2. WebFetch: https://oauth.net/2.1/ (official spec)
3. WebFetch: https://www.npmjs.com/package/oauth2-server (popular lib)
4. mcp__docs__search_docs: "authentication" (internal patterns)
5. Synthesize report:

## OAuth 2.1 Implementation Research

### Latest Spec (2025)
- Authorization Code Flow with PKCE (mandatory)
- No implicit flow (deprecated)
- Refresh token rotation required

### Popular Libraries
- oauth2-server (15M downloads/week)
- passport-oauth2 (8M downloads/week)

### Internal Patterns
- Current: JWT with 15min expiry
- Recommendation: Add refresh token rotation
- Migration path: [details]

### Implementation Plan
[Step-by-step plan with citations]
```

## Output Format

Research reports should include:
- **Executive Summary** (2-3 sentences)
- **Findings** (structured, with citations)
- **Recommendations** (actionable next steps)
- **References** (URLs, internal docs)

## Best Practices

1. **Always cite sources** (URL, date accessed)
2. **Check publication date** (prefer 2024-2025)
3. **Cross-reference** (web sources + internal docs)
4. **Security-first** (research mode can't execute code)
5. **Structured output** (use markdown, headers, lists)
```

---

#### New Skill 3: security-auditor

**Location**: `.claude/skills/security-auditor/SKILL.md`

```markdown
---
name: security-auditor
description: OWASP Top 10 and multi-tenant security auditor. Use for pre-deployment validation.
---

## Purpose

Validates security compliance before deployment. Checks for OWASP Top 10 vulnerabilities and multi-tenant data isolation.

## When to Use

- **Pre-deployment**: Before merging to main/master
- **Security reviews**: Audit existing code
- **Post-incident**: After security issues discovered
- **Regular audits**: Monthly security sweeps

## Security Checks

### OWASP Top 10 (2025)

1. **Broken Access Control**
   - Multi-tenant isolation (`account_id` on all queries)
   - RBAC enforcement (permission_level checks)
   - Direct object reference prevention

2. **Cryptographic Failures**
   - Secrets not in code (`.env` files)
   - Password hashing (bcrypt, scrypt)
   - HTTPS enforcement

3. **Injection**
   - SQL injection (parameterized queries)
   - Command injection (no `child_process.exec` with user input)
   - XSS (sanitize all user inputs)

4. **Insecure Design**
   - Authentication before authorization
   - Rate limiting on sensitive endpoints
   - Audit logging for privileged operations

5. **Security Misconfiguration**
   - No default credentials
   - Error messages don't leak stack traces
   - CORS policies restrictive

6. **Vulnerable and Outdated Components**
   - `npm audit` passing
   - No known CVEs in dependencies
   - Regular updates scheduled

7. **Identification and Authentication Failures**
   - Multi-factor authentication available
   - Session management secure
   - Account lockout after failed attempts

8. **Software and Data Integrity Failures**
   - Dependency checksums verified
   - CI/CD pipeline secured
   - Code signing for releases

9. **Security Logging and Monitoring Failures**
   - All auth events logged
   - Security alerts configured
   - Log retention policy enforced

10. **Server-Side Request Forgery (SSRF)**
    - Whitelist external URLs
    - No user-controlled redirect URLs
    - Validate all external API calls

### Multi-Tenant Isolation

- ✅ All database queries include `account_id` filter
- ✅ API endpoints validate user belongs to requested account
- ✅ WebSocket connections scoped to account
- ✅ File uploads scoped to account directory
- ✅ Edges cannot cross account boundaries

## Tools

- Read, Grep (code analysis)
- mcp__api-testing__test_multi_tenant (isolation testing)
- mcp__database__query_nodes (data isolation verification)

## Workflow

1. **Code Scan**: Grep for security anti-patterns
2. **Dependency Audit**: `npm audit` + CVE check
3. **Multi-Tenant Test**: Run isolation tests
4. **Manual Review**: High-risk code paths
5. **Report**: Findings with severity and remediation

## Example Usage

```
User: "Audit security before deploying user profile editing feature"

Agent:
1. Grep for SQL injection vectors
2. Check account_id filtering on all queries
3. Verify input sanitization
4. Test multi-tenant isolation:
   - Create user A in account 1
   - Create user B in account 2
   - User A tries to edit user B's profile
   - Expected: 403 Forbidden
5. Generate report:

## Security Audit Report

### Critical Issues: 0
### High Issues: 1
### Medium Issues: 3
### Low Issues: 5

#### High: Missing Rate Limiting on Profile Update
**File**: apps/api/src/routes/users.routes.ts:87
**Issue**: PUT /api/users/:id has no rate limiting
**Risk**: Brute force attacks, DoS
**Remediation**: Add express-rate-limit middleware
**Code**:
```typescript
import rateLimit from 'express-rate-limit';

const updateProfileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per window
});

router.put('/api/users/:id', updateProfileLimiter, async (req, res) => {
  // ...
});
```

[Continue with other findings...]
```

## Severity Levels

- **Critical**: Immediate data breach risk (e.g., SQL injection in production)
- **High**: Exploitable vulnerability (e.g., broken access control)
- **Medium**: Security misconfiguration (e.g., missing rate limit)
- **Low**: Best practice violation (e.g., verbose error messages)

## Remediation SLAs

- Critical: Fix immediately (< 4 hours)
- High: Fix before deployment (< 24 hours)
- Medium: Fix in next sprint (< 1 week)
- Low: Fix in backlog (< 1 month)

## Best Practices

1. **Run before every deployment**
2. **Automate in CI/CD** (fail build on Critical/High)
3. **Track findings** (GitHub Issues with `security` label)
4. **Re-audit after fixes** (verify remediation)
5. **Security training** (share findings with team)
```

---

[Continuing with skills 4-6 in next section due to length...]

---

## Phase 3: MCP Server Enhancements (Week 3)

### 3.1 Complete Missing MCP Servers

#### codebase MCP Server

**Purpose**: Code navigation, dependency analysis, usage finding

**Location**: `.mcp/servers/codebase/`

**Tools**:
1. `find_usages` - Find all usages of a function/class/variable
2. `analyze_dependencies` - Analyze import/require dependencies
3. `find_definitions` - Find where symbol is defined
4. `get_call_hierarchy` - Get callers and callees
5. `analyze_complexity` - Calculate cyclomatic complexity
6. `find_patterns` - Search for code patterns (regex + AST)

[Full implementation in supplementary file]

---

#### git-workflow MCP Server

**Purpose**: Git operations, commit generation, PR workflows

**Location**: `.mcp/servers/git-workflow/`

**Tools**:
1. `suggest_commit_message` - AI-generated commit messages from diff
2. `create_commit` - Create commit with validation
3. `create_branch` - Create feature branch with naming convention
4. `analyze_diff` - Analyze changes for scope/impact
5. `suggest_pr_title` - Generate PR title from commits
6. `generate_pr_body` - Generate PR description
7. `validate_commit_message` - Check conventional commit format
8. `create_pr` - Create PR with generated content

[Full implementation in supplementary file]

---

### 3.2 Implement On-Demand Tool Loading

**Goal**: Progressive tool loading instead of upfront loading all tools

**Pattern**: Metadata endpoint + lazy loading

#### Current (Token-Heavy)

All MCP servers loaded at startup:
- canvas-database: 5 tools × ~100 tokens = 500 tokens
- canvas-docs: 5 tools × ~100 tokens = 500 tokens
- canvas-api-testing: 9 tools × ~100 tokens = 900 tokens
- canvas-chat-import: 8 tools × ~100 tokens = 800 tokens
- canvas-settings-crm: 7 tools × ~100 tokens = 700 tokens
- canvas-playwright-e2e: 9 tools × ~100 tokens = 900 tokens
- **Total: ~4,300 tokens upfront (every session)**

#### Target (Token-Light)

Metadata-only at startup:
- All servers: 9 servers × ~20 tokens = 180 tokens upfront
- Tools loaded on-demand when needed
- **Savings: 96% (-4,120 tokens)**

#### Implementation

Add to each MCP server:

**New Tool**: `get_server_metadata`
```json
{
  "name": "get_server_metadata",
  "description": "Get server capabilities and tool list (not full definitions)",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**Returns**:
```json
{
  "server": "canvas-database",
  "version": "1.0.0",
  "tool_count": 5,
  "tools": [
    { "name": "query_nodes", "category": "query" },
    { "name": "query_edges", "category": "query" },
    { "name": "inspect_schema", "category": "schema" },
    { "name": "get_stats", "category": "analytics" },
    { "name": "search_content", "category": "search" }
  ],
  "description": "Database querying and schema inspection"
}
```

**New Tool**: `load_tool_definition`
```json
{
  "name": "load_tool_definition",
  "description": "Load full definition for a specific tool (on-demand)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tool_name": {
        "type": "string",
        "description": "Name of tool to load definition for"
      }
    },
    "required": ["tool_name"]
  }
}
```

**Returns** (full tool definition):
```json
{
  "name": "query_nodes",
  "description": "Query nodes from the database with filters (kind, account_id, date range, limit)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "kind": { "type": "string", "enum": ["UploadItem", "Chat", ...] },
      "account_id": { "type": "string" },
      "created_after": { "type": "number" },
      "limit": { "type": "number", "default": 50 }
    }
  }
}
```

#### Workflow

**Startup (token-light)**:
1. Agent loads metadata from all servers (180 tokens)
2. Agent knows what tools exist, but not their full signatures

**On-Demand (when needed)**:
1. User: "Query all Source nodes from last week"
2. Agent: Identifies need for `canvas-database` server
3. Agent: Calls `load_tool_definition("query_nodes")`
4. Agent: Receives full definition (~100 tokens)
5. Agent: Uses tool with correct parameters
6. Total tokens: 180 (startup) + 100 (on-demand) = 280 tokens

**Savings**: From 4,300 → 280 tokens (-93%)

---

### 3.3 MCP Composability Pattern

**Goal**: Enable MCP servers to call each other

**Use Cases**:
- Database server queries docs server for schema documentation
- API testing server uses database server to verify data
- Git workflow server uses codebase server to analyze changed files

#### Architecture

```
┌─────────────────────────────────────────┐
│ Claude Agent                            │
│  ↓ Calls MCP Server A                   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ MCP Server A                            │
│  ↓ Calls MCP Server B (composability)   │
│  ↓ Receives result                      │
│  ↓ Processes and returns to agent       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ MCP Server B                            │
│  ↓ Executes tool                        │
│  ↓ Returns result to Server A           │
└─────────────────────────────────────────┘
```

#### Implementation

**Add to each MCP server** (TypeScript example):

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class ComposableMCPServer {
  private mcpClients: Map<string, Client> = new Map();

  async connectToMCPServer(serverName: string, serverPath: string) {
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    });

    const client = new Client({
      name: `${this.name}-client`,
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
    this.mcpClients.set(serverName, client);
  }

  async callMCPServer(serverName: string, toolName: string, args: any) {
    const client = this.mcpClients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not connected`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return result;
  }
}
```

**Example Usage** (Database server calling Docs server):

```typescript
// In canvas-database MCP server

async function inspectSchemaWithDocs(tableName: string) {
  // Get schema from database
  const schema = await getTableSchema(tableName);

  // Call docs server to get documentation for this table
  const docs = await this.callMCPServer('canvas-docs', 'search_docs', {
    query: `schema ${tableName}`,
    limit: 5,
  });

  // Combine schema + documentation
  return {
    table: tableName,
    schema,
    documentation: docs,
  };
}
```

**Benefits**:
- Richer tool outputs (schema + docs in one call)
- Reduce round-trips to LLM
- Modular server composition
- Separation of concerns maintained

---

## Phase 4: Documentation & Validation (Week 4)

### 4.1 Update CLAUDE.md with New Sections

**Add Section 14: Progressive Disclosure Architecture**

```markdown
## 14) Progressive Disclosure Architecture

**Core Principle**: Context is loaded just-in-time (JIT), not upfront.

### Three-Level Loading

1. **Level 1 (Startup)**: Skill names + descriptions only (~100 tokens per skill)
2. **Level 2 (Activation)**: Full SKILL.md when task matches (~1,100 tokens)
3. **Level 3 (Deep Dive)**: Supporting docs when needed (~variable tokens)

**Token Efficiency**:
- 100 skills: 10,000 tokens (Level 1) vs 110,000 tokens (old monolithic)
- **Savings: 90%**

### Implementation

**Skills**:
- Keep SKILL.md < 200 lines
- Split content into `docs/` subdirectories
- Link to supporting docs for deep dives
- Use concise descriptions (< 100 chars)

**MCP Servers**:
- Load metadata only at startup (get_server_metadata)
- Load tool definitions on-demand (load_tool_definition)
- Return summaries, not raw data

**Code Execution**:
- Process data in execution environment
- Return tiny summaries to LLM
- Achieve 98.7% token savings on large datasets
```

---

**Add Section 15: Code Execution with MCP**

```markdown
## 15) Code Execution with MCP

**Breakthrough Pattern**: 98.7% token savings for large data operations.

### The Problem

Traditional approach loads all data into LLM context:
- Query 10,000 nodes = 150,000 tokens
- Filter, aggregate, analyze in LLM context
- Extremely token-expensive

### The Solution

Code execution with MCP modules:
1. Agent writes Python/JavaScript code
2. Code imports MCP servers as modules
3. Data processed in execution environment (zero LLM tokens)
4. Only tiny summary returned to LLM

### Token Savings

| Operation | Traditional | Code Execution | Savings |
|-----------|-------------|----------------|---------|
| Query 10K nodes | 150,000 | 2,000 | 98.7% |
| Filter 5K edges | 80,000 | 1,500 | 98.1% |
| Multi-server orchestration | 200,000 | 3,000 | 98.5% |

### When to Use

- Database queries returning > 100 records
- Complex data filtering/aggregation
- Multi-step transformations
- Performance-critical operations

### Example

```python
from canvas_database import query_nodes

# Query all nodes (in execution env, zero LLM tokens)
nodes = query_nodes(kind="Source", limit=10000)

# Filter for duplicates
duplicates = find_duplicates(nodes)

# Return tiny summary (this goes to LLM)
return {
    "total": len(nodes),
    "duplicates": len(duplicates),
    "sample": duplicates[:3]
}
```

**Result**: 2,000 tokens instead of 150,000 (98.7% savings)

### MCP Server

Use `mcp__code-execution__execute_python` or `execute_javascript`.
See: `.mcp/servers/code-execution/README.md`

### Skill

Use `code-execution-orchestrator` skill for guided workflows.
See: `.claude/skills/code-execution-orchestrator/SKILL.md`
```

---

**Add Section 16: Persona Pattern for Context Isolation**

```markdown
## 16) Persona Pattern for Context Isolation

**Goal**: Specialized Claude Code configurations for different task types.

### Why Personas?

**Problem**: Loading all MCP servers = 50,000 tokens upfront
**Solution**: Load only relevant tools per persona = 10,000 tokens

**Savings**: 80% per session

### Available Personas

1. **cc** (default): Minimal tools for coding
   - Tools: filesystem, bash, code-execution
   - Best for: day-to-day coding

2. **ccr** (research): Web tools, docs, no execution
   - Tools: WebFetch, WebSearch, docs MCP
   - Best for: architecture research, competitive analysis

3. **ccd** (debug): Execution, profiling, databases
   - Tools: code-execution, database, playwright-e2e
   - Best for: performance profiling, error investigation

4. **cct** (test): All testing MCPs
   - Tools: playwright-e2e, api-testing, visual-feedback
   - Best for: test generation, healing, validation

5. **ccx** (deploy): Git, validation, security
   - Tools: git-workflow, api-testing, database
   - Best for: pre-deploy validation, migrations

### Usage

```bash
# Default coding
cc "implement user profile editing"

# Research
ccr "research OAuth 2.1 best practices for Node.js"

# Debug
ccd "profile database query performance"

# Test
cct "generate E2E tests for new feature"

# Deploy
ccx "validate security before deployment"
```

### Configuration

Personas defined in:
- `.claude/personas/` - persona-specific prompts
- `.claude/mcp-configs/` - persona-specific MCP server lists

See: `docs/guides/PERSONA_PATTERN.md`
```

---

**Add Section 17: Token Optimization Strategies**

```markdown
## 17) Token Optimization Strategies

### Optimization Hierarchy

1. **Base Context**: Reduce CLAUDE.md from 860 → 250 lines (-71%)
   - Defer to processes (linters, validators, tooling)
   - Move details to supporting files
   - Reference, don't replicate

2. **Skill Activation**: Progressive disclosure (-83%)
   - Keep SKILL.md < 200 lines
   - Link to supporting docs
   - Load details only when needed

3. **Data Operations**: Code execution (-98.7%)
   - Process data in execution environment
   - Return summaries, not raw data
   - Use for queries > 100 records

4. **Specialized Sessions**: Persona pattern (-80%)
   - Load only relevant tools per task type
   - 5 personas for different workflows
   - Switch contexts as needed

### Combined Savings

**Typical Workflow** (research → code → test → deploy):

1. Research (ccr): 10,000 tokens (vs 50,000 without persona) = -80%
2. Coding (cc): 5,000 tokens (vs 150,000 with large data query) = -97%
3. Testing (cct): 15,000 tokens (vs 25,000 with verbose skills) = -40%
4. Deploy (ccx): 8,000 tokens (vs 20,000 with all tools) = -60%

**Total**: 38,000 tokens (vs 245,000 without optimizations)
**Overall Savings**: -84%

### Measurement

Track token usage:
- Run `npm run measure-tokens` before/after optimizations
- Use Claude API token counts (not estimates)
- Monitor dashboards: `.claude/metrics/token-usage.json`

### Best Practices

1. **Use code execution for > 100 records**
2. **Use personas for specialized tasks**
3. **Keep SKILL.md < 200 lines**
4. **Defer to processes (linters, validators)**
5. **Return summaries, not raw data**
6. **Load tool definitions on-demand**
7. **Monitor token usage regularly**

See: `docs/guides/TOKEN_OPTIMIZATION.md` for detailed strategies
```

---

### 4.2 Create TOKEN_OPTIMIZATION.md Guide

**Location**: `docs/guides/TOKEN_OPTIMIZATION.md`

[Complete 500-line guide with:
- Introduction to token economics
- Detailed breakdown of each optimization pattern
- Before/after examples with token counts
- Measurement methodology
- Real-world case studies
- Token usage dashboard setup
- Continuous optimization strategies]

---

### 4.3 Create Validation Framework & Metrics Dashboard

#### Token Usage Metrics

**File**: `scripts/measure-tokens.js`

```javascript
#!/usr/bin/env node

/**
 * Token Usage Measurement Script
 *
 * Measures token usage across different workflows and generates reports.
 */

import fs from 'fs/promises';
import path from 'path';

// Approximate token counting (4 chars ≈ 1 token)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

async function measureCLAUDEmd() {
  const content = await fs.readFile('CLAUDE.md', 'utf-8');
  const lines = content.split('\n').length;
  const tokens = estimateTokens(content);

  return {
    file: 'CLAUDE.md',
    lines,
    tokens,
    category: 'base_context',
  };
}

async function measureSkills() {
  const skillsDir = '.claude/skills';
  const skills = await fs.readdir(skillsDir);

  const measurements = [];

  for (const skill of skills) {
    const skillMdPath = path.join(skillsDir, skill, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const lines = content.split('\n').length;
      const tokens = estimateTokens(content);

      measurements.push({
        file: `${skill}/SKILL.md`,
        lines,
        tokens,
        category: 'skill',
        skill_name: skill,
      });
    } catch (error) {
      // Skill might not have SKILL.md
    }
  }

  return measurements;
}

async function measureMCPServers() {
  // Measure tool definitions (would require parsing MCP server code)
  // Placeholder for now
  return [];
}

async function generateReport() {
  const claudemd = await measureCLAUDEmd();
  const skills = await measureSkills();

  const report = {
    timestamp: new Date().toISOString(),
    base_context: {
      claudemd,
      total_tokens: claudemd.tokens,
    },
    skills: {
      count: skills.length,
      total_tokens: skills.reduce((sum, s) => sum + s.tokens, 0),
      average_tokens: Math.floor(
        skills.reduce((sum, s) => sum + s.tokens, 0) / skills.length
      ),
      largest: skills.sort((a, b) => b.tokens - a.tokens).slice(0, 5),
    },
    total_estimated_tokens:
      claudemd.tokens + skills.reduce((sum, s) => sum + s.tokens, 0),
  };

  // Write report
  await fs.mkdir('.claude/metrics', { recursive: true });
  await fs.writeFile(
    '.claude/metrics/token-usage.json',
    JSON.stringify(report, null, 2)
  );

  // Console output
  console.log('Token Usage Report');
  console.log('==================');
  console.log(`Base Context (CLAUDE.md): ${claudemd.tokens.toLocaleString()} tokens`);
  console.log(`Skills (${skills.length} total): ${report.skills.total_tokens.toLocaleString()} tokens`);
  console.log(`Average Skill Size: ${report.skills.average_tokens.toLocaleString()} tokens`);
  console.log(`\nTotal Estimated Tokens: ${report.total_estimated_tokens.toLocaleString()}`);
  console.log(`\nLargest Skills:`);
  report.skills.largest.forEach((skill, i) => {
    console.log(`  ${i + 1}. ${skill.skill_name}: ${skill.tokens.toLocaleString()} tokens`);
  });

  console.log(`\nReport saved to: .claude/metrics/token-usage.json`);
}

generateReport().catch(console.error);
```

**Add to package.json**:
```json
{
  "scripts": {
    "measure-tokens": "node scripts/measure-tokens.js"
  }
}
```

**Usage**:
```bash
# Before optimizations
npm run measure-tokens
# Output: Total Estimated Tokens: 185,000

# After Phase 1-3 optimizations
npm run measure-tokens
# Output: Total Estimated Tokens: 15,000

# Savings: -92%
```

---

## Implementation Timeline

### Week 1: Foundation ✅ (In Progress)
- [x] Day 1-2: Code Execution MCP Server ✅
- [ ] Day 3: Optimize CLAUDE.md (860 → 250 lines)
- [ ] Day 4-5: Implement Persona Pattern

### Week 2: Skills
- [ ] Day 1-2: Optimize all 10 skill descriptions (<100 chars)
- [ ] Day 3-4: Apply Progressive Disclosure to top 3 skills
- [ ] Day 5: Create code-execution-orchestrator, research-specialist, security-auditor skills

### Week 3: MCP Servers
- [ ] Day 1-2: Complete codebase and git-workflow MCP servers
- [ ] Day 3: Implement on-demand tool loading for all servers
- [ ] Day 4-5: Implement MCP composability pattern

### Week 4: Documentation & Validation
- [ ] Day 1-2: Update CLAUDE.md with Sections 14-17
- [ ] Day 3: Create TOKEN_OPTIMIZATION.md guide
- [ ] Day 4-5: Implement measurement scripts and validate savings

---

## Success Criteria

### Quantitative Metrics

- [ ] CLAUDE.md: < 250 lines (<2,000 tokens)
- [ ] All skill descriptions: < 100 characters
- [ ] Top 3 skills: < 200 lines each
- [ ] Code execution server: Operational and tested
- [ ] All MCP servers: Metadata endpoint implemented
- [ ] Token usage: < 10,000 tokens for typical workflows (-93%)

### Qualitative Metrics

- [ ] Personas documented and aliased (5 personas)
- [ ] Progressive disclosure working (JIT loading verified)
- [ ] Code execution examples documented
- [ ] Token measurement dashboard operational
- [ ] All new sections added to CLAUDE.md

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Code execution security | HIGH | Sandboxed environments, no filesystem/network access |
| Breaking existing workflows | MEDIUM | Phased rollout, maintain backward compatibility |
| Persona confusion | LOW | Clear documentation, mnemonic aliases |
| MCP server complexity | MEDIUM | Start simple, iterate based on feedback |
| Token measurement inaccuracy | LOW | Use Claude API counts, not estimates |

---

## Next Steps

1. **Complete Phase 1B**: Optimize CLAUDE.md (see Section 1.2)
2. **Complete Phase 1C**: Implement Persona Pattern (see Section 1.3)
3. **Test Code Execution Server**: Validate with real workflows
4. **Measure Baseline**: Run token measurement before Phase 2
5. **Execute Phase 2**: Skills modernization (Week 2)

---

## References

- [Code Execution with MCP (Anthropic)](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Agent Skills Best Practices (Anthropic)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [MCP Best Practices 2025](https://modelcontextprotocol.info/docs/best-practices/)
- [Progressive Disclosure Pattern](https://code.claude.com/docs/en/skills)
- [Research Document](docs/archive_development/Claude Agents and Documentation Research.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-16
**Status**: ACTIVE - Implementation in progress
**Owner**: Canvas Memory OS Team
