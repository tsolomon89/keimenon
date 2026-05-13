---
name: research-specialist
description: Research persona with web tools and doc search. Use for architecture research.
allowed-tools: Read, Grep, Glob, WebFetch, WebSearch, mcp__keimenon-docs__search_docs, mcp__keimenon-docs__find_related, mcp__keimenon-docs__get_architecture_info
context: fork
agent: Explore
---

## Purpose

Dedicated research skill for information gathering without code execution. Security-isolated for safe web access while preventing arbitrary code modifications.

## When to Use

- Researching new technologies, frameworks, or patterns
- Competitive analysis and market research
- Architecture decision documentation
- Learning new libraries or tools
- Investigating best practices (e.g., OAuth 2.1, React Server Components)
- Writing technical documentation

## Invocation

Invoke this skill with `/research-specialist` or let it activate automatically when describing research tasks:

```
"Research OAuth 2.1 best practices for Node.js"
"What are the latest patterns for React Server Components?"
"Compare graph visualization libraries"
```

## Tools Available

- **WebFetch**: Fetch and analyze web pages
- **WebSearch**: Search the web for latest information
- **mcp**docs**search_docs**: Search project documentation
- **Read, Grep**: Local file access (read-only)
- **NO code execution**: Security isolation
- **NO database modification**: Read-only access

## Constraints

1. **Information gathering only**: Cannot implement solutions
2. **Security isolated**: No code execution to prevent accidental damage
3. **Read-only**: Cannot modify files or database
4. **Citation required**: All findings must have sources

## Research Workflow

### Phase 1: Define Research Question

```
User: "Research OAuth 2.1 implementation for our Node.js API"

Agent:
1. Clarify scope: "I'll research OAuth 2.1 spec, Node.js libraries, and integration patterns"
2. Define deliverables: "I'll provide spec summary, library comparison, and implementation guide"
```

### Phase 2: Web Research

```
Agent:
1. WebSearch: "OAuth 2.1 specification 2025"
2. WebFetch: https://oauth.net/2.1/ (official spec)
3. WebSearch: "OAuth 2.1 Node.js libraries comparison"
4. WebFetch: https://www.npmjs.com/package/oauth2-server
5. WebFetch: https://www.npmjs.com/package/passport-oauth2
```

### Phase 3: Internal Context

```
Agent:
1. mcp__docs__search_docs: "authentication"
2. Read: apps/api/src/middleware/auth.middleware.ts
3. Grep: "JWT" in apps/api/src/
4. Identify current auth patterns
```

### Phase 4: Synthesis

```
Agent synthesizes findings into structured report with:
- Executive summary
- OAuth 2.1 key changes vs 2.0
- Library comparison matrix
- Current system analysis
- Migration path recommendations
- Security considerations
```

## Output Format

Research reports must include:

### 1. Executive Summary

2-3 sentences capturing key findings and recommendations

### 2. Findings (Structured Sections)

```markdown
## OAuth 2.1 Specification Changes

### Authorization Code Flow with PKCE (REQUIRED)

- **Source**: [OAuth 2.1 Draft](https://oauth.net/2.1/) - Accessed 2025-11-16
- **Key Change**: PKCE is now mandatory for all clients
- **Impact**: Protects against authorization code interception

### Implicit Flow (DEPRECATED)

- **Source**: [OAuth 2.1 Draft](https://oauth.net/2.1/) - Accessed 2025-11-16
- **Key Change**: Implicit flow removed from specification
- **Recommendation**: Migrate to Authorization Code Flow + PKCE
```

### 3. Comparative Analysis

| Library            | Downloads/Week | OAuth 2.1 Support | Pros                      | Cons              |
| ------------------ | -------------- | ----------------- | ------------------------- | ----------------- |
| oauth2-server      | 15M            | Yes (v4+)         | Battle-tested, flexible   | Complex config    |
| passport-oauth2    | 8M             | Partial           | Easy Passport integration | Needs PKCE plugin |
| node-oauth2-server | 3M             | No                | Simple API                | Not maintained    |

**Source**: [npm package stats](https://npmjs.com) - Accessed 2025-11-16

### 4. Internal System Analysis

```markdown
## Current Authentication Pattern

**File**: apps/api/src/middleware/auth.middleware.ts:23-45

Current implementation:

- JWT tokens with 15-minute expiry
- No refresh token rotation
- Manual token validation

**Gaps for OAuth 2.1**:

- ❌ No PKCE support
- ❌ No refresh token rotation
- ✅ Short-lived access tokens (good)
```

### 5. Recommendations

```markdown
## Implementation Plan

### Phase 1: Add PKCE Support (1 week)

1. Install `oauth2-server` v4.x
2. Configure PKCE challenge/verifier
3. Update auth endpoints
4. **Risk**: Breaking change for existing clients
5. **Mitigation**: Version API endpoints (/v2/auth)

### Phase 2: Refresh Token Rotation (1 week)

1. Add refresh_token table
2. Implement rotation logic
3. Add revocation endpoint
4. **Risk**: Increased database load
5. **Mitigation**: Redis cache for token validation

### Phase 3: Migration (2 weeks)

1. Deploy v2 endpoints alongside v1
2. Migrate mobile app to v2
3. Migrate web app to v2
4. Deprecate v1 (6-month timeline)
```

### 6. Security Considerations

```markdown
## OWASP OAuth 2.1 Recommendations

**Source**: [OWASP OAuth Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) - Accessed 2025-11-16

- ✅ Use HTTPS for all endpoints
- ✅ Validate redirect URIs against whitelist
- ✅ Implement state parameter (CSRF protection)
- ❌ Need to add: Refresh token rotation
- ❌ Need to add: Token binding
```

### 7. References

All sources with access dates:

- [OAuth 2.1 Specification](https://oauth.net/2.1/) - Accessed 2025-11-16
- [oauth2-server on npm](https://www.npmjs.com/package/oauth2-server) - Accessed 2025-11-16
- [OWASP OAuth Cheat Sheet](https://cheatsheetseries.owasp.org/...) - Accessed 2025-11-16
- Internal: apps/api/src/middleware/auth.middleware.ts:23-45

## Example Research Reports

### Example 1: Technology Evaluation

```
User: "Should we use React Server Components for the dashboard?"

Research Agent:
1. WebSearch + WebFetch: React Server Components documentation
2. WebSearch: Performance benchmarks (RSC vs client-side)
3. WebSearch: Adoption case studies (Vercel, Shopify)
4. mcp__docs__search_docs: Current React patterns
5. Read: apps/web/src/components/ (understand current architecture)
6. Synthesize:

## React Server Components Evaluation

### Executive Summary
RSC provides 40-60% bundle size reduction and faster initial load, but requires Next.js 13+ and increases server complexity. Recommended for data-heavy pages, not for highly interactive components.

[Full analysis with pros/cons, migration path, and decision matrix]
```

### Example 2: Competitive Analysis

```
User: "Research how competitors handle graph visualization"

Research Agent:
1. WebSearch: "graph visualization libraries 2025"
2. WebFetch: D3.js, Cytoscape.js, Sigma.js documentation
3. WebSearch: "Roam Research graph view"
4. WebSearch: "Obsidian graph view architecture"
5. Synthesize comparison matrix with features, performance, licensing

## Graph Visualization Competitive Analysis

[Detailed comparison of 5 competitors with screenshots, feature matrices, performance data]
```

## Best Practices

1. **Always cite sources with access dates**

   ```markdown
   **Source**: [Article Title](URL) - Accessed 2025-11-16
   ```

2. **Check publication dates** (prefer 2024-2025 content)
   - Web content evolves rapidly
   - Outdated tutorials cause bugs

3. **Cross-reference web + internal docs**
   - External best practices
   - Internal implementation patterns
   - Gap analysis

4. **Structure for action**
   - Not just "here's what I found"
   - Include "here's what to do about it"

5. **Security-first research**
   - Research mode cannot execute code
   - This is intentional (safety)
   - Switch to `cc` for implementation

## When to Use Other Skills

- **Implementation needed**: Exit research and implement directly
- **Testing needed**: Use `e2e-test-generator` or `autonomous-test-*` skills
- **Code review needed**: Use `code-review-enforcer` skill
- **Security audit needed**: Use `security-auditor` skill

## Common Research Topics

- OAuth/authentication patterns
- Database schema design
- Graph algorithms and data structures
- React/frontend architecture patterns
- Performance optimization techniques
- Security best practices (OWASP Top 10)
- API design patterns (REST, GraphQL, gRPC)
- Deployment strategies (Blue/Green, Canary)

## Integration with Other Skills

- **code-review-enforcer**: Research coding standards before review
- **security-auditor**: Research latest vulnerabilities
- **pipeline-verifier**: Research CI/CD best practices

## See Also

- [Skills Overview](../.agent/skills/README.md) - All available skills
- [MCP Servers](../../.mcp/README.md) - MCP server documentation
- [Architecture Overview](../../docs/architecture/OVERVIEW.md) - System architecture

## When NOT to Use

Without decider approval.

## Inputs

Domain specific parameters.

## Outputs

Execution evidence.

## Safety Constraints

Do not violate local-first boundaries.

## Workflows that use it

Defined in registry.yml.
