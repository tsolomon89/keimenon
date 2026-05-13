---
name: mcp-integration-expert
description: Expert in using project's 6 MCP servers (keimenon-database, keimenon-docs, keimenon-api-testing, keimenon-chat-import, keimenon-settings-crm, playwright-e2e). Orchestrates multi-server workflows for testing, validation, and debugging. Use when needing to query database, search docs, test APIs, or run E2E tests.
---

---

**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):

- **Context Consolidation**: Automatic, not optional (Section 13.0)
- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)
- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)
- **Full-Scope Traversal**: Address all layers (Section 13.3)
- **Recursive Intelligence**: Enrich system with every run (Section 13.4)

---

# MCP Integration Expert

## Purpose

Master of the Keimenon MCP (Model Context Protocol) server ecosystem:

- **keimenon-database**: Query nodes/edges, inspect schema, get stats
- **keimenon-docs**: Search documentation, find TODOs, get architecture info
- **keimenon-api-testing**: Test endpoints, validate responses, check multi-tenant isolation
- **keimenon-chat-import**: Import test datasets, verify results, compare imports
- **keimenon-settings-crm**: Manage users/accounts, query memberships
- **playwright-e2e**: List/run tests, check failures, get artifacts

## When to Activate

This skill activates when you need to:

- Query the database without writing SQL
- Search project documentation quickly
- Test API endpoints with authentication
- Import test data for development
- Manage test accounts and users
- Run E2E tests and analyze results
- Orchestrate multi-server workflows
- Debug complex issues spanning multiple systems

## Available MCP Servers

### 1. Keimenon Database Server (`keimenon-database`)

**Purpose**: Direct database access for querying and inspection

#### Tools

**query_nodes** - Find nodes by type, account, date range

```typescript
mcp__keimenon -
  database__query_nodes({
    kind: 'Source', // Optional: Filter by node kind
    account_id: 'acc_xyz789', // Optional: Filter by account
    created_after: 1704067200000, // Optional: Unix timestamp (ms)
    created_before: 1735689600000, // Optional: Unix timestamp (ms)
    limit: 50, // Optional: Max results (default 50, max 1000)
    data_tag: 'test', // Optional: 'test' | 'real' | 'automated' | 'manual'
  });
```

**query_edges** - Find edges by kind, direction

```typescript
mcp__keimenon -
  database__query_edges({
    kind: 'CONTAINS', // Optional: Edge kind to filter
    from_id: 'grp_abc123', // Optional: Source node ID
    to_id: 'src_xyz789', // Optional: Target node ID
    limit: 50, // Optional: Max results (default 50, max 1000)
  });
```

**inspect_schema** - View database schema

```typescript
mcp__keimenon -
  database__inspect_schema({
    table_name: 'nodes', // Optional: 'nodes' | 'edges' | 'accounts' | 'users'
    // Omit to get all tables
  });
```

**get_stats** - Database statistics

```typescript
mcp__keimenon -
  database__get_stats({
    detailed: true, // Optional: Include per-account breakdown
  });
```

**search_content** - Full-text search using FTS5

```typescript
mcp__keimenon -
  database__search_content({
    query: 'machine learning', // Search query (FTS5 syntax supported)
    limit: 20, // Optional: Max results (default 20, max 100)
  });
```

#### Common Workflows

**Debug Graph Structure**:

```typescript
// 1. Get all nodes in a conversation
const threads =
  (await mcp__keimenon) -
  database__query_nodes({
    kind: 'ChatThread',
    limit: 5,
  });

// 2. Get messages in a thread
const messages =
  (await mcp__keimenon) -
  database__query_edges({
    kind: 'CONTAINS',
    from_id: threads[0].id,
  });

// 3. Find duplicates
const duplicates =
  (await mcp__keimenon) -
  database__query_edges({
    kind: 'DUP_OF',
    limit: 100,
  });
```

**Verify Import Results**:

```typescript
// After import, check what was created
const stats = (await mcp__keimenon) - database__get_stats({ detailed: true });

// Search for specific content
const results =
  (await mcp__keimenon) -
  database__search_content({
    query: 'imported content',
    limit: 10,
  });
```

---

### 2. Keimenon Docs Server (`keimenon-docs`)

**Purpose**: Search and navigate project documentation

#### Tools

**search_docs** - Full-text search across markdown files

```typescript
mcp__keimenon -
  docs__search_docs({
    query: 'authentication RBAC', // Search query (case-insensitive)
    context_lines: 3, // Optional: Lines of context (default 3)
    limit: 10, // Optional: Max results (default 10, max 50)
  });
```

**find_related** - Find related documentation

```typescript
mcp__keimenon -
  docs__find_related({
    topic: 'database', // Optional: Topic to search (alternative to file_path)
    file_path: 'apps/api/src/routes/auth.ts', // Optional: File to find related docs
    limit: 10, // Optional: Max results (default 10)
  });
```

**list_todos** - Extract TODO/FIXME/HACK comments

```typescript
mcp__keimenon -
  docs__list_todos({
    path: 'apps/api/src/routes', // Optional: Specific directory/file
    type: 'TODO', // Optional: 'TODO' | 'FIXME' | 'HACK' | 'NOTE' | 'BUG' | 'XXX' | 'all'
    limit: 50, // Optional: Max results (default 50, max 200)
  });
```

**get_architecture_info** - Query architecture decisions

```typescript
mcp__keimenon -
  docs__get_architecture_info({
    category: 'database', // Optional: 'overview' | 'database' | 'api' | 'authentication' | 'features' | 'all'
  });
```

**read_doc** - Read specific documentation file

```typescript
mcp__keimenon -
  docs__read_doc({
    path: 'docs/architecture/OVERVIEW.md', // Relative path from project root
  });
```

#### Common Workflows

**Research Feature Implementation**:

```typescript
// 1. Search for related docs
const docs =
  (await mcp__keimenon) -
  docs__search_docs({
    query: 'chat import deduplication',
    limit: 5,
  });

// 2. Find related architecture info
const arch =
  (await mcp__keimenon) -
  docs__get_architecture_info({
    category: 'features',
  });

// 3. Check for TODOs in the area
const todos =
  (await mcp__keimenon) -
  docs__list_todos({
    path: 'apps/api/src/routes/import-enhanced.ts',
    type: 'all',
  });
```

**Onboarding / Understanding Codebase**:

```typescript
// 1. Start with overview
const overview =
  (await mcp__keimenon) -
  docs__read_doc({
    path: 'docs/architecture/OVERVIEW.md',
  });

// 2. Get architecture decisions
const arch =
  (await mcp__keimenon) -
  docs__get_architecture_info({
    category: 'all',
  });

// 3. Find TODOs to understand what needs work
const todos =
  (await mcp__keimenon) -
  docs__list_todos({
    type: 'all',
    limit: 100,
  });
```

---

### 3. Keimenon API Testing Server (`keimenon-api-testing`)

**Purpose**: Test API endpoints with authentication

#### Tools

**login** - Authenticate and get JWT token

```typescript
mcp__keimenon -
  api -
  testing__login({
    email: 'admin@admin.com',
    password: 'admin123',
    account_id: 'acc_xyz789', // Optional: Select specific account (multi-account users)
  });
```

**test_endpoint** - Make authenticated API request

```typescript
mcp__keimenon -
  api -
  testing__test_endpoint({
    path: '/nodes', // API path (e.g., '/nodes', '/accounts')
    method: 'GET', // Optional: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' (default: GET)
    body: {
      /* ... */
    }, // Optional: Request body (for POST/PUT/PATCH)
    query: { limit: 10 }, // Optional: Query parameters
    expect_status: 200, // Optional: Expected status code (for validation)
    use_auth: 'acc_xyz789', // Optional: Account ID to use for auth (defaults to current)
  });
```

**test_crud** - Test complete CRUD lifecycle

```typescript
mcp__keimenon -
  api -
  testing__test_crud({
    resource_type: 'nodes', // 'nodes' | 'edges' | 'users' | 'accounts' | 'boards' | 'groups'
    test_data: {
      // Data for creation
      kind: 'Source',
      properties: { title: 'Test Source' },
    },
    update_data: {
      // Optional: Data for update operation
      properties: { title: 'Updated Source' },
    },
  });
```

**test_multi_tenant** - Test data isolation between accounts

```typescript
mcp__keimenon -
  api -
  testing__test_multi_tenant({
    account_a_email: 'user1@test.com',
    account_a_password: 'password',
    account_b_email: 'user2@test.com',
    account_b_password: 'password',
    test_resource: 'nodes', // Optional: 'nodes' | 'edges' | 'boards' | 'groups' (default: nodes)
  });
```

**test_import** - Test chat import pipeline

```typescript
mcp__keimenon -
  api -
  testing__test_import({
    import_data: {
      /* ChatGPT/Claude format */
    },
    config: {
      // Optional: Import configuration
      deduplication: {
        enabled: true,
        algorithm: 'jaccard',
        threshold: 0.85,
      },
      code_extraction: {
        enabled: true,
      },
    },
    verify_results: true, // Optional: Verify import by querying nodes (default: true)
  });
```

**test_permissions** - Test RBAC enforcement

```typescript
mcp__keimenon -
  api -
  testing__test_permissions({
    email: 'user@test.com',
    password: 'password',
    test_operations: [
      // Operations to test
      'create_node',
      'delete_user',
      'view_analytics',
    ],
  });
```

**get_auth_status** - Get current authentication status

```typescript
mcp__keimenon - api - testing__get_auth_status();
```

**create_test_account** - Create account for testing

```typescript
mcp__keimenon -
  api -
  testing__create_test_account({
    user_email: 'testuser@example.com',
    user_password: 'testpass123', // Optional: Default 'test123456'
    account_type: 'client', // Optional: 'admin' | 'client' (default: client)
    account_class: 'free', // Optional: 'free' | 'professional' | 'business' (default: free)
    auto_login: true, // Optional: Auto login after creation (default: true)
  });
```

**cleanup_test_data** - Clean up test data

```typescript
mcp__keimenon -
  api -
  testing__cleanup_test_data({
    account_id: 'acc_xyz789', // Optional: Account to clean (defaults to current)
    data_tag: 'test', // Optional: Only delete 'test' | 'automated' (default: test)
    delete_account: false, // Optional: Also delete the account (default: false)
  });
```

#### Common Workflows

**Test New API Endpoint**:

```typescript
// 1. Login
(await mcp__keimenon) -
  api -
  testing__login({
    email: 'admin@admin.com',
    password: 'admin123',
  });

// 2. Test endpoint
const result =
  (await mcp__keimenon) -
  api -
  testing__test_endpoint({
    path: '/api/v1/nodes',
    method: 'GET',
    query: { kind: 'Source', limit: 10 },
    expect_status: 200,
  });

// 3. Test CRUD
(await mcp__keimenon) -
  api -
  testing__test_crud({
    resource_type: 'nodes',
    test_data: { kind: 'Source', properties: { title: 'Test' } },
  });
```

**Validate Multi-Tenant Isolation**:

```typescript
// Create two test accounts and verify isolation
(await mcp__keimenon) -
  api -
  testing__test_multi_tenant({
    account_a_email: 'user1@test.com',
    account_a_password: 'pass1',
    account_b_email: 'user2@test.com',
    account_b_password: 'pass2',
    test_resource: 'nodes',
  });
```

---

### 4. Keimenon Chat Import Server (`keimenon-chat-import`)

**Purpose**: Test chat import functionality

#### Tools

**list_test_datasets** - List available test datasets

```typescript
mcp__keimenon - chat - import__list_test_datasets();
// Returns: tiny, small, medium, edge-cases with statistics
```

**get_test_dataset** - Retrieve specific test dataset

```typescript
mcp__keimenon -
  chat -
  import__get_test_dataset({
    name: 'tiny', // 'tiny' | 'small' | 'medium' | 'edge-cases'
  });
```

**import_test_dataset** - Import test dataset via API

```typescript
mcp__keimenon -
  chat -
  import__import_test_dataset({
    dataset_name: 'tiny',
    auth_token: 'jwt_token', // Optional: Use mcp__keimenon-api-testing__login first
    config: {
      // Optional: Import configuration
      deduplication: {
        enabled: true,
        algorithm: 'jaccard',
        threshold: 0.85,
      },
    },
  });
```

**verify_import_results** - Verify import matched expectations

```typescript
mcp__keimenon -
  chat -
  import__verify_import_results({
    import_id: 'import_123', // From import_test_dataset
    auth_token: 'jwt_token', // Optional: JWT token
  });
```

**compare_imports** - Compare two import runs

```typescript
mcp__keimenon -
  chat -
  import__compare_imports({
    import_id_a: 'import_123',
    import_id_b: 'import_456',
  });
```

**generate_test_data** - Generate synthetic test data

```typescript
mcp__keimenon -
  chat -
  import__generate_test_data({
    conversations: 10, // Optional: Number of conversations (default: 10)
    messages_per_conversation: 10, // Optional: Avg messages per conversation (default: 10)
    format: 'chatgpt', // Optional: 'chatgpt' | 'claude' | 'generic' (default: chatgpt)
    include_code_blocks: true, // Optional: Include code blocks (default: true)
    include_duplicates: false, // Optional: Include intentional duplicates (default: false)
  });
```

**test_deduplication** - Test duplicate detection

```typescript
mcp__keimenon -
  chat -
  import__test_deduplication({
    algorithm: 'jaccard', // Optional: 'jaccard' | 'levenshtein' | 'cosine' (default: jaccard)
    threshold: 0.85, // Optional: Similarity threshold (default: 0.85)
    auth_token: 'jwt_token', // Optional: JWT token
  });
```

**get_import_history** - Get history of imports

```typescript
mcp__keimenon -
  chat -
  import__get_import_history({
    limit: 10, // Optional: Max results (default: 10)
  });
```

#### Common Workflows

**Test Import Pipeline Changes**:

```typescript
// 1. Login first
(await mcp__keimenon) -
  api -
  testing__login({
    email: 'admin@admin.com',
    password: 'admin123',
  });

// 2. Get auth status to retrieve token
const auth = (await mcp__keimenon) - api - testing__get_auth_status();

// 3. Import test dataset
const result =
  (await mcp__keimenon) -
  chat -
  import__import_test_dataset({
    dataset_name: 'small',
    auth_token: auth.token,
    config: {
      deduplication: { enabled: true, algorithm: 'jaccard', threshold: 0.85 },
    },
  });

// 4. Verify results
(await mcp__keimenon) -
  chat -
  import__verify_import_results({
    import_id: result.import_id,
    auth_token: auth.token,
  });

// 5. Check database
const nodes =
  (await mcp__keimenon) -
  database__query_nodes({
    kind: 'ChatThread',
    limit: 10,
  });
```

**Compare Deduplication Algorithms**:

```typescript
// Test with Jaccard
const jaccard =
  (await mcp__keimenon) -
  chat -
  import__import_test_dataset({
    dataset_name: 'tiny',
    config: { deduplication: { algorithm: 'jaccard', threshold: 0.85 } },
  });

// Test with Levenshtein
const levenshtein =
  (await mcp__keimenon) -
  chat -
  import__import_test_dataset({
    dataset_name: 'tiny',
    config: { deduplication: { algorithm: 'levenshtein', threshold: 0.85 } },
  });

// Compare results
(await mcp__keimenon) -
  chat -
  import__compare_imports({
    import_id_a: jaccard.import_id,
    import_id_b: levenshtein.import_id,
  });
```

---

### 5. Keimenon Settings CRM Server (`keimenon-settings-crm`)

**Purpose**: Manage users, accounts, and settings

#### Tools

**list_users** - List all users with filtering

```typescript
mcp__keimenon -
  settings -
  crm__list_users({
    account_id: 'acc_xyz789', // Optional: Filter by account
    permission_level: 'admin', // Optional: 'super_admin' | 'admin' | 'senior' | 'junior' | 'viewer'
    limit: 50, // Optional: Max results (default: 50)
  });
```

**get_user_details** - Get detailed user information

```typescript
mcp__keimenon -
  settings -
  crm__get_user_details({
    user_id: 'usr_abc123', // User ID or email
  });
```

**list_accounts** - List all accounts with statistics

```typescript
mcp__keimenon -
  settings -
  crm__list_accounts({
    account_type: 'client', // Optional: 'admin' | 'client'
    account_class: 'free', // Optional: 'free' | 'professional' | 'business'
    include_stats: true, // Optional: Include node/user counts (default: true)
  });
```

**get_account_details** - Get detailed account information

```typescript
mcp__keimenon -
  settings -
  crm__get_account_details({
    account_id: 'acc_xyz789',
  });
```

**query_user_account_memberships** - Query user-account relationships

```typescript
mcp__keimenon -
  settings -
  crm__query_user_account_memberships({
    user_id: 'usr_abc123', // Optional: Filter by user
    account_id: 'acc_xyz789', // Optional: Filter by account
  });
```

**get_settings** - Get settings from graph

```typescript
mcp__keimenon -
  settings -
  crm__get_settings({
    category: 'notification', // Optional: Settings category
  });
```

**search_settings** - Search settings by key/value

```typescript
mcp__keimenon -
  settings -
  crm__search_settings({
    query: 'email notification', // Search query
  });
```

#### Common Workflows

**Audit User Permissions**:

```typescript
// 1. List all users
const users = (await mcp__keimenon) - settings - crm__list_users({ limit: 100 });

// 2. Get details for specific user
const user =
  (await mcp__keimenon) -
  settings -
  crm__get_user_details({
    user_id: 'usr_abc123',
  });

// 3. Check account memberships
const memberships =
  (await mcp__keimenon) -
  settings -
  crm__query_user_account_memberships({
    user_id: 'usr_abc123',
  });
```

**Account Analytics**:

```typescript
// Get all accounts with stats
const accounts =
  (await mcp__keimenon) -
  settings -
  crm__list_accounts({
    include_stats: true,
  });

// Get specific account details
const account =
  (await mcp__keimenon) -
  settings -
  crm__get_account_details({
    account_id: 'acc_xyz789',
  });

// Check database stats
const stats = (await mcp__keimenon) - database__get_stats({ detailed: true });
```

---

### 6. Playwright E2E Server (`playwright-e2e`)

**Purpose**: Run and manage E2E tests

#### Tools

**pw_listTests** - List available Playwright tests

```typescript
mcp__playwright -
  e2e__pw_listTests({
    grep: 'keimenon', // Optional: Filter tests by pattern (e.g., 'login', '@smoke')
  });
```

**pw_run** - Run Playwright tests

```typescript
mcp__playwright -
  e2e__pw_run({
    grep: '@smoke', // Optional: Filter tests by pattern
    project: 'chromium', // Optional: 'chromium' | 'firefox' | 'webkit'
    headed: false, // Optional: Run in headed mode (default: false)
    retries: 0, // Optional: Number of retries (default: 0)
    tag: '@smoke', // Optional: Filter by tag
    shard: '1/3', // Optional: Run specific shard
  });
```

**pw_lastFailures** - Get details of last test failures

```typescript
mcp__playwright - e2e__pw_lastFailures();
// Returns: Trace/screenshot paths, error messages
```

**app_start** - Start web and API servers

```typescript
mcp__playwright -
  e2e__app_start({
    env: 'local', // Optional: 'local' | 'ci' (default: local)
  });
```

**app_stop** - Stop running servers

```typescript
mcp__playwright - e2e__app_stop();
```

**artifacts_list** - List test artifacts

```typescript
mcp__playwright -
  e2e__artifacts_list({
    kind: 'trace', // Optional: 'report' | 'trace' | 'video' | 'screenshot'
    limit: 20, // Optional: Max results (default: 20)
  });
```

**artifacts_read** - Read artifact file

```typescript
mcp__playwright -
  e2e__artifacts_read({
    path: 'test-results/trace.zip', // Relative path to artifact
    base64: false, // Optional: Return as base64 (default: false)
    maxSize: 1048576, // Optional: Max file size bytes (default: 1MB)
  });
```

**env_info** - Get environment information

```typescript
mcp__playwright - e2e__env_info();
```

#### Common Workflows

**Run Smoke Tests Before Deploy**:

```typescript
// 1. List smoke tests
const tests =
  (await mcp__playwright) -
  e2e__pw_listTests({
    grep: '@smoke',
  });

// 2. Run smoke tests
const result =
  (await mcp__playwright) -
  e2e__pw_run({
    tag: '@smoke',
    project: 'chromium',
  });

// 3. Check for failures
if (result.failed > 0) {
  const failures = (await mcp__playwright) - e2e__pw_lastFailures();
  // Analyze failures
}
```

**Debug Test Failures**:

```typescript
// 1. Get last failures
const failures = (await mcp__playwright) - e2e__pw_lastFailures();

// 2. List artifacts
const artifacts =
  (await mcp__playwright) -
  e2e__artifacts_list({
    kind: 'trace',
  });

// 3. Read trace/screenshot
const trace =
  (await mcp__playwright) -
  e2e__artifacts_read({
    path: artifacts[0].path,
  });
```

---

## Multi-Server Orchestration Examples

### Example 1: Complete Feature Validation

```typescript
// Validate a new feature end-to-end using multiple MCP servers

async function validateFeature(featureName: string) {
  // 1. Search documentation
  const docs =
    (await mcp__keimenon) -
    docs__search_docs({
      query: featureName,
      limit: 5,
    });

  // 2. Test API endpoints
  (await mcp__keimenon) -
    api -
    testing__login({
      email: 'admin@admin.com',
      password: 'admin123',
    });

  const apiResult =
    (await mcp__keimenon) -
    api -
    testing__test_endpoint({
      path: `/api/v1/${featureName}`,
      method: 'GET',
      expect_status: 200,
    });

  // 3. Check database state
  const dbStats = (await mcp__keimenon) - database__get_stats({ detailed: true });

  // 4. Run E2E tests
  const testResult =
    (await mcp__playwright) -
    e2e__pw_run({
      grep: featureName,
      project: 'chromium',
    });

  // 5. Generate report
  return {
    documentation: docs.length > 0 ? 'Found' : 'Missing',
    api: apiResult.status === 200 ? 'Working' : 'Failed',
    database: dbStats,
    tests: testResult.passed > 0 ? 'Passing' : 'Failing',
  };
}
```

### Example 2: Import Testing Pipeline

```typescript
// Complete import testing workflow

async function testImportPipeline() {
  // 1. Login
  (await mcp__keimenon) -
    api -
    testing__login({
      email: 'admin@admin.com',
      password: 'admin123',
    });

  const auth = (await mcp__keimenon) - api - testing__get_auth_status();

  // 2. Get baseline stats
  const before = (await mcp__keimenon) - database__get_stats();

  // 3. Import test dataset
  const importResult =
    (await mcp__keimenon) -
    chat -
    import__import_test_dataset({
      dataset_name: 'small',
      auth_token: auth.token,
      config: {
        deduplication: { enabled: true, algorithm: 'jaccard', threshold: 0.85 },
      },
    });

  // 4. Verify import
  (await mcp__keimenon) -
    chat -
    import__verify_import_results({
      import_id: importResult.import_id,
      auth_token: auth.token,
    });

  // 5. Check database changes
  const after = (await mcp__keimenon) - database__get_stats();

  // 6. Query imported data
  const threads =
    (await mcp__keimenon) -
    database__query_nodes({
      kind: 'ChatThread',
      limit: 10,
    });

  // 7. Check for duplicates
  const duplicates =
    (await mcp__keimenon) -
    database__query_edges({
      kind: 'DUP_OF',
      limit: 50,
    });

  return {
    imported: {
      nodes_added: after.total_nodes - before.total_nodes,
      edges_added: after.total_edges - before.total_edges,
    },
    deduplication: {
      duplicates_found: duplicates.length,
    },
    threads: threads.length,
  };
}
```

### Example 3: CI/CD Pre-Deploy Validation

```typescript
// Run before deploying to production

async function preDe ployValidation() {
  const results = {
    database: { status: 'unknown', details: null },
    api: { status: 'unknown', details: null },
    tests: { status: 'unknown', details: null },
    documentation: { status: 'unknown', details: null }
  };

  try {
    // 1. Check database health
    const stats = await mcp__keimenon-database__get_stats({ detailed: true });
    results.database = {
      status: stats.total_nodes > 0 ? 'healthy' : 'empty',
      details: stats
    };

    // 2. Test critical API endpoints
    await mcp__keimenon-api-testing__login({
      email: 'admin@admin.com',
      password: 'admin123'
    });

    const endpoints = ['/nodes', '/edges', '/accounts'];
    let apiSuccess = 0;

    for (const endpoint of endpoints) {
      try {
        await mcp__keimenon-api-testing__test_endpoint({
          path: endpoint,
          method: 'GET',
          expect_status: 200
        });
        apiSuccess++;
      } catch (e) {
        console.error(`Endpoint ${endpoint} failed:`, e);
      }
    }

    results.api = {
      status: apiSuccess === endpoints.length ? 'passing' : 'failing',
      details: { passed: apiSuccess, total: endpoints.length }
    };

    // 3. Run smoke tests
    const testResult = await mcp__playwright-e2e__pw_run({
      tag: '@smoke',
      project: 'chromium'
    });

    results.tests = {
      status: testResult.failed === 0 ? 'passing' : 'failing',
      details: testResult
    };

    // 4. Check for critical TODOs
    const criticalTodos = await mcp__keimenon-docs__list_todos({
      type: 'XXX',
      limit: 50
    });

    results.documentation = {
      status: criticalTodos.length === 0 ? 'clean' : 'has_issues',
      details: { critical_todos: criticalTodos.length }
    };

  } catch (error) {
    console.error('Validation error:', error);
  }

  // Generate summary
  const allPassing = Object.values(results).every(r =>
    ['healthy', 'passing', 'clean'].includes(r.status)
  );

  return {
    ready_for_deploy: allPassing,
    results
  };
}
```

## Best Practices

### 1. Always Login First for API/Import Operations

```typescript
// ✅ GOOD: Login before using API testing tools
(await mcp__keimenon) - api - testing__login({ email: '...', password: '...' });
(await mcp__keimenon) - api - testing__test_endpoint({ path: '/nodes' });

// ❌ BAD: Forgot to login
(await mcp__keimenon) - api - testing__test_endpoint({ path: '/nodes' }); // Will fail
```

### 2. Use Limits to Avoid Large Results

```typescript
// ✅ GOOD: Limit results
(await mcp__keimenon) - database__query_nodes({ limit: 50 });

// ⚠️ OKAY but slow: No limit (uses default 50)
(await mcp__keimenon) - database__query_nodes();
```

### 3. Orchestrate Sequential Operations

```typescript
// ✅ GOOD: Sequential operations (each depends on previous)
const auth = await mcp__keimenon-api-testing__login({ ... });
const authStatus = await mcp__keimenon-api-testing__get_auth_status();
const importResult = await mcp__keimenon-chat-import__import_test_dataset({
  auth_token: authStatus.token
});
await mcp__keimenon-chat-import__verify_import_results({
  import_id: importResult.import_id
});
```

### 4. Clean Up Test Data

```typescript
// After testing, clean up
(await mcp__keimenon) -
  api -
  testing__cleanup_test_data({
    data_tag: 'test',
    delete_account: false,
  });
```

## Reference Files

- [.mcp/README.md](../../../.mcp/README.md) - MCP servers overview
- [.mcp/servers/database/index.js](../../../.mcp/servers/database/index.js) - Database server implementation
- [.mcp/servers/api-testing/index.js](../../../.mcp/servers/api-testing/index.js) - API testing server
- [.mcp/servers/chat-import/index.js](../../../.mcp/servers/chat-import/index.js) - Chat import server
- [.mcp/servers/docs/index.js](../../../.mcp/servers/docs/index.js) - Docs server
- [.mcp/servers/settings-crm/index.js](../../../.mcp/servers/settings-crm/index.js) - Settings/CRM server
- [.mcp/servers/playwright-e2e/index.js](../../../.mcp/servers/playwright-e2e/index.js) - Playwright server

---

**Note**: This skill orchestrates MCP servers for complex workflows. Use it when you need to query multiple systems or automate multi-step operations.
