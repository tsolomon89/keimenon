# Keimenon - Claude Skills

**Project-Specific Skills for AI-Assisted Development**

This directory contains Claude Skills that extend AI assistant capabilities with Keimenon-specific knowledge and workflows.

---

## What are Claude Skills?

Claude Skills are modular capabilities that Claude automatically activates based on task relevance. Unlike slash commands (which you explicitly invoke), skills activate contextually when their description matches your request.

**Key Features**:

- **Automatic Activation**: Skills activate based on task description
- **Tool Restrictions**: Skills can be restricted to specific tools (read-only, database access, etc.)
- **Domain Expertise**: Each skill has deep knowledge of its domain
- **Integration**: Skills work together and with MCP servers

---

## Available Skills

### 1. 🔍 graph-schema-validator

**When It Activates**: "Validate this node creation", "Check if this edge is valid", "Is this database operation correct?"

**What It Does**:

- Validates nodes/edges against JSON schemas
- Checks multi-tenant isolation (account_id enforcement)
- Verifies fingerprinting for Source/CodeBlock nodes
- Ensures edge semantics are correct
- References CLAUDE.md operating guide

**Tools**: Read, Grep, Glob, keimenon-database MCP tools (read-only)

**Example**:

```
You: "I'm creating a Source node. Can you validate this structure?"

Claude: [Activates graph-schema-validator skill]
        "Let me check that against the schema and Keimenon principles..."
```

---

### 2. ✅ code-review-enforcer

**When It Activates**: "Review this code", "Check my PR", "Is this following our patterns?"

**What It Does**:

- Reviews code against CLAUDE.md principles
- Validates TODO/FIXME/HACK comment format
- Checks for proper citations and cross-references
- Ensures multi-tenant safety
- Verifies schema compliance

**Tools**: Read, Grep, Glob, Edit, keimenon-docs MCP tools

**Example**:

```
You: "Review my authentication code changes"

Claude: [Activates code-review-enforcer skill]
        "I'll check this against CLAUDE.md principles and architectural patterns..."
```

---

### 3. 🧪 e2e-test-generator

**When It Activates**: "Generate E2E tests for this feature", "Create Playwright tests", "Add test coverage"

**What It Does**:

- Generates Playwright tests following project patterns
- Creates tests for keimenon operations, auth flows, data management
- Ensures proper test isolation and tagging (@smoke/@full)
- Validates backend integration in tests
- Uses project fixtures and utilities

**Tools**: Read, Write, Edit, Glob, Grep, Bash (playwright), playwright-e2e MCP tools

**Example**:

```
You: "Generate E2E tests for the chat import feature"

Claude: [Activates e2e-test-generator skill]
        "I'll create comprehensive tests covering happy path, errors, and backend integration..."
```

---

### 4. 🔗 pipeline-verifier

**When It Activates**: "Validate this feature end-to-end", "Check if everything works", "Is this ready for deploy?"

**What It Does**:

- Validates complete feature pipeline across all layers
- Backend: API endpoints, database, business logic
- Frontend: Component integration, API calls, state management
- UI/UX: Visual components, accessibility, interactions
- Tests: E2E coverage, test execution, reliability
- Generates comprehensive verification report

**Tools**: All tools (full pipeline access)

**Example**:

```
You: "Verify the new group management feature is ready for deployment"

Claude: [Activates pipeline-verifier skill]
        "I'll validate this across backend, frontend, UI/UX, and tests..."
```

---

### 5. 🧮 vector-similarity-ops

**When It Activates**: "Configure deduplication", "How does similarity detection work?", "Debug duplicate detection"

**What It Does**:

- Expert in Jaccard, Levenshtein, Cosine algorithms
- Validates fingerprinting and content-addressable storage
- Creates DUP_OF and SIMILAR_TO edges
- Optimizes similarity thresholds
- Tests deduplication with chat-import MCP tools

**Tools**: Read, Write, Edit, Grep, keimenon-database MCP tools (read-only)

**Example**:

```
You: "Why are these messages marked as duplicates?"

Claude: [Activates vector-similarity-ops skill]
        "Let me analyze the similarity scores and algorithm configuration..."
```

---

### 6. 🛠️ mcp-integration-expert

**When It Activates**: "Query the database", "Test this API endpoint", "Run the E2E tests"

**What It Does**:

- Orchestrates all 6 MCP servers
- Database queries (query_nodes, query_edges, get_stats)
- Documentation search (search_docs, list_todos)
- API testing (test_endpoint, test_crud, test_multi_tenant)
- Chat import testing (import_test_dataset, verify_results)
- Settings/CRM (list_users, get_account_details)
- E2E test execution (pw_run, pw_listTests)

**Tools**: All MCP tools

**Example**:

```
You: "Show me all ChatThread nodes created in the last 7 days"

Claude: [Activates mcp-integration-expert skill]
        "I'll query the database using the keimenon-database MCP server..."
```

---

### 7. 🔬 research-specialist

**When It Activates**: "Research OAuth patterns", "What are the latest best practices for...", "Compare libraries"

**What It Does**:

- Web research using WebFetch and WebSearch
- Documentation search across project
- Technology evaluation and comparison
- Architecture decision research
- Security-isolated (no code execution)

**Tools**: Read, Grep, Glob, WebFetch, WebSearch, keimenon-docs MCP tools

**Context**: Forked (isolated execution)

**Example**:

```
You: "Research React Server Components patterns for our dashboard"

Claude: [Activates research-specialist skill]
        "I'll research RSC patterns and compare them to our current architecture..."
```

---

### 8. 🔍 autonomous-test-discoverer

**When It Activates**: "What's our test coverage?", "Find untested endpoints", "Analyze E2E coverage"

**What It Does**:

- Discovers testable endpoints and user flows
- Analyzes existing E2E test coverage
- Generates coverage matrix
- Identifies gaps in test coverage

**Tools**: Read, Glob, Grep, keimenon-database, keimenon-docs, playwright-e2e MCP tools

**Context**: Forked (isolated execution)

**Example**:

```
You: "What endpoints are missing E2E test coverage?"

Claude: [Activates autonomous-test-discoverer skill]
        "I'll analyze the API routes and existing tests to find coverage gaps..."
```

---

### 9. 🧪 autonomous-test-generator

**When It Activates**: "Generate tests for untested endpoints", "Create E2E tests with visual verification"

**What It Does**:

- Generates Playwright E2E tests with visual verification
- Uses live browser inspection for accurate locators
- Creates tests for untested endpoints
- Follows project test patterns

**Tools**: Read, Write, Edit, Glob, Grep, keimenon-database, keimenon-api-testing, playwright-e2e, playwright-test MCP tools

**Context**: Forked (isolated execution)

**Example**:

```
You: "Generate E2E tests for the new user profile endpoint"

Claude: [Activates autonomous-test-generator skill]
        "I'll inspect the endpoint and create comprehensive E2E tests..."
```

---

### 10. 🩹 autonomous-test-healer

**When It Activates**: "Fix failing E2E tests", "Debug test failures", "Heal broken tests"

**What It Does**:

- Detects and fixes failing E2E tests
- Analyzes failure screenshots and traces
- Identifies root causes of failures
- Applies fixes and verifies stability

**Tools**: Read, Edit, Grep, playwright-e2e, visual-feedback, keimenon-api-testing MCP tools

**Context**: Forked (isolated execution)

**Example**:

```
You: "The login E2E test is failing, can you fix it?"

Claude: [Activates autonomous-test-healer skill]
        "I'll analyze the failure screenshots and traces to identify the issue..."
```

---

### 11. 🎯 autonomous-test-runner

**When It Activates**: "Run autonomous testing", "Achieve target test coverage", "Orchestrate test lifecycle"

**What It Does**:

- Master orchestrator for autonomous testing lifecycle
- Coordinates discovery, generation, execution, and healing
- Achieves target coverage with minimal intervention
- Tracks progress and reports results

**Tools**: Read, Write, Edit, Glob, Grep, Task, playwright-e2e, keimenon-database MCP tools

**Context**: Forked (isolated execution)

**Example**:

```
You: "Run autonomous testing to reach 80% coverage"

Claude: [Activates autonomous-test-runner skill]
        "I'll orchestrate the full testing lifecycle to achieve target coverage..."
```

---

### 12. 🔒 security-auditor

**When It Activates**: "Run security audit", "Check for vulnerabilities", "OWASP compliance"

**What It Does**:

- OWASP Top 10 vulnerability scanning
- Multi-tenant security validation
- Pre-deployment security checks
- Authentication/authorization review

**Tools**: Read, Grep, Glob, keimenon-database, keimenon-api-testing MCP tools

**Example**:

```
You: "Run a security audit before deployment"

Claude: [Activates security-auditor skill]
        "I'll check for OWASP Top 10 vulnerabilities and multi-tenant isolation..."
```

---

## How to Use Skills

### Automatic Activation (Recommended)

Simply describe what you want to do. Claude will automatically activate the relevant skill.

**Examples**:

```
✅ "Validate this node structure"
   → Activates graph-schema-validator

✅ "Review my code changes"
   → Activates code-review-enforcer

✅ "Generate tests for this component"
   → Activates e2e-test-generator

✅ "Verify this feature is ready to deploy"
   → Activates pipeline-verifier

✅ "Debug why duplicates aren't being detected"
   → Activates vector-similarity-ops

✅ "Query the database for all Source nodes"
   → Activates mcp-integration-expert
```

### Explicit Invocation (Optional)

You can explicitly request a skill if needed:

```
You: "Use the graph-schema-validator skill to check this node"
You: "Activate code-review-enforcer and review my PR"
You: "Run pipeline-verifier on the authentication feature"
```

---

## Skill Workflows

### Workflow 1: Implementing a New Feature

```
1. You: "I'm implementing user profile management. Help me plan this."
   → Claude uses pipeline-verifier to understand feature scope

2. You: "Review my API endpoint implementation"
   → Claude uses code-review-enforcer to check code quality

3. You: "Validate the node/edge structure I'm creating"
   → Claude uses graph-schema-validator to ensure correctness

4. You: "Generate E2E tests for this feature"
   → Claude uses e2e-test-generator to create comprehensive tests

5. You: "Verify everything works end-to-end"
   → Claude uses pipeline-verifier to validate all layers

6. You: "Run the smoke tests"
   → Claude uses mcp-integration-expert to execute Playwright tests
```

### Workflow 2: Debugging an Issue

```
1. You: "Why are my messages showing as duplicates?"
   → Claude uses vector-similarity-ops to analyze similarity detection

2. You: "Show me the DUP_OF edges in the database"
   → Claude uses mcp-integration-expert to query database

3. You: "Search docs for deduplication configuration"
   → Claude uses mcp-integration-expert to search documentation

4. You: "Validate my fix"
   → Claude uses code-review-enforcer to review changes
```

### Workflow 3: Pre-Deployment Checklist

```
1. You: "Run full validation before I deploy"
   → Claude uses pipeline-verifier for complete validation

2. You: "Check for critical TODOs"
   → Claude uses mcp-integration-expert to list XXX/BUG comments

3. You: "Run smoke tests in all browsers"
   → Claude uses mcp-integration-expert to run Playwright tests

4. You: "Verify multi-tenant isolation"
   → Claude uses mcp-integration-expert to test isolation

5. You: "Generate deployment readiness report"
   → Claude uses pipeline-verifier to create report
```

---

## Skill Combinations

Skills work together seamlessly:

### Example 1: Feature Implementation + Validation

```
You: "Implement chat import with deduplication, then validate it"

Claude:
1. [code-review-enforcer] Reviews existing import code patterns
2. [vector-similarity-ops] Explains deduplication algorithms
3. [graph-schema-validator] Validates node/edge structures
4. [e2e-test-generator] Creates tests for import feature
5. [pipeline-verifier] Validates complete implementation
6. [mcp-integration-expert] Runs tests and checks database
```

### Example 2: Code Review + Testing

```
You: "Review my PR and ensure test coverage"

Claude:
1. [code-review-enforcer] Reviews code quality and patterns
2. [graph-schema-validator] Checks database operations
3. [e2e-test-generator] Identifies missing test coverage
4. [mcp-integration-expert] Runs existing tests
5. [pipeline-verifier] Validates end-to-end functionality
```

---

## Skills vs. MCP Servers

**Skills** = AI capabilities with domain knowledge
**MCP Servers** = Tools that provide data/actions

Skills _use_ MCP servers as tools:

| Skill                      | Primary MCP Servers Used                              |
| -------------------------- | ----------------------------------------------------- |
| graph-schema-validator     | keimenon-database                                     |
| code-review-enforcer       | keimenon-docs, keimenon-database                      |
| e2e-test-generator         | playwright-e2e                                        |
| pipeline-verifier          | ALL (orchestrates everything)                         |
| vector-similarity-ops      | keimenon-database, keimenon-chat-import               |
| mcp-integration-expert     | ALL (direct MCP access)                               |
| research-specialist        | keimenon-docs (+ WebFetch/WebSearch)                  |
| autonomous-test-discoverer | keimenon-database, keimenon-docs, playwright-e2e      |
| autonomous-test-generator  | keimenon-api-testing, playwright-e2e, playwright-test |
| autonomous-test-healer     | playwright-e2e, visual-feedback                       |
| autonomous-test-runner     | playwright-e2e, keimenon-database                     |
| security-auditor           | keimenon-database, keimenon-api-testing               |

---

## Configuration

Skills are configured via `SKILL.md` files in each subdirectory:

```
.claude/skills/
├── graph-schema-validator/
│   └── SKILL.md           # Skill definition + instructions
├── code-review-enforcer/
│   └── SKILL.md
├── e2e-test-generator/
│   └── SKILL.md
├── pipeline-verifier/
│   └── SKILL.md
├── vector-similarity-ops/
│   └── SKILL.md
├── mcp-integration-expert/
│   └── SKILL.md
├── research-specialist/
│   └── SKILL.md
├── autonomous-test-discoverer/
│   └── SKILL.md
├── autonomous-test-generator/
│   └── SKILL.md
├── autonomous-test-healer/
│   └── SKILL.md
├── autonomous-test-runner/
│   └── SKILL.md
├── security-auditor/
│   └── SKILL.md
└── README.md              # This file
```

### SKILL.md Format

```yaml
---
name: skill-name
description: When to activate and what the skill does (max 1024 chars)
allowed-tools: Read, Grep, Glob  # Optional: Restrict available tools
context: fork                     # Optional: 'fork' for isolated execution
agent: Explore                    # Optional: Explore, Plan, or general-purpose
model: haiku                      # Optional: haiku, sonnet, or opus
user-invocable: true              # Optional: Allow /skill-name invocation
disable-model-invocation: false   # Optional: Prevent automatic activation
---

# Skill Name

## Purpose
[What the skill does]

## When to Activate
[Trigger conditions]

## [Detailed instructions for Claude...]
```

### Frontmatter Fields

| Field                      | Required | Description                                             |
| -------------------------- | -------- | ------------------------------------------------------- |
| `name`                     | Yes      | Unique skill identifier (kebab-case)                    |
| `description`              | Yes      | When to activate, max 1024 chars. Shows in skill list   |
| `allowed-tools`            | No       | Comma-separated list of tools skill can use             |
| `context`                  | No       | `fork` = isolated session, default = shared context     |
| `agent`                    | No       | Subagent type: `Explore`, `Plan`, or `general-purpose`  |
| `model`                    | No       | Override model: `haiku`, `sonnet`, or `opus`            |
| `user-invocable`           | No       | Allow explicit `/skill-name` invocation (default: true) |
| `disable-model-invocation` | No       | Prevent auto-activation (default: false)                |

---

## Best Practices

### 1. Let Skills Activate Automatically

```
✅ GOOD: "Validate this database operation"
         (Claude activates graph-schema-validator automatically)

❌ BAD:  "Use tool X to run command Y to check Z"
         (Too prescriptive, doesn't leverage skills)
```

### 2. Be Specific About Your Goal

```
✅ GOOD: "Review my authentication code for security issues"
         (Clear goal, code-review-enforcer activates)

⚠️  OKAY: "Check my code"
         (Vague, but skill will still activate)
```

### 3. Trust the Skill Orchestration

```
✅ GOOD: "Verify this feature is production-ready"
         (pipeline-verifier orchestrates other skills automatically)

❌ BAD:  "First validate schema, then review code, then generate tests, then..."
         (Micromanaging, let pipeline-verifier handle orchestration)
```

### 4. Ask for Explanations

```
✅ GOOD: "Why did you mark this as a duplicate?"
         (vector-similarity-ops explains the algorithm and threshold)

✅ GOOD: "Explain what CLAUDE.md rules this violates"
         (code-review-enforcer references specific sections)
```

---

## Troubleshooting

### Issue: Skill Not Activating

**Possible Causes**:

- Description too vague (be more specific)
- Task doesn't match skill description
- Skill name typo in SKILL.md

**Solution**: Explicitly request the skill or rephrase your request

### Issue: Skill Lacks Context

**Possible Causes**:

- Missing reference files
- Schemas not created yet (ai_context/schemas/)
- Documentation out of date

**Solution**: Provide context or point skill to relevant files

### Issue: Skill Uses Wrong Tools

**Possible Causes**:

- `allowed-tools` restriction too strict
- Tool not available in environment

**Solution**: Check SKILL.md allowed-tools, adjust if needed

---

## Testing Skills

### Test Individual Skills

```
You: "Test the graph-schema-validator skill by validating this node"
[Provide a sample node structure]

You: "Test code-review-enforcer by reviewing this file"
[Provide file path]
```

### Test Skill Orchestration

```
You: "Run a complete feature validation using pipeline-verifier"
[Claude orchestrates all skills automatically]
```

### Verify MCP Integration

```
You: "Use mcp-integration-expert to query the database"
[Verify MCP server connectivity]
```

---

## Extending Skills

### Adding a New Skill

1. **Create directory**: `.claude/skills/new-skill-name/`
2. **Create SKILL.md** with frontmatter + instructions
3. **Test activation**: Try triggering the skill
4. **Update this README**: Document the new skill

### Modifying Existing Skills

1. **Edit SKILL.md**: Update description or instructions
2. **Test changes**: Verify skill still activates correctly
3. **Update README**: Reflect changes in documentation

---

## Related Documentation

- [Claude Skills Official Docs](https://docs.claude.com/en/docs/claude-code/skills.md) - Official skill documentation
- [.mcp/README.md](../../.mcp/README.md) - MCP servers overview
- [CLAUDE.md](../../CLAUDE.md) - Operating guide for Keimenon
- [docs/architecture/OVERVIEW.md](../../docs/architecture/OVERVIEW.md) - System architecture

---

## Support

### Getting Help

- **Skill not working**: Check skill's SKILL.md file for requirements
- **MCP server error**: Check [.mcp/README.md](../../.mcp/README.md) troubleshooting
- **General questions**: Ask Claude to explain the skill system

### Debugging Skills

```
You: "Which skill are you using right now?"
You: "Why did you choose this skill?"
You: "Show me the skill's instructions"
```

---

**Last Updated**: 2026-01-26
**Skills Version**: 2.0
**Compatible with**: Claude Code, Claude Desktop, VSCode with Claude extension

---

## Quick Reference

| Task                              | Skill to Use               |
| --------------------------------- | -------------------------- |
| Validate node/edge structure      | graph-schema-validator     |
| Review code changes               | code-review-enforcer       |
| Generate E2E tests                | e2e-test-generator         |
| Validate complete feature         | pipeline-verifier          |
| Debug deduplication               | vector-similarity-ops      |
| Query database                    | mcp-integration-expert     |
| Search documentation              | mcp-integration-expert     |
| Run tests                         | mcp-integration-expert     |
| Test API endpoints                | mcp-integration-expert     |
| Manage users/accounts             | mcp-integration-expert     |
| Research technologies/patterns    | research-specialist        |
| Find test coverage gaps           | autonomous-test-discoverer |
| Generate tests with visual verify | autonomous-test-generator  |
| Fix failing E2E tests             | autonomous-test-healer     |
| Full autonomous testing           | autonomous-test-runner     |
| Security audit                    | security-auditor           |

---

**Happy coding with Claude Skills!**
