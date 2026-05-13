---
name: code-execution-orchestrator
description: Executes Python/JS code with MCP APIs for large data ops. Use for >1000 records.
---

## Purpose

Orchestrates the Code Execution MCP server to implement the 2025 "Code Execution with MCP" breakthrough pattern. Achieves up to 98.7% token savings by processing data in execution environment and returning only summaries.

## When to Use

- Database queries returning >1000 rows
- Complex data filtering and aggregation
- Multi-step data transformations across multiple MCP servers
- Performance-critical operations requiring large dataset processing

## Token Savings

| Traditional Approach                | Code Execution                        | Savings |
| ----------------------------------- | ------------------------------------- | ------- |
| Load 10K nodes (150,000 tokens)     | Execute code + summary (2,000 tokens) | 98.7%   |
| Filter 5K edges (80,000 tokens)     | Execute code + summary (1,500 tokens) | 98.1%   |
| Multi-server query (200,000 tokens) | Execute code + summary (3,000 tokens) | 98.5%   |

## How It Works

1. Agent identifies need for large data operation
2. Agent writes Python or JavaScript code
3. Code imports MCP servers as modules (keimenon_database, keimenon_docs, etc.)
4. Code executes in sandboxed environment (zero LLM tokens consumed)
5. Data is filtered, aggregated, and analyzed in execution environment
6. Only tiny summary is returned to LLM context
7. Agent uses summary to answer user query

**Key Insight**: Processing 10,000 rows costs zero LLM tokens when done in execution environment.

## Tools Available

- `mcp__code-execution__execute_python` - Execute Python with MCP module imports
- `mcp__code-execution__execute_javascript` - Execute JavaScript with MCP modules
- `mcp__code-execution__list_available_modules` - See available MCP servers

## Available MCP Modules

- `keimenon_database` (Python) / `mcp-keimenon-database` (JS) - Query nodes/edges
- `keimenon_docs` (Python) / `mcp-keimenon-docs` (JS) - Search documentation
- `keimenon_api_testing` (Python) / `mcp-keimenon-api-testing` (JS) - Test endpoints
- `keimenon_chat_import` (Python) / `mcp-keimenon-chat-import` (JS) - Import testing
- `keimenon_settings_crm` (Python) / `mcp-keimenon-settings-crm` (JS) - User/account management
- `playwright_e2e` (Python) / `mcp-playwright-e2e` (JS) - Test execution

## Example 1: Find Duplicate Nodes

**User Query**: "Find all Source nodes with duplicate fingerprints created in last 7 days"

**Traditional Approach (Token-Heavy)**:

```typescript
// Query all nodes - loads 10,000 nodes into LLM context
const nodes = await mcp__database__query_nodes({ kind: 'Source', limit: 10000 });
// Cost: 150,000 tokens
```

**Code Execution Approach (Token-Efficient)**:

```python
from keimenon_database import query_nodes
import time

# Calculate 7 days ago timestamp
timestamp_7d = int(time.time() * 1000) - (7 * 24 * 60 * 60 * 1000)

# Query all Source nodes (happens in execution env, ZERO LLM tokens)
nodes = query_nodes(kind="Source", limit=10000)

# Filter for last 7 days (in execution env)
recent = [n for n in nodes if n.get('created_at', 0) > timestamp_7d]

# Find duplicates by fingerprint (in execution env)
fingerprints = {}
for node in recent:
    fp = node.get('fingerprint')
    if fp:
        if fp not in fingerprints:
            fingerprints[fp] = []
        fingerprints[fp].append(node['id'])

# Identify actual duplicates (more than 1 node with same fingerprint)
duplicates = {fp: ids for fp, ids in fingerprints.items() if len(ids) > 1}

# Return tiny summary (this is what goes to LLM)
return {
    "total_nodes": len(nodes),
    "recent_nodes": len(recent),
    "unique_fingerprints": len(fingerprints),
    "duplicate_fingerprints": len(duplicates),
    "total_duplicate_nodes": sum(len(ids) for ids in duplicates.values()),
    "sample_duplicates": list(duplicates.items())[:3],  # Just 3 examples
    "recommendation": "Create DUP_OF edges between duplicate nodes"
}
```

**Result**: 2,000 tokens instead of 150,000 (98.7% savings)

## Example 2: Cross-Server Analysis

**User Query**: "Which Source nodes have related documentation?"

```python
from keimenon_database import query_nodes
from keimenon_docs import search_docs

# Get all Source nodes
sources = query_nodes(kind="Source", limit=1000)

# For each source, search docs (all in execution env, zero LLM tokens)
results = []
for source in sources[:50]:  # Sample 50 to avoid timeout
    docs = search_docs(query=source.get('title', ''), limit=3)
    results.append({
        "source_id": source['id'],
        "source_title": source.get('title', 'Untitled'),
        "has_docs": len(docs) > 0,
        "doc_count": len(docs)
    })

# Aggregate stats
with_docs = sum(1 for r in results if r['has_docs'])
without_docs = len(results) - with_docs

# Return summary
return {
    "sources_analyzed": len(results),
    "with_documentation": with_docs,
    "without_documentation": without_docs,
    "coverage_percentage": round((with_docs / len(results)) * 100, 2),
    "sample_results": results[:5]
}
```

## Example 3: Performance Analysis

**User Query**: "Analyze account activity distribution"

```javascript
const { query_nodes } = require('mcp-keimenon-database');

// Query all nodes
const nodes = await query_nodes({ limit: 10000 });

// Group by account
const byAccount = {};
nodes.forEach((node) => {
  const accId = node.account_id;
  if (!byAccount[accId]) {
    byAccount[accId] = { count: 0, kinds: {} };
  }
  byAccount[accId].count++;

  const kind = node.kind;
  byAccount[accId].kinds[kind] = (byAccount[accId].kinds[kind] || 0) + 1;
});

// Find outliers (accounts with >3x average activity)
const accounts = Object.keys(byAccount);
const totalNodes = nodes.length;
const avgPerAccount = totalNodes / accounts.length;

const outliers = [];
for (const [accId, data] of Object.entries(byAccount)) {
  if (data.count > avgPerAccount * 3) {
    outliers.push({
      account_id: accId,
      node_count: data.count,
      times_average: (data.count / avgPerAccount).toFixed(2),
      kinds: data.kinds,
    });
  }
}

// Return summary
return {
  total_nodes: totalNodes,
  total_accounts: accounts.length,
  average_per_account: Math.round(avgPerAccount),
  outliers: outliers.sort((a, b) => b.node_count - a.node_count),
  recommendation:
    outliers.length > 0
      ? 'Investigate high-activity accounts for potential abuse'
      : 'Activity distribution is normal',
};
```

## Best Practices

1. **Always return summaries**, not raw datasets
   - ✅ Good: `{ "total": 10000, "duplicates": 23, "sample": [...] }`
   - ❌ Bad: `[...10000 node objects...]`

2. **Use code execution for >100 records**
   - Small datasets (<100 items): Direct MCP call is fine
   - Large datasets (>100 items): Use code execution

3. **Import multiple MCP modules** for cross-server operations
   - Combine database + docs + settings in one execution

4. **Set appropriate timeouts**
   - Default: 30 seconds
   - Heavy operations: Increase to 60 seconds
   - Include in code: `timeout_ms: 60000`

5. **Handle errors gracefully**
   - Wrap code in try/catch
   - Return error details in summary
   - Don't let execution failures crash agent

## Troubleshooting

**Error: "Module not found"**

- Check `list_available_modules` for correct module names
- Python uses `keimenon_database`, JS uses `mcp-keimenon-database`

**Error: "Execution timed out"**

- Increase `timeout_ms` parameter
- Optimize code (use generators, lazy evaluation)
- Process data in batches

**Error: "Sandbox violation"**

- Remove filesystem operations (not allowed)
- Remove network requests (not allowed)
- Use only MCP module functions

## Integration with Other Skills

- **graph-schema-validator**: Validate nodes before processing
- **mcp-integration-expert**: Use for complex multi-server orchestration
- **pipeline-verifier**: Validate results after code execution

## See Also

- [Code Execution MCP Server README](.mcp/servers/code-execution/README.md)
- [Token Optimization Guide](docs/guides/TOKEN_OPTIMIZATION.md)
- [CLAUDE.md Section 15](CLAUDE.md#15-code-execution-with-mcp)

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
