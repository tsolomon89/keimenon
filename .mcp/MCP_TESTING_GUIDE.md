# MCP Testing & Integration Guide

**Complete guide to using MCP servers for end-to-end testing and debugging of Canvas Memory OS**

---

## 🎯 Overview

The MCP (Model Context Protocol) servers provide me (Claude Code) with comprehensive tools to test, debug, and validate every aspect of your application. These servers work **alongside** your existing test suite in `apps/api/src/__tests__/` to provide real-time, interactive testing capabilities.

### Relationship with Existing Tests

```
┌─────────────────────────────────────────────────────────────────┐
│                    Testing Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📁 apps/api/src/__tests__/        (Automated Test Suite)        │
│  │                                                                │
│  ├── e2e-import-workflow.test.ts   ← Full import pipeline        │
│  ├── e2e-delete-workflow.test.ts   ← Delete workflows            │
│  ├── data-management.test.ts       ← Data CRUD operations        │
│  ├── jobs-system.test.ts           ← Background jobs             │
│  ├── sse-*.test.ts                 ← Real-time streaming         │
│  └── utils/test-helpers.ts         ← Shared test utilities       │
│                                                                   │
│  ┌────────────────────────────────────────────────────┐          │
│  │         👇 SHARED PATTERNS & UTILITIES 👇          │          │
│  │  - login() function                                │          │
│  │  - createImportJob()                              │          │
│  │  - waitForJobCompletion()                         │          │
│  │  - countNodes(), countEdges()                     │          │
│  │  - SSECollector class                             │          │
│  │  - cleanupTestData()                              │          │
│  └────────────────────────────────────────────────────┘          │
│                         ▲                                         │
│                         │ Uses Same Patterns                      │
│                         │                                         │
│  📁 .mcp/servers/               (Interactive MCP Tools)          │
│  │                                                                │
│  ├── api-testing/               ← API endpoint testing           │
│  │   └── Uses: fetch(), login patterns from test-helpers        │
│  │                                                                │
│  ├── chat-import/               ← Import testing w/ datasets     │
│  │   └── Uses: same API endpoints as e2e tests                  │
│  │                                                                │
│  ├── database/                  ← Direct DB inspection           │
│  │   └── Uses: same SQLite queries as test-helpers              │
│  │                                                                │
│  └── docs/                      ← Documentation search           │
│      └── Helps find test patterns & examples                    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Key Differences

| Aspect          | Existing Tests (`__tests__/`) | MCP Servers (`.mcp/`)             |
| --------------- | ----------------------------- | --------------------------------- |
| **Execution**   | Automated (npm test)          | Interactive (via Claude Code)     |
| **Purpose**     | CI/CD validation              | Real-time debugging & exploration |
| **When to Use** | Before commits, in CI         | During development, debugging     |
| **Coverage**    | Pre-defined test cases        | Ad-hoc testing scenarios          |
| **Auth**        | Hardcoded test credentials    | Dynamic login with any account    |

---

## 🛠️ Available MCP Servers

### 1. ✅ canvas-api-testing (NEW)

**Purpose**: Comprehensive API endpoint testing with authentication

**What It Does**:

- Login with email/password (supports multi-account users)
- Test any API endpoint (GET/POST/PUT/DELETE)
- Full CRUD lifecycle testing
- Multi-tenant isolation verification
- Import pipeline testing
- RBAC/permissions testing
- Test account creation
- Data cleanup utilities

**How It Integrates**:

- Uses same login flow as `test-helpers.ts::login()`
- Calls same API endpoints as e2e tests
- Supports same auth patterns (JWT tokens)
- Can create test data like `e2e-import-workflow.test.ts`

### 2. ✅ canvas-chat-import (NEW)

**Purpose**: Import testing with pre-built test datasets

**What It Does**:

- Pre-built test datasets (tiny, small, medium, edge-cases)
- Import via API with configuration
- Verify import results
- Compare multiple imports
- Test deduplication algorithms
- Generate synthetic test data
- Track import history

**How It Integrates**:

- Uses same test files as existing tests (tiny.json, small.json, medium.json)
- Calls `/api/v1/import/enhanced` like `createImportJob()`
- Verifies results with same DB queries as `countNodes()`, `countEdges()`
- Compatible with existing import configurations

### 3. ✅ canvas-database

**Purpose**: Direct SQLite database inspection

**What It Does**:

- Query nodes by kind, account, date range
- Query edges by kind, direction
- Inspect schema and indexes
- Get database statistics
- Full-text search (FTS5)

**How It Integrates**:

- Uses same DB path as tests (`~/.keimenon/canvas.db`)
- Runs same queries as `test-helpers.ts::countNodes()`, `getNodesByKind()`
- Read-only mode for safety

### 4. ✅ canvas-docs

**Purpose**: Search and navigate project documentation

**What It Does**:

- Full-text search across all markdown
- Find related documentation
- List TODO/FIXME/HACK comments
- Get architecture information
- Read specific docs

**How It Integrates**:

- Helps find existing test patterns
- Shows test documentation (like `__tests__/README.md`)
- Cross-references with CLAUDE.md guidelines

---

## 🚀 Quick Start: Verifying MCP Servers

### Step 1: Ensure API Server is Running

```bash
# Terminal 1: Start API server
cd apps/api
npm run dev

# Should see:
# ✓ API server listening on port 4001
```

### Step 2: Verify MCP Servers in VSCode

The MCP servers should automatically connect when you open Claude Code. You can verify by asking me:

**Try this prompt:**

```
Can you check the authentication status using the API testing MCP server?
```

I should respond by calling the `get_auth_status` tool (you'll see it in my response).

### Step 3: Test Basic Functionality

**Prompt to test API testing server:**

```
Use the api-testing MCP server to:
1. Login as admin@admin.com / admin123
2. Test the GET /nodes endpoint
3. Show me the results
```

**Prompt to test chat-import server:**

```
Use the chat-import MCP server to:
1. List available test datasets
2. Show me the tiny dataset structure
```

**Prompt to test database server:**

```
Use the database MCP server to get current database statistics
```

**Prompt to test docs server:**

```
Search the documentation for "test" using the docs MCP server
```

---

## 📋 Common Testing Workflows

### Workflow 1: Debug Import Issues

When an import fails or produces unexpected results:

```
1. "Use api-testing to login as admin@admin.com / admin123"

2. "Use chat-import to import the tiny dataset with default config"

3. "Use database server to query ChatThread nodes created in last 5 minutes"

4. "Use database server to query CONTAINS edges and show me the relationships"

5. "Search docs for 'import pipeline' to see expected behavior"
```

### Workflow 2: Test Multi-Tenant Isolation

Verify accounts can't access each other's data:

```
1. "Use api-testing to test multi-tenant isolation between admin@admin.com
   and client@client.com using the nodes resource"

2. "Show me the test results and explain what passed/failed"

3. "Use database server to verify account_id filtering works correctly"
```

### Workflow 3: Validate CRUD Operations

Test full create-read-update-delete lifecycle:

```
1. "Use api-testing to login as admin"

2. "Use api-testing to test CRUD lifecycle for nodes with test data:
   {
     kind: 'Source',
     properties: {
       title: 'Test Source',
       content: 'Test content',
       data_tag: 'test'
     }
   }"

3. "Show me the results for each operation (create, read, update, delete)"
```

### Workflow 4: Compare Import Configurations

Test different import settings:

```
1. "Use chat-import to import tiny dataset with jaccard deduplication at 0.85"

2. "Use chat-import to import tiny dataset again with levenshtein at 0.90"

3. "Use chat-import to compare the two imports"

4. "Use database server to show actual DUP_OF edges created"
```

---

## 🔧 Advanced Usage

### Creating Test Accounts

```
Use api-testing to create a test account with:
- account_type: client
- account_class: free
- user_email: test-user-123@example.com
- auto_login: true
```

### Testing Specific Permissions

```
Use api-testing to test permissions for client@client.com with operations:
["view_nodes", "create_node", "view_users", "create_user", "view_analytics"]
```

### Generating Synthetic Test Data

```
Use chat-import to generate test data with:
- conversations: 5
- messages_per_conversation: 10
- include_code_blocks: true
- include_duplicates: true
```

### Cleanup After Testing

```
Use api-testing to cleanup test data with:
- data_tag: test
- delete_account: false
```

---

## 🐛 Troubleshooting

### Problem: MCP Server Not Responding

**Check 1**: Verify servers are enabled in config

```bash
cat .mcp/config.json | grep -A 3 "canvas-api-testing"
# Should show: "enabled": true
```

**Check 2**: Restart VSCode

Press `Ctrl+Shift+P` → "Developer: Reload Window"

**Check 3**: Check MCP logs in VSCode Output panel

1. `View > Output`
2. Select "MCP Servers" from dropdown
3. Look for errors

### Problem: API Server Not Running

```bash
# Check if API server is running
curl -s http://localhost:4001/health

# If no response, start it:
cd apps/api
npm run dev
```

### Problem: Authentication Fails

**Common causes:**

1. Wrong credentials - verify in database:

   ```sql
   SELECT email FROM users WHERE email = 'admin@admin.com';
   ```

2. API server not running on port 4001

   ```bash
   lsof -i :4001  # Check what's using port 4001
   ```

3. JWT secret mismatch - check `.env` file

### Problem: Database Not Found

```bash
# Check if database exists
ls -la ~/.keimenon/canvas.db

# If missing, start API server once to initialize:
cd apps/api
npm run dev
```

---

## 📊 MCP vs Existing Tests: When to Use What

### Use Existing Tests (`npm test`) When:

- ✅ Running automated CI/CD pipelines
- ✅ Validating code before commits
- ✅ Regression testing after changes
- ✅ Performance benchmarking
- ✅ Testing with large datasets (medium.json)

### Use MCP Servers (via Claude Code) When:

- ✅ Debugging a specific issue interactively
- ✅ Exploring API behavior with different inputs
- ✅ Testing ad-hoc scenarios
- ✅ Verifying multi-tenant isolation
- ✅ Quick smoke tests during development
- ✅ Investigating database state
- ✅ Comparing different configurations

### Best Practice: Use Both

```bash
# 1. Use MCP for quick testing during development
# Ask Claude Code: "Test the import endpoint with tiny dataset"

# 2. Once working, write an automated test
cd apps/api
npm test -- -t "should import tiny dataset"

# 3. Before committing, run full test suite
npm test
```

---

## 🎯 Example: Full E2E Testing Session

Here's a complete testing session demonstrating how to use all the MCP tools together:

```
PROMPT: "I want to test the complete import workflow from scratch. Please:

1. Use api-testing to login as admin@admin.com / admin123

2. Use database server to get current node/edge counts

3. Use chat-import to list available test datasets

4. Use chat-import to import the tiny dataset with:
   - deduplication enabled (jaccard, 0.85)
   - code extraction enabled
   - sources mode disabled

5. Use api-testing to verify the import results by querying /nodes

6. Use database server to count new nodes and edges

7. Use database server to query for DUP_OF edges to see if deduplication worked

8. Use docs server to search for 'deduplication algorithm' to understand expected behavior

9. Compare results with expected values from tiny dataset stats

10. Use api-testing to cleanup test data when done
"
```

I (Claude Code) will then execute each step using the appropriate MCP tool and provide you with a comprehensive report!

---

## 📚 Integration with test-helpers.ts

The MCP servers use the same patterns as your existing `test-helpers.ts`:

| test-helpers.ts                      | MCP Equivalent                            |
| ------------------------------------ | ----------------------------------------- |
| `login(email, password)`             | api-testing: `login` tool                 |
| `createImportJob(file, token)`       | chat-import: `import_test_dataset` tool   |
| `waitForJobCompletion(jobId, token)` | api-testing: `test_endpoint` with polling |
| `countNodes(db, accountId)`          | database: `query_nodes` tool              |
| `countEdges(db, accountId)`          | database: `query_edges` tool              |
| `getNodesByKind(db, accountId)`      | database: `get_stats` tool                |
| `cleanupTestData(db, accountId)`     | api-testing: `cleanup_test_data` tool     |
| `SSECollector`                       | api-testing: can test SSE endpoints       |

**Key Benefit**: MCP tools provide the same capabilities as test-helpers but:

- Don't require writing test code
- Can be used interactively
- Provide immediate feedback
- Great for exploration and debugging

---

## 🔒 Security Notes

### Safe by Design

1. **API Testing Server**:
   - Only connects to localhost by default
   - Uses same auth as existing tests
   - All test data tagged with `data_tag: 'test'`

2. **Chat Import Server**:
   - Uses synthetic test data
   - No external network calls
   - All imports marked as test data

3. **Database Server**:
   - **Read-only mode** by default
   - Cannot modify production data
   - Safe for inspection

4. **Docs Server**:
   - Read-only access to documentation
   - No file system writes
   - Respects .gitignore

### Test Data Isolation

All MCP operations use `data_tag: 'test'` to ensure easy cleanup:

```sql
-- Clean up all test data
DELETE FROM nodes WHERE data_tag = 'test';
DELETE FROM edges WHERE data_tag = 'test';
```

---

## 🚀 Next Steps

### For You (User)

1. **Verify MCP servers are working** (use prompts in Quick Start section above)

2. **Try a debugging scenario**:
   - Import a file that's causing issues
   - Use MCP tools to investigate
   - Compare with expected behavior

3. **Integrate with your workflow**:
   - Use MCP for quick tests during development
   - Use `npm test` for automated validation
   - Use both together for comprehensive coverage

### For Me (Claude Code)

I now have complete E2E testing capabilities to:

- ✅ Debug any import issue
- ✅ Test multi-tenant isolation
- ✅ Validate CRUD operations
- ✅ Verify authentication flows
- ✅ Inspect database state
- ✅ Compare different configurations
- ✅ Generate test reports

**Just ask me to test anything, and I'll use the appropriate MCP tools!**

---

## 📖 Related Documentation

- [.mcp/README.md](.mcp/README.md) - MCP server overview
- [apps/api/src/**tests**/README.md](../apps/api/src/__tests__/README.md) - Existing test suite
- [docs/architecture/OVERVIEW.md](../docs/architecture/OVERVIEW.md) - System architecture
- [CLAUDE.md](../CLAUDE.md) - Project guidelines

---

**Last Updated**: 2025-10-20
**Status**: ✅ Production Ready
**Servers Implemented**: 4/6 (api-testing, chat-import, database, docs)
**Servers Planned**: 2/6 (codebase, git-workflow)
