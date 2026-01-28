# Local-First Implementation Plan

**Date**: 2025-10-11
**Goal**: Transform Keimenon into 100% local, user-hosted application
**Timeline**: Phase 1 (1-2 days), Phase 2 (1 week), Phase 3 (2-3 weeks)

---

## Current Architecture Analysis

### Problem Identified ✅

The API (`apps/api/src/index.ts:240-246`) **hardcodes Neo4j initialization** regardless of storage mode:

```typescript
// Line 240 - PROBLEM: Always tries to connect to Neo4j
neo4jClient = getNeo4jClient(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  process.env.NEO4J_USER || 'neo4j',
  process.env.NEO4J_PASSWORD || 'password'
);
await neo4jClient.connect();
await neo4jClient.initializeSchema();
```

This causes:

- ❌ Requires Neo4j Aura (cloud database)
- ❌ Import persistence bug (tries to save to non-existent Neo4j)
- ❌ User must pay for cloud database
- ❌ Data not truly local

### Good News ✅

Everything else is already implemented:

- ✅ SQLite client fully functional (`packages/db/src/sqlite/client.ts`)
- ✅ Database Factory with mode switching (`packages/db/src/database-factory.ts`)
- ✅ Local document store (`apps/api/src/services/local-document-store.ts`)
- ✅ Better-SQLite3 already installed

---

## Phase 1: Fix Storage Mode (THIS PR)

### Changes Required

#### 1. Update `apps/api/src/index.ts`

**Replace hardcoded Neo4j init with DatabaseFactory:**

```typescript
// OLD (line 238-247):
console.log('🔌 Connecting to Neo4j...');
neo4jClient = getNeo4jClient(...);
await neo4jClient.connect();
await neo4jClient.initializeSchema();
console.log('✅ Connected to Neo4j');

// NEW:
console.log('🔌 Initializing database...');
const storageMode = (process.env.STORAGE_MODE || 'local') as StorageMode;
const dbClient = await DatabaseFactory.getClient({
  mode: storageMode,
  local: {
    databasePath: process.env.SQLITE_PATH || path.join(process.env.LOCAL_DOCS_PATH || '~/.keimenon', 'keimenon.db'),
    verbose: process.env.NODE_ENV === 'development',
  },
  keimenon: storageMode !== 'local' ? {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  } : undefined,
});

// Store globally for routes to use
global.dbClient = dbClient;
console.log(`✅ Database initialized (mode: ${storageMode})`);
```

#### 2. Update `.env.example` Files

**`apps/api/.env.example`:**

```env
# Server
PORT=3001
NODE_ENV=development

# Storage Mode (local = SQLite, keimenon = Neo4j, hybrid = both)
STORAGE_MODE=local

# Local Storage (SQLite + Files)
LOCAL_DOCS_PATH=~/.keimenon
SQLITE_PATH=~/.keimenon/keimenon.db

# Optional: Neo4j (only if STORAGE_MODE=keimenon or hybrid)
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=password

# File Storage
STORAGE_PATH=./storage
MAX_FILE_SIZE_MB=10

# Optional: User's AI API Keys (BYO)
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Limits (Free tier)
FREE_MAX_SOURCES=500
FREE_MAX_NODES=20000
FREE_MAX_GROUPS=50
FREE_STORAGE_GB=5
```

#### 3. Update `apps/api/src/routes/import-enhanced.ts`

**Replace getNeo4jClient with global dbClient:**

```typescript
// OLD (line 149-153):
const neo4j = getNeo4jClient(
  process.env.NEO4J_URI,
  process.env.NEO4J_USER,
  process.env.NEO4J_PASSWORD
);

// NEW:
const db = global.dbClient; // Use the globally initialized client
if (!db) {
  throw new Error('Database not initialized');
}
```

#### 4. Update Save Functions

**Modify `saveConversationsToNeo4j`, `saveSourcesToNeo4j`, `saveCodeBlocksToNeo4j` to work with both SQLite and Neo4j:**

```typescript
// OLD: Session-based Neo4j specific
async function saveConversationsToNeo4j(neo4j: any, conversations: any[]) {
  const session = neo4j.driver.session();
  try {
    // Neo4j-specific queries...
  } finally {
    await session.close();
  }
}

// NEW: Database-agnostic
async function saveConversations(db: DatabaseClient, conversations: any[]) {
  for (const conv of conversations) {
    // Create Conversation node
    await db.createNode({
      id: conv.id,
      kind: 'Conversation' as any,
      title: conv.title,
      platform: conv.platform,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      message_count: conv.messages.length,
    });

    // Create Message nodes
    for (const [idx, msg] of conv.messages.entries()) {
      const msgId = msg.metadata?.id || `${conv.id}_msg_${idx}`;
      await db.createNode({
        id: msgId,
        kind: 'Message' as any,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        index: idx,
      });

      // Link message to conversation
      await db.createEdge({
        id: `${conv.id}_has_${msgId}`,
        kind: 'HAS_MESSAGE' as any,
        from_id: conv.id,
        to_id: msgId,
      });
    }
  }
}
```

#### 5. Add Global Type Declaration

**Create `apps/api/src/types/global.d.ts`:**

```typescript
import { DatabaseClient } from '@keimenon/db';

declare global {
  var dbClient: DatabaseClient | undefined;
}

export {};
```

---

## Phase 2: Test & Verify (THIS PR)

### Testing Checklist

1. **Test SQLite-only mode:**

   ```bash
   # Set STORAGE_MODE=local in .env
   npm run dev

   # Import test data
   curl -X POST http://localhost:4001/api/v1/import/enhanced \
     -F "files=@ai_context/chat_data/test-samples/small.json" \
     -F "config={\"export_code\":true}"

   # Verify data saved
   sqlite3 ~/.keimenon/keimenon.db "SELECT COUNT(*) FROM nodes;"
   # Should show > 0 nodes
   ```

2. **Test Neo4j mode (optional):**

   ```bash
   # Set STORAGE_MODE=keimenon in .env
   # Make sure Neo4j is running
   npm run dev

   # Import should work with Neo4j
   ```

3. **Test Hybrid mode:**
   ```bash
   # Set STORAGE_MODE=hybrid in .env
   # Should save to both SQLite and Neo4j
   ```

---

## Phase 3: Documentation Updates

### Files to Update

1. **README.md**
   - Add "100% Local-First" badge
   - Emphasize no cloud costs
   - Update setup instructions

2. **QUICK_START.md**
   - Default to local mode
   - Make Neo4j optional
   - Add SQLite-only quick start

3. **PROJECT_SUMMARY.md**
   - Update architecture diagram
   - Emphasize local-first design
   - Update completion % after bug fix

4. **BUGS_FOUND.md**
   - Mark Bug #1 as FIXED
   - Document the solution

---

## Expected Outcomes

### Before (Current):

- ❌ Requires Neo4j Aura ($65+/month)
- ❌ Data in cloud
- ❌ Import fails (persistence bug)
- ❌ Complex setup

### After (Phase 1):

- ✅ Works 100% locally
- ✅ No cloud costs
- ✅ Imports work correctly
- ✅ Simple setup (just Node.js)
- ✅ SQLite database (~5MB file)
- ✅ User owns their data

---

## File Changes Summary

| File                                     | Type   | Description                             |
| ---------------------------------------- | ------ | --------------------------------------- |
| `apps/api/src/index.ts`                  | MODIFY | Replace Neo4j init with DatabaseFactory |
| `apps/api/src/types/global.d.ts`         | CREATE | Global dbClient type declaration        |
| `apps/api/.env.example`                  | MODIFY | Add STORAGE_MODE, make Neo4j optional   |
| `apps/web/.env.example`                  | MODIFY | Document local-first setup              |
| `apps/api/src/routes/import-enhanced.ts` | MODIFY | Use global dbClient, fix save functions |
| `apps/api/src/routes/nodes.ts`           | MODIFY | Use global dbClient                     |
| `apps/api/src/routes/boards.ts`          | MODIFY | Use global dbClient                     |
| `apps/api/src/routes/edges.ts`           | MODIFY | Use global dbClient                     |
| `README.md`                              | MODIFY | Emphasize local-first                   |
| `QUICK_START.md`                         | MODIFY | Default to local mode                   |
| `BUGS_FOUND.md`                          | MODIFY | Mark Bug #1 as FIXED                    |

**Estimated Lines Changed**: ~300 lines across 11 files
**Estimated Time**: 2-4 hours
**Risk Level**: LOW (SQLite client already tested and working)

---

## Migration Strategy

### For Existing Users (if any):

1. Current users are likely on Neo4j Aura
2. Provide migration script:
   ```bash
   npm run migrate:neo4j-to-sqlite
   ```
3. Script exports from Neo4j, imports to SQLite
4. Users can then switch to local mode

### For New Users:

1. Default to local mode
2. Everything works out of the box
3. Optional: Enable Neo4j for graph visualization

---

## Future Enhancements (Not in this PR)

### Phase 2: Local Embeddings (Next Week)

- Add Transformers.js integration
- Local semantic search
- No OpenAI API required for embeddings

### Phase 3: Electron App (2-3 Weeks)

- Desktop application
- Single `.exe` installer
- Professional UX
- Optional bundled Neo4j

### Phase 4: PWA (Future)

- Browser-only version
- Zero installation
- IndexedDB storage

---

## Success Criteria

✅ **Phase 1 Complete When:**

1. API starts with STORAGE_MODE=local (no Neo4j required)
2. Chat import saves data to SQLite successfully
3. Frontend can query and display data from SQLite
4. All existing features work with SQLite
5. Neo4j remains optional for advanced users
6. Documentation updated to reflect local-first approach

---

## Questions & Decisions

### Q: Should we keep Neo4j support?

**A: YES** - Make it optional for power users who want advanced graph features.

### Q: Should we support migration from Neo4j to SQLite?

**A: YES** - Provide a migration script for existing users.

### Q: Should SQLite be the default?

**A: YES** - Local-first, zero cost, simpler setup.

### Q: What about graph queries?

**A: Two options:**

1. Write custom SQLite queries for basic graph ops
2. Use LevelGraph library for complex graph queries
3. Offer Neo4j as "Pro" feature

---

## Implementation Order

1. ✅ Create this implementation plan (DONE)
2. ⏳ Update `.env.example` files
3. ⏳ Create global type declaration
4. ⏳ Modify `apps/api/src/index.ts` (database init)
5. ⏳ Update all route files to use global dbClient
6. ⏳ Fix import-enhanced save functions
7. ⏳ Test with real data
8. ⏳ Update documentation
9. ⏳ Commit and verify

---

**Ready to implement!** 🚀

Let's start with step 2: Update `.env.example` files.
