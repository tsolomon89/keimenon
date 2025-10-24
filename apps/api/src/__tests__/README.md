# Canvas Memory Test Suite

## Overview

This directory contains two complementary test suites that together provide complete system validation.

---

## 📋 Test Suites

### 1. **Backend Pipeline Tests** (`comprehensive-system-test.ts`)

**Purpose:** Test the core chat import and processing pipeline

**What It Tests:**

- ✅ Chat import processing (ChatGPT/Claude formats)
- ✅ Message stitching into source documents
- ✅ Code block extraction and deduplication (SHA-256)
- ✅ Duplicate message detection (Jaccard/Levenshtein/Cosine)
- ✅ Graph model integrity (nodes, edges, relationships)
- ✅ SQLite database operations (CRUD, FTS, transactions)
- ✅ Performance benchmarks with real files (9.8MB → 136MB)

**When To Run:**

- After modifying chat import logic
- After updating deduplication algorithms
- After changing database schema
- Before deploying backend changes

**Run:**

```bash
cd apps/api
npm test comprehensive-system-test
```

---

### 2. **UI Integration Tests** (`ui-integration-test.test.ts`)

**Purpose:** Test the end-to-end flow from browser to UI display

**What It Tests:**

- ✅ API upload endpoint (multipart form data)
- ✅ Browser → Server communication
- ✅ Data persistence with `account_id` / `created_by`
- ✅ Multi-tenant data isolation
- ✅ Groups & Folders navigation tree
- ✅ UI data transformation (JSON parsing)
- ✅ Authentication & authorization
- ✅ Error handling & edge cases

**When To Run:**

- After modifying import API endpoints
- After changing authentication logic
- After updating UI navigation queries
- Before deploying frontend changes

**Run:**

```bash
cd apps/api
npm test ui-integration-test
```

---

### 3. **Data Management Tests** (`data-management.test.ts`)

**Purpose:** Test data clearing endpoints with comprehensive error handling

**What It Tests:**

- ✅ DELETE /api/v1/data/canvas (clear current user's data)
- ✅ DELETE /api/v1/data/all-clients (admin only - clear all client data)
- ✅ GET /api/v1/data/stats (canvas data statistics)
- ✅ Error handling with asyncHandler and ErrorFactory
- ✅ Edge cases (empty database, concurrent deletions)
- ✅ Multi-tenant data isolation
- ✅ Admin authorization
- ✅ Audit log creation
- ✅ Performance with large datasets

**When To Run:**

- After modifying data-management.ts routes
- After changing error handling middleware
- After updating asyncHandler or ErrorFactory
- Before deploying data deletion features

**Run:**

```bash
cd apps/api
npm test data-management
```

---

### 4. **Jobs System Tests** (`jobs-system.test.ts`)

**Purpose:** Test the unified background jobs system with SSE streaming

**What It Tests:**

- ✅ Job creation and lifecycle (queued → running → succeeded/failed)
- ✅ Import worker file parsing and processing
- ✅ Delete worker with exclusive locks
- ✅ SSE real-time progress updates
- ✅ Job idempotency
- ✅ Multi-tenant job isolation
- ✅ Worker pool concurrency limits
- ✅ Job cancellation
- ✅ Error handling and recovery

**When To Run:**

- After modifying job domain models
- After updating worker implementations
- After changing SSE broadcaster logic
- Before deploying jobs system changes

**Run:**

```bash
cd apps/api
npm test jobs-system
```

---

## 🔄 How They Work Together

```
┌─────────────────────────────────────────────────────────────┐
│                     USER UPLOADS FILE                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  BROWSER IMPORT MODAL      │ ◄─── UI Integration Tests
        │  - Parse file locally      │      validate this layer
        │  - Send to server          │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  API UPLOAD ENDPOINT       │ ◄─── Both test suites
        │  - Authenticate            │      validate this layer
        │  - Parse multipart data    │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  BACKEND PIPELINE          │ ◄─── Backend Tests
        │  - Parse conversations     │      validate this layer
        │  - Build sources           │
        │  - Extract code            │
        │  - Detect duplicates       │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  DATABASE STORAGE (SQLite) │ ◄─── Both test suites
        │  - Nodes (with account_id) │      validate this layer
        │  - Edges (relationships)   │
        │  - FTS5 search index       │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  GROUPS API ENDPOINT       │ ◄─── UI Integration Tests
        │  - Query by account_id     │      validate this layer
        │  - Build navigation tree   │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  UI DISPLAY                │ ◄─── UI Integration Tests
        │  - Render folders/groups   │      validate this layer
        │  - Show in sidebar         │
        └────────────────────────────┘
```

---

## 📊 Test Coverage Matrix

| Layer                      | Backend Tests | UI Tests         | Data Mgmt Tests | **Jobs Tests** |
| -------------------------- | ------------- | ---------------- | --------------- | -------------- |
| Browser Upload             | ❌            | ✅               | ❌              | ❌             |
| API Authentication         | ❌            | ✅               | ✅              | ✅             |
| File Upload Endpoint       | ⚠️ (minimal)  | ✅               | ❌              | ✅             |
| **Chat Import Processing** | ✅            | ⚠️ (implicit)    | ❌              | ✅             |
| **Code Extraction**        | ✅            | ❌               | ❌              | ⚠️             |
| **Duplicate Detection**    | ✅            | ❌               | ❌              | ⚠️             |
| **Data Clearing**          | ❌            | ✅               | ✅              | ❌             |
| **Error Handling**         | ❌            | ❌               | ✅              | ✅             |
| **Edge Cases**             | ⚠️            | ⚠️               | ✅              | ✅             |
| Graph Integrity            | ✅            | ⚠️ (edge counts) | ✅              | ⚠️             |
| Multi-Tenancy              | ❌            | ✅               | ✅              | ✅             |
| **Admin Authorization**    | ❌            | ❌               | ✅              | ⚠️             |
| **Audit Logs**             | ❌            | ❌               | ✅              | ⚠️             |
| **Job Lifecycle**          | ❌            | ❌               | ❌              | ✅             |
| **SSE Streaming**          | ❌            | ✅               | ❌              | ✅             |
| **Worker Pool**            | ❌            | ❌               | ❌              | ✅             |
| **Job Idempotency**        | ❌            | ❌               | ❌              | ✅             |
| **Concurrency Control**    | ❌            | ❌               | ❌              | ✅             |
| Groups/Folders API         | ❌            | ✅               | ❌              | ❌             |
| Settings Management        | ❌            | ✅               | ❌              | ❌             |
| UI Navigation Tree         | ❌            | ✅               | ❌              | ❌             |
| Performance                | ✅            | ✅               | ✅              | ⚠️             |

**Legend:**

- ✅ Full coverage
- ⚠️ Partial coverage
- ❌ Not covered

---

## 🚀 Quick Start

### Run All Tests

```bash
cd apps/api
npm test
```

### Run Specific Suite

```bash
# Backend pipeline only
npm test comprehensive-system-test

# UI integration only
npm test ui-integration-test
```

### Run With Coverage

```bash
npm test -- --coverage
```

### Run In Watch Mode (During Development)

```bash
npm test -- --watch
```

---

## 📝 Test Data

Both suites use test files from:

```
ai_context/chat_data/test-samples/
├── tiny.json       (~1.4KB)  - Minimal smoke tests
├── small.json      (~10MB)   - Integration tests
└── medium.json     (~136MB)  - Performance benchmarks
```

**Note:** These files contain real chat export data and should be treated accordingly.

---

## 🔧 Configuration

### Environment Variables

```bash
# API server URL (defaults to http://localhost:4001)
TEST_API_URL=http://localhost:4001

# Database path (defaults to ~/.canvas-memory/canvas.db)
DB_PATH=/path/to/test.db

# Test credentials (from migration 001_seed_admin.ts)
# Admin: admin@admin.com / admin123
# Client: client@client.com / client123
```

### Timeouts

- **Quick tests:** 10s default
- **File upload tests:** 60s
- **Medium file tests:** 2-5min
- **Data clearing tests:** 30s

---

## 🐛 Debugging Tests

### Enable Verbose Output

```bash
npm test -- --verbose
```

### Run Single Test

```bash
npm test -- -t "should persist imported data"
```

### Debug In VS Code

1. Set breakpoint in test file
2. Run "Debug Current Test File" from Command Palette
3. Or use the "Run | Debug" CodeLens above each test

### Check Test Database

```bash
# After tests run
sqlite3 ~/.canvas-memory/canvas.db

# Query nodes by account
SELECT account_id, kind, COUNT(*)
FROM nodes
GROUP BY account_id, kind;

# Check for data leakage
SELECT DISTINCT account_id FROM nodes;
```

---

## ✅ Best Practices

### 1. **Clean Up Test Data**

```typescript
beforeAll(() => {
  cleanupTestData(testAccountId);
});

afterAll(() => {
  cleanupTestData(testAccountId);
});
```

### 2. **Use Realistic Test Files**

- Don't mock file contents - use real exports
- Test with multiple file sizes
- Include edge cases (empty chats, huge messages)

### 3. **Test Multi-Tenancy**

```typescript
// Upload as different users
await uploadFile(file, adminToken);
await uploadFile(file, clientToken);

// Verify isolation
const adminData = getNodesByAccount(adminAccountId);
const clientData = getNodesByAccount(clientAccountId);

expect(hasNoOverlap(adminData, clientData)).toBe(true);
```

### 4. **Assert Database State**

```typescript
// Don't just check API responses
const response = await uploadFile(file, token);
expect(response.ok).toBe(true);

// Also verify database
const nodes = db.prepare('SELECT * FROM nodes WHERE account_id = ?').all(accountId);
expect(nodes.length).toBeGreaterThan(0);
```

### 5. **Log Performance Metrics**

```typescript
const startTime = Date.now();
await uploadFile(largeFile, token);
const duration = Date.now() - startTime;

console.log(`⏱️  Import took: ${(duration / 1000).toFixed(1)}s`);
```

---

## 📚 Related Documentation

- [README.md](../../../../README.md) - Main project documentation
- [AUTH_GUIDE.md](../../../../ai_context/docs_active/AUTH_GUIDE.md) - Authentication architecture
- [SESSION_FINAL.md](../../../../SESSION_FINAL.md) - SQLite migration details

---

## 🎯 Future Enhancements

### Planned Test Coverage

- [ ] **Browser E2E Tests** (Playwright/Cypress)
  - Actual modal interaction
  - File selection and upload
  - Progress bar validation

- [ ] **WebSocket Tests**
  - Real-time import progress
  - Multi-client notifications

- [ ] **Load Tests**
  - Concurrent uploads
  - Multiple users simultaneously
  - Database connection pooling

- [ ] **Migration Tests**
  - Schema version upgrades
  - Data migration integrity
  - Rollback scenarios

---

## 💡 Tips & Tricks

### Speed Up Tests During Development

```typescript
// Use smaller test files for quick iteration
const testFile = process.env.CI
  ? 'medium.json' // Full tests in CI
  : 'small.json'; // Fast tests locally
```

### Parallel Test Execution

```bash
# Run suites in parallel
npm test -- --maxWorkers=4
```

### Skip Slow Tests Locally

```typescript
it.skip('should handle large file (136MB)', async () => {
  // Only runs in CI
});
```

### Use Test Tags

```typescript
// @integration
it('should complete full import pipeline', async () => {
  // ...
});

// Run only integration tests
npm test -- --testNamePattern="integration"
```

---

**Last Updated:** 2025-10-16
**Maintainer:** Canvas Memory Team
**Status:** ✅ Active (SQLite local-first architecture)
