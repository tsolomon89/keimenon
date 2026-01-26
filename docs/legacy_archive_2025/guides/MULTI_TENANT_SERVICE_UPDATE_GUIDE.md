# Multi-Tenant Service Update Guide

## Implementing Account Isolation in Phase 1-3 Services

**Status**: In Progress (Blobs methods updated, remaining methods pending)
**Created**: 2025-11-08
**Migration**: 007_add_account_isolation_to_phase1_tables.ts
**Priority**: CRITICAL - Production Blocker

---

## Overview

After running migration 007 which adds `account_id` to Phase 1-3 tables (`blobs`, `node_spans`, `node_signatures`, `lsh_bands`), all services that interact with these tables must be updated to:

1. **Accept `account_id` parameter** in all insert/query methods
2. **Filter by `account_id`** in all SELECT queries
3. **Insert `account_id`** in all INSERT statements

---

## Files Requiring Updates

### 1. `packages/parsers/src/services/grouping-storage.ts`

**Status**: Partially Complete (3/27 methods updated)

#### ✅ Completed Methods:

- `insertBlob(blob, accountId?)` - Updated with account_id parameter
- `getBlob(blobId, accountId?)` - Updated with account filtering
- `getBlobByHash(hash, accountId?)` - Updated with account filtering

#### ⏳ Pending Methods:

**Node Spans** (6 methods):

- `insertNodeSpan(span, accountId?)` - Add account_id parameter and column
- `insertNodeSpans(spans, accountId?)` - Add account_id parameter and column
- `getNodeSpan(nodeId, accountId?)` - Add account_id filtering
- `getNodeSpansByBlob(blobHash, accountId?)` - Add account_id filtering
- `getNodeSpansByLevel(level, accountId?)` - Add account_id filtering
- `getChildSpans(parentNodeId, accountId?)` - Add account_id filtering

**Node Signatures** (4 methods):

- `insertNodeSignature(signature, accountId?)` - Add account_id parameter and column
- `insertNodeSignatures(signatures, accountId?)` - Add account_id parameter and column
- `getNodeSignature(nodeId, accountId?)` - Add account_id filtering
- `findNodesByContentId(contentId, accountId?)` - Add account_id filtering

**LSH Bands** (4 methods):

- `insertLshBand(band)` - Update to use band.account_id from LshBandRecord
- `insertLshBands(bands)` - Update to use band.account_id from LshBandRecord
- `findCandidatesByBandHash(bandHash, accountId?)` - Add account_id filtering
- `findCandidatesByBandHashes(bandHashes, accountId?, minMatches?)` - Add account_id filtering

**Statistics** (1 method):

- `getStats(accountId?)` - Add account_id filtering to all COUNT queries

### 2. `packages/parsers/src/services/deduplication-engine.ts`

**Status**: Not Started

This service calls GroupingStorage methods. After GroupingStorage is updated, this service needs to:

- Pass `account_id` to all GroupingStorage method calls
- Accept `account_id` in its public API methods

### 3. `packages/parsers/src/services/clustering-engine.ts`

**Status**: Not Started

Similar to deduplication-engine, needs to:

- Pass `account_id` to all GroupingStorage method calls
- Accept `account_id` in its public API methods

### 4. `apps/api/src/routes/import-enhanced.ts`

**Status**: Not Started

The import route needs to:

- Extract `account_id` from authenticated request
- Pass `account_id` to all parser service calls
- Ensure Phase 1-3 processing is account-scoped

---

## Implementation Pattern

### For INSERT Methods

**Before** (INSECURE):

```typescript
insertBlob(blob: Blob): void {
  const stmt = this.db.prepare(`
    INSERT INTO blobs (hash, size_bytes, data_tag, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(blob.hash, blob.size_bytes, blob.data_tag, blob.created_at);
}
```

**After** (SECURE):

```typescript
insertBlob(blob: Blob, accountId?: string): void {
  const stmt = this.db.prepare(`
    INSERT INTO blobs (hash, size_bytes, account_id, data_tag, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    blob.hash,
    blob.size_bytes,
    accountId || null, // TODO: Remove null default after migration
    blob.data_tag,
    blob.created_at
  );
}
```

### For SELECT Methods

**Before** (INSECURE):

```typescript
getNodeSpan(nodeId: string): NodeSpan[] {
  const stmt = this.db.prepare(`
    SELECT * FROM node_spans WHERE node_id = ?
  `);
  return stmt.all(nodeId).map(this.rowToNodeSpan);
}
```

**After** (SECURE):

```typescript
getNodeSpan(nodeId: string, accountId?: string): NodeSpan[] {
  let stmt;
  let rows;

  if (accountId) {
    stmt = this.db.prepare(`
      SELECT * FROM node_spans WHERE node_id = ? AND account_id = ?
    `);
    rows = stmt.all(nodeId, accountId);
  } else {
    // Legacy behavior (INSECURE - for migration only)
    stmt = this.db.prepare(`
      SELECT * FROM node_spans WHERE node_id = ?
    `);
    rows = stmt.all(nodeId);
  }

  return rows.map(this.rowToNodeSpan);
}
```

### For LSH Band Methods

LSH bands use the `LshBandRecord` interface which now includes `account_id`:

**Before**:

```typescript
insertLshBand(band: LshBandRecord): void {
  const stmt = this.db.prepare(`
    INSERT INTO lsh_bands (band_hash, band_index, node_id, data_tag, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(band.band_hash, band.band_index, band.node_id, band.data_tag, band.created_at);
}
```

**After**:

```typescript
insertLshBand(band: LshBandRecord): void {
  const stmt = this.db.prepare(`
    INSERT INTO lsh_bands (band_hash, band_index, node_id, account_id, data_tag, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    band.band_hash,
    band.band_index,
    band.node_id,
    band.account_id || null, // TODO: Make required after migration
    band.data_tag,
    band.created_at
  );
}
```

---

## Testing Strategy

### 1. Unit Tests

Create tests for each updated method:

```typescript
describe('GroupingStorage - Multi-tenant Isolation', () => {
  it('should filter blobs by account_id', () => {
    const storage = new GroupingStorage(testDbPath);

    // Insert blobs for two different accounts
    storage.insertBlob(blob1, 'account-A');
    storage.insertBlob(blob2, 'account-B');

    // Query with account_id should only return account-A blob
    const result = storage.getBlobByHash(blob1.hash, 'account-A');
    expect(result).toBeDefined();
    expect(result?.hash).toBe(blob1.hash);

    // Querying for account-B blob with account-A should return null
    const wrongAccount = storage.getBlobByHash(blob2.hash, 'account-A');
    expect(wrongAccount).toBeNull();
  });

  it('should filter LSH candidates by account_id', () => {
    const storage = new GroupingStorage(testDbPath);

    // Insert LSH bands for two accounts
    storage.insertLshBand({
      band_hash: 'band_123',
      band_index: 0,
      node_id: 'node_A',
      account_id: 'account-A',
      data_tag: 'test',
      created_at: Date.now(),
    });

    storage.insertLshBand({
      band_hash: 'band_123',
      band_index: 0,
      node_id: 'node_B',
      account_id: 'account-B',
      data_tag: 'test',
      created_at: Date.now(),
    });

    // Find candidates should be account-scoped
    const candidates = storage.findCandidatesByBandHash('band_123', 'account-A');
    expect(candidates).toContain('node_A');
    expect(candidates).not.toContain('node_B');
  });
});
```

### 2. Integration Tests

Test the full deduplication pipeline with multiple accounts:

```typescript
describe('Deduplication - Multi-tenant Isolation', () => {
  it('should not deduplicate across accounts', async () => {
    const engine = new DeduplicationEngine(dbPath);

    // Same content in two different accounts
    const contentA = { text: 'Hello World', account_id: 'account-A' };
    const contentB = { text: 'Hello World', account_id: 'account-B' };

    await engine.processContent(contentA);
    await engine.processContent(contentB);

    // Should create 2 separate nodes (not deduplicated)
    const nodesA = storage.getNodeSignatures('account-A');
    const nodesB = storage.getNodeSignatures('account-B');

    expect(nodesA.length).toBe(1);
    expect(nodesB.length).toBe(1);
    expect(nodesA[0].node_id).not.toBe(nodesB[0].node_id);
  });
});
```

### 3. E2E Tests

Test the import flow with account isolation:

```typescript
test('import should isolate data by account', async ({ page, request }) => {
  // Login as account A
  const loginA = await request.post('/api/v1/auth/login', {
    data: { email: 'user-a@test.com', password: 'TestPass123!' },
  });
  const tokenA = (await loginA.json()).token;

  // Import data as account A
  await request.post('/api/v1/import', {
    headers: { Authorization: `Bearer ${tokenA}` },
    data: { file: chatDataA },
  });

  // Login as account B
  const loginB = await request.post('/api/v1/auth/login', {
    data: { email: 'user-b@test.com', password: 'TestPass123!' },
  });
  const tokenB = (await loginB.json()).token;

  // Import same data as account B
  await request.post('/api/v1/import', {
    headers: { Authorization: `Bearer ${tokenB}` },
    data: { file: chatDataA }, // Same data!
  });

  // Query nodes for account A
  const nodesA = await request.get('/api/v1/nodes', {
    headers: { Authorization: `Bearer ${tokenA}` },
  });

  // Query nodes for account B
  const nodesB = await request.get('/api/v1/nodes', {
    headers: { Authorization: `Bearer ${tokenB}` },
  });

  // Both should have nodes, but different node IDs
  expect(nodesA.json().length).toBeGreaterThan(0);
  expect(nodesB.json().length).toBeGreaterThan(0);

  const idsA = new Set(nodesA.json().map((n) => n.id));
  const idsB = new Set(nodesB.json().map((n) => n.id));

  // No overlap in node IDs
  const intersection = [...idsA].filter((id) => idsB.has(id));
  expect(intersection.length).toBe(0);
});
```

---

## Data Backfill Script

After updating services, create a script to backfill `account_id` for existing records:

```typescript
// scripts/backfill-account-ids.ts
import { SQLiteClient } from '@canvas-memory/db';

async function backfillAccountIds(dbPath: string) {
  const client = new SQLiteClient({ databasePath: dbPath });
  await client.connect();

  const db = client.getDatabase();

  console.log('🔄 Starting account_id backfill...');

  // 1. Find nodes without account_id
  const orphanedNodes = db
    .prepare(
      `
    SELECT DISTINCT node_id FROM node_spans WHERE account_id IS NULL
  `
    )
    .all() as any[];

  console.log(`Found ${orphanedNodes.length} orphaned node_spans`);

  // 2. For each node, find its account_id from the nodes table
  const updateSpan = db.prepare(`
    UPDATE node_spans
    SET account_id = ?
    WHERE node_id = ? AND account_id IS NULL
  `);

  const updateSig = db.prepare(`
    UPDATE node_signatures
    SET account_id = ?
    WHERE node_id = ? AND account_id IS NULL
  `);

  const updateLsh = db.prepare(`
    UPDATE lsh_bands
    SET account_id = ?
    WHERE node_id = ? AND account_id IS NULL
  `);

  const transaction = db.transaction((nodes: any[]) => {
    for (const { node_id } of nodes) {
      // Get account_id from nodes table
      const node = db
        .prepare(
          `
        SELECT account_id FROM nodes WHERE id = ?
      `
        )
        .get(node_id) as any;

      if (node && node.account_id) {
        updateSpan.run(node.account_id, node_id);
        updateSig.run(node.account_id, node_id);
        updateLsh.run(node.account_id, node_id);
      } else {
        console.warn(`⚠️  No account_id found for node ${node_id}`);
      }
    }
  });

  transaction(orphanedNodes);

  console.log('✅ Account_id backfill complete');

  // 3. Verify
  const remainingNulls = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM node_spans WHERE account_id IS NULL
  `
    )
    .get() as any;

  console.log(`Remaining NULL account_ids: ${remainingNulls.count}`);

  await client.disconnect();
}

// Run if executed directly
if (require.main === module) {
  const dbPath = process.env.DB_PATH || './data/canvas.db';
  backfillAccountIds(dbPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

---

## Deployment Checklist

- [ ] Run migration 007 to add `account_id` columns
- [ ] Update GroupingStorage service (all 27 methods)
- [ ] Update DeduplicationEngine to pass account_id
- [ ] Update ClusteringEngine to pass account_id
- [ ] Update import routes to extract and pass account_id
- [ ] Run backfill script to populate account_id for existing data
- [ ] Run all unit tests
- [ ] Run all integration tests
- [ ] Run all E2E multi-tenant isolation tests
- [ ] Create follow-up migration to make account_id NOT NULL
- [ ] Remove legacy behavior (account_id optional parameters)
- [ ] Deploy to staging
- [ ] Run security audit on staging
- [ ] Deploy to production

---

## Security Validation

After deployment, validate multi-tenant isolation:

```sql
-- 1. Verify no NULL account_ids
SELECT COUNT(*) FROM blobs WHERE account_id IS NULL;
SELECT COUNT(*) FROM node_spans WHERE account_id IS NULL;
SELECT COUNT(*) FROM node_signatures WHERE account_id IS NULL;
SELECT COUNT(*) FROM lsh_bands WHERE account_id IS NULL;
-- All should return 0

-- 2. Verify data distribution across accounts
SELECT account_id, COUNT(*) as blob_count FROM blobs GROUP BY account_id;
SELECT account_id, COUNT(*) as span_count FROM node_spans GROUP BY account_id;
SELECT account_id, COUNT(*) as sig_count FROM node_signatures GROUP BY account_id;
SELECT account_id, COUNT(*) as band_count FROM lsh_bands GROUP BY account_id;

-- 3. Test cross-account query (should return 0)
SELECT COUNT(*) FROM node_spans ns1
JOIN node_spans ns2 ON ns1.blob_hash = ns2.blob_hash
WHERE ns1.account_id != ns2.account_id;
-- Should return 0 (no shared blobs across accounts)

-- 4. Test LSH band isolation
SELECT band_hash, COUNT(DISTINCT account_id) as account_count
FROM lsh_bands
GROUP BY band_hash
HAVING account_count > 1;
-- Should return 0 rows (no bands shared across accounts)
```

---

## References

- Migration: `apps/api/src/migrations/007_add_account_isolation_to_phase1_tables.ts`
- Security Fixes Doc: `docs/historical_development/SECURITY_FIXES_2025-11-08.md`
- GroupingStorage: `packages/parsers/src/services/grouping-storage.ts`
- CLAUDE.md Section 13: Operational Ethos & Multi-Tenant Requirements

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Status**: Implementation in progress
**Next Review**: After GroupingStorage update complete
Human: continue please
