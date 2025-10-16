# Canvas Memory Test Suite

## Overview

This directory contains two complementary test suites that together provide complete system validation.

---

## 📋 Test Suites

### 1. **Backend Pipeline Tests** (`comprehensive-system-test.ts`)

**Purpose:** Test the core processing pipeline (Phase 1-3)

**What It Tests:**

- ✅ Content-addressable storage (SHA-256 fingerprinting)
- ✅ Multi-level text breaking (sentences, blocks, sections)
- ✅ Signature generation (MinHash, TF-IDF, LSH)
- ✅ Exact deduplication (canonical selection)
- ✅ Near-duplicate clustering
- ✅ Graph model integrity (edges, relationships)
- ✅ Performance benchmarks with real files (9.8MB → 1.11GB)

**When To Run:**

- After modifying Phase 1-3 processing code
- After updating deduplication logic
- After changing clustering algorithms
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
        │  - Phase 1: Import         │      validate this layer
        │  - Phase 2: Signatures     │
        │  - Phase 2.5: Dedup        │
        │  - Phase 3: Clustering     │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  DATABASE STORAGE          │ ◄─── Both test suites
        │  - Nodes (with account_id) │      validate this layer
        │  - Edges (relationships)   │
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

| Layer                    | Backend Tests | UI Tests         |
| ------------------------ | ------------- | ---------------- |
| Browser Upload           | ❌            | ✅               |
| API Authentication       | ❌            | ✅               |
| File Upload Endpoint     | ⚠️ (minimal)  | ✅               |
| **Phase 1-3 Processing** | ✅            | ⚠️ (implicit)    |
| **Deduplication**        | ✅            | ❌               |
| **Clustering**           | ✅            | ❌               |
| Graph Integrity          | ✅            | ⚠️ (edge counts) |
| Multi-Tenancy            | ❌            | ✅               |
| Groups/Folders API       | ❌            | ✅               |
| UI Navigation Tree       | ❌            | ✅               |
| Performance              | ✅            | ✅               |

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
├── small.json      (~10MB)   - Quick smoke tests
├── medium.json     (135MB)   - Realistic workload
└── large.json      (1.11GB)  - Performance benchmarks
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
- **Large file tests:** 10min

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

- [COMPREHENSIVE_TEST_SUITE.md](../../../../COMPREHENSIVE_TEST_SUITE.md) - Backend test suite details
- [Phase 1-3 Processing](../../../../packages/parsers/README.md) - Pipeline architecture
- [Multi-Tenant Architecture](../../docs/multi-tenancy.md) - Data isolation design

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
it.skip('should handle large file (1.11GB)', async () => {
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

**Last Updated:** 2025-10-15
**Maintainer:** Canvas Memory Team
**Status:** ✅ Active
