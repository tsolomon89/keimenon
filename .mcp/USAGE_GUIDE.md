# MCP Usage Guide - Keimenon

**Complete guide to using Model Context Protocol servers for AI-assisted development**

## Quick Start

### 1. Installation

Install dependencies for the MCP servers you want to use:

```bash
# Database server
cd .mcp/servers/database
npm install

# Documentation server
cd .mcp/servers/docs
npm install
```

### 2. Verify Setup

The servers should be automatically discovered by VSCode 1.102+ or Claude Desktop. Verify:

1. Open VSCode Command Palette (`Ctrl+Shift+P`)
2. Run "MCP: List Servers"
3. You should see `keimenon-database` and `keimenon-docs`

### 3. Test the Servers

Open Claude Code in VSCode and try these test prompts:

```
"Use the database MCP to show me statistics about the current database"

"Search the documentation for information about authentication"

"List all TODO comments in the apps/api directory"
```

## Tool Reference

### Database Server Tools

#### `query_nodes` - Query Nodes

Search for nodes with various filters.

**Example Prompts**:

```
"Show me all ChatThread nodes created in the last 7 days"

"Query the database for Source nodes belonging to account acc_123"

"Find the 10 most recently created Message nodes"

"Show me all Group nodes with their properties"
```

**Parameters**:

- `kind`: Node type (ChatThread, Message, Source, CodeBlock, Group, Board, etc.)
- `account_id`: Filter by account
- `created_after`: Unix timestamp (ms)
- `created_before`: Unix timestamp (ms)
- `limit`: Max results (default: 50, max: 1000)

**Example Direct Call**:

```json
{
  "name": "query_nodes",
  "arguments": {
    "kind": "ChatThread",
    "created_after": 1729209600000,
    "limit": 10
  }
}
```

#### `query_edges` - Query Edges

Find relationships between nodes.

**Example Prompts**:

```
"Show me all CONTAINS edges for thread thr_abc123"

"Find all DERIVES_FROM edges pointing to message msg_xyz"

"Query edges of kind DUP_OF to see duplicate relationships"
```

**Parameters**:

- `kind`: Edge type (CONTAINS, DERIVES_FROM, DUP_OF, etc.)
- `from_id`: Source node ID
- `to_id`: Target node ID
- `limit`: Max results (default: 50, max: 1000)

#### `inspect_schema` - Inspect Schema

View database structure.

**Example Prompts**:

```
"Show me the schema for the nodes table"

"Inspect the database schema for all tables"

"What indexes exist on the edges table?"

"Show me the foreign key constraints"
```

**Parameters**:

- `table_name`: Specific table (optional - shows all if omitted)

#### `get_stats` - Database Statistics

Get comprehensive database metrics.

**Example Prompts**:

```
"Show me database statistics"

"Get detailed stats including account breakdown"

"How many nodes and edges are in the database?"

"What's the distribution of node types?"
```

**Parameters**:

- `detailed`: Include per-account stats (default: false)

#### `search_content` - Full-Text Search

Search node content using FTS5.

**Example Prompts**:

```
"Search the database for content containing 'authentication'"

"Find all nodes mentioning 'JWT token'"

"Full-text search for 'duplicate detection algorithm'"
```

**Parameters**:

- `query`: FTS5 search query
- `limit`: Max results (default: 20, max: 100)

### Documentation Server Tools

#### `search_docs` - Search Documentation

Full-text search across all markdown files.

**Example Prompts**:

```
"Search the docs for 'multi-tenant' and show me 5 results with context"

"Find documentation about the import pipeline"

"Search for references to 'DatabaseClient' in the docs"

"Look for authentication documentation"
```

**Parameters**:

- `query`: Search term (case-insensitive)
- `limit`: Max results (default: 10, max: 50)
- `context_lines`: Lines of context around matches (default: 3)

**Example Output**:

```json
{
  "query": "authentication",
  "total_files": 5,
  "results": [
    {
      "file": "docs/architecture/AUTHENTICATION.md",
      "match_count": 23,
      "matches": [
        {
          "line_number": 42,
          "line": "## JWT Authentication",
          "context": "..."
        }
      ]
    }
  ]
}
```

#### `find_related` - Find Related Docs

Discover related documentation by topic or file.

**Example Prompts**:

```
"Find docs related to database architecture"

"What documentation is related to the API design guide?"

"Show me files related to 'import workflow'"
```

**Parameters**:

- `topic`: Topic to search for
- `file_path`: File to find related docs for (alternative)
- `limit`: Max results (default: 10)

#### `list_todos` - Extract TODOs

Find all TODO/FIXME/HACK comments in code.

**Example Prompts**:

```
"List all TODO comments in the project"

"Show me FIXME comments in the apps/api directory"

"Find all HACK comments that need attention"

"What are the high-priority TODOs (marked as XXX)?"
```

**Parameters**:

- `type`: Comment type (TODO, FIXME, HACK, NOTE, BUG, XXX, all)
- `path`: Directory/file to search (optional - searches all)
- `limit`: Max results (default: 50, max: 200)

**Example Output**:

```json
{
  "type": "TODO",
  "total_found": 127,
  "results": [
    {
      "type": "TODO",
      "file": "apps/api/src/routes/auth.ts",
      "line": 42,
      "comment": "Add refresh token support",
      "context": "// TODO: Add refresh token support"
    }
  ]
}
```

#### `get_architecture_info` - Architecture Info

Query specific architecture documentation.

**Example Prompts**:

```
"Show me the architecture overview"

"Get information about the database architecture"

"What's in the API design documentation?"

"List all feature documentation files"
```

**Parameters**:

- `category`: Architecture section (overview, database, api, authentication, features, all)

#### `read_doc` - Read Documentation File

Read a specific documentation file.

**Example Prompts**:

```
"Read the OVERVIEW.md file from docs/architecture"

"Show me the contents of README.md"

"Read the authentication guide"
```

**Parameters**:

- `path`: Relative path to file (e.g., "docs/architecture/OVERVIEW.md")

## Common Workflows

### Workflow 1: Understanding a Feature

```
1. "Search docs for 'chat import' to find relevant documentation"

2. "Read the docs/features/CHAT_IMPORT.md file"

3. "List TODOs related to import in apps/api/src/routes/import-enhanced.ts"

4. "Query the database for ChatThread nodes to see import results"
```

### Workflow 2: Debugging Database Issues

```
1. "Get database statistics to see current state"

2. "Inspect schema for the nodes table"

3. "Query nodes created in the last hour with errors"

4. "Search docs for 'troubleshooting database' issues"
```

### Workflow 3: Code Refactoring

```
1. "List all TODO comments in apps/api directory"

2. "Search docs for 'DatabaseClient' usage patterns"

3. "Query edges to understand relationships"

4. "Find related docs about database architecture"
```

### Workflow 4: Onboarding / Learning Codebase

```
1. "Show me the architecture overview"

2. "Get all architecture documentation (category: all)"

3. "Search docs for 'design principles'"

4. "List all feature documentation files"

5. "Find TODOs to understand ongoing work"
```

### Workflow 5: Testing Import Pipeline

```
1. "Search docs for 'test datasets' to find available samples"

2. "Get database stats before import"

3. "Query nodes with kind ChatThread after import"

4. "Query edges with kind CONTAINS to verify relationships"

5. "Search content for specific imported terms"
```

## Advanced Usage

### Combining Multiple Tools

You can chain tool calls for complex queries:

**Example: "Analyze import health"**

```
1. Get stats to see total imports
2. Query ChatThread nodes from last 24 hours
3. Query CONTAINS edges to verify structure
4. Search docs for expected import behavior
5. List TODOs related to import bugs
```

### Using FTS5 Query Syntax

The `search_content` tool supports advanced FTS5 syntax:

```
"Search for nodes with 'auth AND token' (both required)"

"Search for 'database OR storage' (either term)"

"Search for 'NEAR(model context, 5)' (terms within 5 words)"

"Search with prefix: 'authen*' (matches authentication, authenticated, etc.)"
```

### Filtering by Account

For multi-tenant testing:

```
"Query nodes for account_id acc_test123"

"Get detailed stats with account breakdown"

"Find all edges for nodes in account acc_prod456"
```

## Tips & Best Practices

### 1. Be Specific in Prompts

❌ Bad: "Show me stuff"
✅ Good: "Query ChatThread nodes created in the last 7 days"

### 2. Use Limits Wisely

❌ Bad: "Query all nodes" (might return thousands)
✅ Good: "Query recent 50 nodes of kind Message"

### 3. Leverage Context

The AI remembers context within a conversation:

```
"Get database stats"
"Now show me nodes of the most common type"  ← Refers to stats
```

### 4. Check Docs First

Before asking "how does X work?":

```
"Search docs for 'X' to understand implementation"
```

### 5. Verify with Multiple Tools

Cross-reference information:

```
"Search docs for 'duplicate detection algorithm'"
"Query edges with kind DUP_OF to see it in action"
```

## Troubleshooting

### Server Not Responding

**Symptoms**: Tool calls fail or timeout

**Solutions**:

1. Check VSCode Output → MCP Servers for errors
2. Restart VSCode: `Developer: Reload Window`
3. Verify Node.js version: `node --version` (need 18+)
4. Reinstall dependencies in `.mcp/servers/{name}/`

### Database Path Issues

**Symptoms**: "Database not found" error

**Solutions**:

1. Check `~/.keimenon/keimenon.db` exists
2. Start API server once to initialize: `cd apps/api && npm run dev`
3. Verify environment variable in `.vscode/settings.json`

### Permission Errors

**Symptoms**: "EACCES" or "permission denied"

**Solutions**:

```bash
# Fix database permissions
chmod 644 ~/.keimenon/keimenon.db

# Fix server script permissions
chmod +x .mcp/servers/*/index.js
```

### Search Returns No Results

**Symptoms**: Docs search finds nothing

**Solutions**:

1. Check search term spelling
2. Try broader terms: "auth" instead of "authentication system"
3. Use partial matches: "datab\*" for database-related
4. Verify file exists in cache (restart docs server)

## Performance Considerations

### Database Queries

- Use `limit` to avoid large result sets
- Filter by `kind` and `account_id` for faster queries
- Index is optimized for `created_at` DESC ordering

### Documentation Search

- Search is in-memory (fast but uses RAM)
- Cache is built on server start
- Restart server to pick up new docs

### TODO Extraction

- Scans all code files (can be slow on large codebases)
- Use `path` parameter to search specific directories
- Results are not cached (fresh every time)

## Security Notes

### Read-Only Database Access

The database MCP server opens SQLite in **read-only mode**:

- ✅ Safe for queries and inspection
- ❌ Cannot modify data
- ✅ Multiple connections allowed (WAL mode)

### Local Execution Only

All MCP servers run locally:

- ✅ No data sent to cloud
- ✅ Uses local file system
- ✅ Respects gitignore
- ❌ Not accessible remotely

### Credential Safety

MCP servers do not:

- ❌ Access .env files
- ❌ Read JWT secrets
- ❌ Expose passwords
- ✅ Only read documented sources

## Examples by Role

### For Developers

```
"List all TODOs assigned to the API team"

"Query recent Message nodes to see chat import results"

"Search docs for 'DatabaseClient interface' usage"

"Inspect schema for nodes table to understand structure"
```

### For Architects

```
"Show me the complete architecture overview"

"Get detailed database statistics by account"

"Find related docs about multi-tenant design"

"Search for 'design decision' across all docs"
```

### For QA/Testers

```
"Query nodes created in test account acc_test_123"

"Search docs for 'test datasets' location"

"List all FIXME and BUG comments"

"Get stats to verify import counts"
```

### For DevOps

```
"Inspect database schema and indexes"

"Get database health metrics"

"Search docs for 'deployment' instructions"

"Find TODOs related to performance"
```

## Next Steps

1. **Install dependencies**: Run `npm install` in each server directory
2. **Test a simple query**: Try "Get database stats"
3. **Explore the docs**: Use "Search docs for 'architecture'"
4. **Find TODOs**: Run "List all TODOs" to see active work
5. **Build workflows**: Combine tools for complex tasks

## Resources

- [Main README](.mcp/README.md) - Server overview and installation
- [MCP Official Docs](https://modelcontextprotocol.io/) - Protocol specification
- [VSCode MCP Guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) - VSCode integration
- [Project Architecture](../docs/architecture/OVERVIEW.md) - System design

---

**Questions or Issues?**

1. Check [troubleshooting](#troubleshooting) section above
2. Review server logs in VSCode Output panel
3. Consult main MCP README for server details
4. File an issue in the project repository

**Last Updated**: 2025-10-19
