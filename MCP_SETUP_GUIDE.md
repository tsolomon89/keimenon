# MCP Server Setup Guide for Canvas Memory

## Status: ✅ Ready to Use

Your MCP servers are installed and ready to use with Claude Code!

## Available MCP Servers (7 Total)

### 1. canvas-database

**What it does:** Direct SQLite database access
**Tools:**

- `query_nodes` - Search nodes by type, account, date range
- `query_edges` - Find edges by kind, direction
- `inspect_schema` - View table schemas and indexes
- `get_stats` - Database statistics and health metrics
- `seed_test_data` - Create test data for development

**Resources:** schema, migrations, health

### 2. canvas-docs

**What it does:** Documentation access and search

### 3. canvas-api-testing

**What it does:** API testing and validation tools

### 4. canvas-chat-import

**What it does:** Test chat import functionality with curated datasets
**Tools:**

- `list_test_datasets` - Show available test datasets
- `get_test_dataset` - Retrieve a specific test dataset
- `import_test_dataset` - Import via API
- `verify_import_results` - Validate results
- `compare_imports` - Compare two import runs
- `generate_test_data` - Create synthetic test data
- `test_deduplication` - Test duplicate detection
- `test_code_extraction` - Test code block extraction
- `test_sources_mode` - Test message stitching

**Test Datasets:** tiny (10 msgs), small (50 msgs), medium (200 msgs), large (1000 msgs), edge-cases

### 5. canvas-settings-crm

**What it does:** Settings and CRM operations

### 6. playwright-e2e

**What it does:** Run and monitor Playwright E2E tests
**Tools:**

- `pw.listTests` - List available tests
- `pw.run` - Execute tests with filters
- `pw.lastFailures` - Get failure details
- `app.start` - Start servers
- `app.stop` - Stop servers
- `artifacts.list` - List test artifacts
- `artifacts.read` - Read artifact content
- `env.info` - Environment information

**Full docs:** See `MCP_INTEGRATION_GUIDE.md`

### 7. visual-feedback

**What it does:** Visual regression testing and screenshot comparison for E2E tests
**Tools:**

- `compare_screenshots` - Compare two screenshots with pixel-level precision
- `detect_visual_regression` - Detect visual regressions between baseline and current screenshots
- `analyze_layout` - Analyze screenshot layout for spacing and alignment issues
- `extract_element_properties` - Extract element properties from screenshot
- `capture_multi_viewport` - Capture screenshots across multiple viewports

**Configuration:**

- Threshold: 0.05-0.15 (5%-15% pixel difference tolerance)
- Performance: ~420ms per comparison (1920x1080)
- Anti-aliasing: Enabled for smooth edges
- Severity levels: none, minor, moderate, major

**Use Cases:**

- Visual regression testing across test runs
- Multi-viewport responsive testing
- Account-specific visual isolation validation
- Workflow stage visual documentation

**Full docs:** See `VISUAL_FEEDBACK_GUIDE.md`

---

## Setup for Claude Code

### Option 1: Project Scope (Automatic) ✅ ALREADY CONFIGURED

Your `.mcp.json` file is already in the project root, so **Claude Code should auto-detect all 7 servers**.

**To verify:**

1. Restart Claude Code (if running)
2. Run: `/mcp` in Claude Code
3. You should see all 7 servers listed

**No additional setup needed!**

### Option 2: User Scope (Available Everywhere)

To make these servers available in ALL your projects:

```bash
# Add each server to user scope
claude mcp add --transport stdio --scope user canvas-database -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\database\index.js

claude mcp add --transport stdio --scope user canvas-docs -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\docs\index.js

claude mcp add --transport stdio --scope user canvas-api-testing -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\api-testing\index.js

claude mcp add --transport stdio --scope user canvas-chat-import -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\chat-import\index.js

claude mcp add --transport stdio --scope user canvas-settings-crm -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\settings-crm\index.js

claude mcp add --transport stdio --scope user playwright-e2e -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\playwright-e2e\index.js

claude mcp add --transport stdio --scope user visual-feedback -- node C:\Development\Projects\ai_convo_parser\.mcp\servers\visual-feedback\index.js
```

### Option 3: Manual Configuration

If auto-detection doesn't work, you can manually configure in Claude Code's settings:

**Location:** `%APPDATA%\Claude\claude_code_config.json` (Windows)

**Add to config:**

```json
{
  "mcpServers": {
    "canvas-database": {
      "command": "node",
      "args": ["C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\database\\index.js"],
      "env": {
        "SQLITE_PATH": "${HOME}/.canvas-memory/canvas.db"
      }
    },
    "canvas-docs": {
      "command": "node",
      "args": ["C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\docs\\index.js"]
    },
    "canvas-api-testing": {
      "command": "node",
      "args": ["C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\api-testing\\index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:4001"
      }
    },
    "canvas-chat-import": {
      "command": "node",
      "args": ["C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\chat-import\\index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:4001"
      }
    },
    "canvas-settings-crm": {
      "command": "node",
      "args": ["C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\settings-crm\\index.js"],
      "env": {
        "SQLITE_PATH": "${HOME}/.canvas-memory/canvas.db"
      }
    },
    "playwright-e2e": {
      "command": "node",
      "args": [
        "C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\playwright-e2e\\index.js"
      ],
      "env": {
        "BASE_URL": "http://localhost:3000",
        "API_BASE_URL": "http://localhost:4001",
        "TEST_USER_EMAIL": "admin@admin.com",
        "TEST_USER_PASSWORD": "admin123"
      }
    },
    "visual-feedback": {
      "command": "node",
      "args": [
        "C:\\Development\\Projects\\ai_convo_parser\\.mcp\\servers\\visual-feedback\\index.js"
      ]
    }
  }
}
```

---

## Setup for VSCode (Claude Desktop)

VSCode uses **Claude Desktop**, which has a separate config file:

**Location:** `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

**Use the same JSON config as above** (just copy the entire `mcpServers` block).

After updating, **restart Claude Desktop** for changes to take effect.

---

## Testing the Setup

### Test 1: Verify Servers Are Loaded

In Claude Code, run:

```
/mcp
```

You should see all 7 servers listed with their tools.

### Test 2: Try a Simple Tool

Ask Claude:

```
Can you list available Playwright tests?
```

Claude should use the `pw.listTests` tool and show you the tests.

### Test 3: Database Query

Ask Claude:

```
Can you query the canvas database and show me the schema?
```

Claude should use the `inspect_schema` tool from canvas-database.

### Test 4: Chat Import Test

Ask Claude:

```
List available chat import test datasets
```

Claude should use `list_test_datasets` tool.

### Test 5: Visual Feedback Test

Ask Claude:

```
Compare two screenshots for visual regression
```

Claude should use the `compare_screenshots` tool from visual-feedback server.

---

## Example Workflows

### Workflow 1: Run E2E Tests and Debug

```
You: "Run the smoke tests"
Claude: [Uses pw.run, asks for approval]
You: [Approve]
Claude: [Shows results]
You: "What failed?"
Claude: [Uses pw.lastFailures]
```

### Workflow 2: Test Chat Import

```
You: "Import the tiny test dataset"
Claude: [Uses import_test_dataset]
You: "Verify the results"
Claude: [Uses verify_import_results]
```

### Workflow 3: Database Inspection

```
You: "Show me database stats"
Claude: [Uses get_stats]
You: "Query all nodes from last week"
Claude: [Uses query_nodes with date filter]
```

### Workflow 4: Visual Regression Testing

```
You: "Compare the baseline screenshot to the current one for the dashboard"
Claude: [Uses compare_screenshots, which generates diff image automatically]
You: "What's the visual difference?"
Claude: [Uses detect_visual_regression and shows severity with diff image path]
You: "Extract element properties from that screenshot"
Claude: [Uses extract_element_properties to analyze specific elements]
```

---

## Troubleshooting

### Issue: MCP servers not showing up

**Fix:**

1. Restart Claude Code/Desktop
2. Check `.mcp.json` syntax (no trailing commas)
3. Verify Node.js is in PATH: `node --version`
4. Test server manually: `node .mcp/servers/database/index.js`

### Issue: "Cannot find module" errors

**Fix:**

```bash
cd .mcp/servers/database && npm install
cd ../playwright-e2e && npm install
cd ../chat-import && npm install
# etc.
```

### Issue: Database not found

**Fix:**
Make sure `~/.canvas-memory/canvas.db` exists. The database server will create it if missing.

### Issue: API server not running

**Fix:**
Start the API server before using API-dependent tools:

```bash
npm run dev:api
```

Or use the `app.start` tool from playwright-e2e.

---

## Environment Variables

### canvas-database

- `SQLITE_PATH` - Path to canvas.db (default: `~/.canvas-memory/canvas.db`)

### canvas-api-testing, canvas-chat-import

- `API_BASE_URL` - API server URL (default: `http://localhost:4001`)

### playwright-e2e

- `BASE_URL` - Web app URL (default: `http://localhost:3000`)
- `API_BASE_URL` - API server URL (default: `http://localhost:4001`)
- `TEST_USER_EMAIL` - Test user email (default: `admin@admin.com`)
- `TEST_USER_PASSWORD` - Test user password (default: `admin123`)

---

## Security Notes

### User Approval Required

These tools require your approval before execution:

- `pw.run` (playwright-e2e)
- `app.start` (playwright-e2e)
- `app.stop` (playwright-e2e)
- `import_test_dataset` (chat-import)
- `seed_test_data` (database)

### Read-Only Tools

These tools don't require approval (safe reads):

- All query/list/inspect tools
- `artifacts.read`
- `env.info`

### Path Validation

All servers validate file paths to prevent directory traversal attacks.

---

## Next Steps

1. **Verify setup:** Run `/mcp` in Claude Code
2. **Try a test:** Ask Claude to list Playwright tests
3. **Explore capabilities:** Ask Claude what each server can do
4. **Build workflows:** Combine multiple tools for complex tasks

---

## Additional Resources

- **Playwright E2E Guide:** `MCP_INTEGRATION_GUIDE.md`
- **E2E Testing Guide:** `E2E_TESTING_GUIDE.md`
- **Visual Feedback Guide:** `VISUAL_FEEDBACK_GUIDE.md` (NEW - comprehensive developer guide)
- **Visual Feedback Integration:** `VISUAL_FEEDBACK_INTEGRATION.md` (implementation analysis)
- **Autonomous Testing:** `AUTONOMOUS_TESTING_IMPLEMENTATION.md`
- **Server Source Code:** `.mcp/servers/*/index.js`
- **Claude Code Docs:** https://docs.claude.com/en/docs/claude-code/mcp

---

**Status:** ✅ All 7 servers tested and functional
**Last Updated:** 2025-11-01
