# Keimenon - MCP Servers

**Model Context Protocol (MCP) integration for enhanced AI-assisted development workflows**

This directory contains MCP servers that extend Claude Code and other AI assistants with project-specific capabilities.

## What is MCP?

Model Context Protocol (MCP) is an open standard by Anthropic that enables AI assistants to connect to external data sources and tools in a standardized way. Think of it as a plugin system for AI that provides:

- **Resources**: Access to files, databases, APIs
- **Tools**: Functions AI can call to perform actions
- **Prompts**: Pre-built templates for common tasks

## Available MCP Servers

### 🗄️ Database Server (`mcp-database`)

**Purpose**: Query and inspect the local SQLite database

**Tools**:

- `query_nodes` - Search nodes by type, account, date range
- `query_edges` - Find edges by kind, direction
- `inspect_schema` - View table schemas and indexes
- `seed_test_data` - Create test data for development
- `get_stats` - Database statistics and health metrics

**Resources**:

- Schema definitions from `packages/db/src/sqlite/schema.sql`
- Migration history
- Database health metrics

**Use Cases**:

- Quickly inspect database state during development
- Test multi-tenant data isolation
- Verify import results
- Debug graph relationships

### 📚 Documentation Server (`mcp-docs`)

**Purpose**: Search and navigate project documentation

**Tools**:

- `search_docs` - Full-text search across all markdown files
- `find_related` - Find related docs by topic
- `list_todos` - Extract all TODO/FIXME comments from code
- `get_architecture_info` - Query architecture decisions

**Resources**:

- All markdown files in `docs/`, `ai_context/`
- Architecture diagrams
- API specifications

**Use Cases**:

- Find relevant documentation quickly
- Understand architectural decisions
- Track TODOs across codebase
- Onboard new developers

### 🧪 API Testing Server (`mcp-api-testing`)

**Purpose**: Test API endpoints with proper authentication

**Tools**:

- `test_endpoint` - Make authenticated API calls
- `validate_response` - Check response against Zod schemas
- `benchmark_endpoint` - Performance testing
- `test_multi_tenant` - Test data isolation

**Resources**:

- Sample API payloads
- Test account credentials
- Endpoint documentation

**Use Cases**:

- Quick endpoint testing without curl
- Verify multi-tenant isolation
- Performance benchmarking
- API contract validation

### 📥 Chat Import Server (`mcp-chat-import`)

**Purpose**: Test chat import functionality

**Tools**:

- `import_test_file` - Import test datasets
- `verify_import` - Validate import results
- `compare_imports` - Diff two import runs

**Resources**:

- Test datasets: `tiny.json`, `small.json`, `medium.json`
- Expected results for verification
- Import configurations

**Use Cases**:

- Test import pipeline changes
- Verify deduplication algorithms
- Performance testing with large files
- Regression testing

### 🔍 Codebase Analysis Server (`mcp-codebase`)

**Purpose**: Analyze code patterns and dependencies

**Tools**:

- `find_usages` - Find all usages of a symbol
- `analyze_dependencies` - Dependency graph analysis
- `find_patterns` - Search for code patterns
- `list_todos` - Extract TODO/FIXME/HACK comments

**Resources**:

- TypeScript AST
- Monorepo dependency graph
- Code metrics

**Use Cases**:

- Refactoring across monorepo
- Find all DatabaseClient implementations
- Track technical debt (TODOs)
- Dependency analysis

### 🌿 Git Workflow Server (`mcp-git-workflow`)

**Purpose**: Git operations following project conventions

**Tools**:

- `create_commit` - Conventional commits
- `create_branch` - Branch naming conventions
- `check_status` - Enhanced git status
- `suggest_commit_message` - AI-powered commit messages

**Resources**:

- Commit history
- PR templates
- Git hooks

**Use Cases**:

- Follow conventional commits
- Create properly named branches
- Generate commit messages from changes
- Ensure pre-commit hooks pass

## Installation

### VSCode (Automatic Discovery)

MCP servers are automatically discovered by VSCode 1.102+ and Claude Code.

**Prerequisites**:

- VSCode 1.102+ or Claude Desktop app
- Node.js 18+ installed

**Setup**:

1. Install dependencies for MCP servers:

```bash
cd .mcp/servers/database
npm install
cd ../docs
npm install
# ... repeat for other servers
```

2. VSCode will automatically detect the servers in this directory.

3. Verify in VSCode Command Palette:
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Run "MCP: List Servers"
   - You should see all Keimenon servers listed

### Manual Configuration

If automatic discovery doesn't work, add to `.vscode/settings.json`:

```json
{
  "chat.mcp.servers": {
    "keimenon-db": {
      "command": "node",
      "args": [".mcp/servers/database/index.js"],
      "cwd": "${workspaceFolder}"
    },
    "keimenon-docs": {
      "command": "node",
      "args": [".mcp/servers/docs/index.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

## Usage Examples

### Querying the Database

**Prompt**: "Use the database MCP server to show me all ChatThread nodes created in the last 7 days"

The AI will use the `query_nodes` tool with appropriate filters.

### Searching Documentation

**Prompt**: "Search the docs for information about authentication and RBAC"

The AI will use the `search_docs` tool to find relevant documentation.

### Testing API Endpoints

**Prompt**: "Test the /api/v1/nodes endpoint with the senior permission level"

The AI will use the `test_endpoint` tool with proper authentication.

### Importing Test Data

**Prompt**: "Import the small.json test dataset and show me the results"

The AI will use the `import_test_file` tool and verify the import.

## Development

### Creating a New MCP Server

1. Create directory in `.mcp/servers/{server-name}/`
2. Add `package.json` with MCP SDK dependency:

```json
{
  "name": "mcp-{server-name}",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0",
    "zod": "^3.25.0"
  }
}
```

3. Implement server in `index.js` or `index.ts`
4. Register tools, resources, and prompts
5. Update this README with server documentation

### Testing MCP Servers Locally

```bash
# Test database server
cd .mcp/servers/database
node index.js

# Test with MCP inspector tool (if installed)
npx @modelcontextprotocol/inspector
```

## Security Considerations

### Local-First Security

- ✅ All MCP servers run locally (no cloud access)
- ✅ Database server uses read-only mode by default
- ✅ API testing server uses isolated test accounts
- ✅ Git workflow server requires confirmation for destructive ops

### Multi-Tenant Safety

- ✅ Database queries respect account isolation
- ✅ API testing uses proper authentication
- ✅ Test data is scoped to development accounts

### Production Safety

- ⚠️ MCP servers should NOT be deployed to production
- ⚠️ Only use in development/testing environments
- ⚠️ Keep `.mcp/` directory in `.gitignore` if it contains credentials

## Troubleshooting

### Server Not Appearing in VSCode

1. Check VSCode version: `Help > About` (must be 1.102+)
2. Restart VSCode: `Developer: Reload Window`
3. Check server logs: `View > Output > MCP Servers`
4. Verify Node.js version: `node --version` (must be 18+)

### Permission Errors

```bash
# Ensure database file is accessible
ls -la ~/.keimenon/keimenon.db

# Check SQLite file permissions
chmod 644 ~/.keimenon/keimenon.db
```

### MCP Server Crashes

Check logs in VSCode Output panel:

1. `View > Output`
2. Select "MCP Servers" from dropdown
3. Look for error messages

Common issues:

- Missing dependencies: Run `npm install` in server directory
- Database locked: Close other connections to SQLite
- Port conflicts: Check if another server is using the port

## Community MCP Servers

In addition to project-specific servers, the following community MCP servers are configured:

### 🎨 Material UI (`mui`)

**Purpose**: Official MUI MCP server for Material Design components

**Source**: [@mui/mcp](https://www.npmjs.com/package/@mui/mcp)

**Tools**:

- Access Material UI component documentation
- Get theming and styling guidance
- Search component APIs and examples

**Use Cases**:

- Building UI components with MUI
- Understanding Material Design patterns
- Theming and customization

### 🚀 Vercel (`vercel`)

**Purpose**: Official Vercel MCP server for deployments and AI SDK

**Source**: [@vercel/mcp](https://vercel.com/docs/mcp/vercel-mcp)

**Tools**:

- Search Vercel AI SDK documentation
- Manage deployments and projects
- Access team and project settings

**Use Cases**:

- Deploying applications to Vercel
- Using AI SDK features
- Managing infrastructure

### 📐 Lean 4 (`lean-lsp`)

**Purpose**: Lean theorem prover via Language Server Protocol

**Source**: [lean-lsp-mcp](https://github.com/oOo0oOo/lean-lsp-mcp)

**Tools**:

- Access diagnostics and goal states
- Get term information and hover documentation
- Search theorems via LeanSearch, Loogle, Lean Finder

**Use Cases**:

- Formal verification and theorem proving
- Writing mathematical proofs in Lean 4
- Learning dependent type theory

### 🔬 Coq/Rocq (`coq-rocq`)

**Purpose**: Coq proof assistant for formal verification

**Source**: [mcp-rocq](https://mcp.so/server/mcp-rocq)

**Tools**:

- Automated dependent type checking
- Inductive type definitions
- Property proving with tactics

**Use Cases**:

- Formal software verification
- Writing certified programs
- Mathematical proof development

---

## Related Documentation

- [MCP Official Docs](https://modelcontextprotocol.io/)
- [Keimenon Architecture](../docs/architecture/OVERVIEW.md)
- [API Documentation](../docs/architecture/API_DESIGN.md)
- [Database Schema](../packages/db/src/sqlite/schema.sql)

## Contributing

When adding new MCP servers:

1. Follow the directory structure: `.mcp/servers/{name}/`
2. Document all tools, resources, and prompts
3. Add usage examples to this README
4. Test with Claude Code before committing
5. Consider security implications

## Support

For issues with MCP servers:

1. Check troubleshooting section above
2. Review MCP server logs in VSCode Output
3. Consult [MCP official documentation](https://modelcontextprotocol.io/)
4. File issue in project repository

---

**Last Updated**: 2026-01-27
**MCP SDK Version**: 1.25.0+
**Compatible with**: VSCode 1.102+, Claude Desktop, Claude Code
**Community Servers**: mui, vercel, lean-lsp, coq-rocq
