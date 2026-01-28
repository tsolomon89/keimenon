# Database Migrations Architecture

**Purpose**: Document the database migration strategy, dual migration systems, and best practices for schema evolution.

**Last Updated**: 2025-11-08

---

## Table of Contents

1. [Overview](#overview)
2. [Dual Migration Systems](#dual-migration-systems)
3. [Migration 003 & 007: Account Isolation Case Study](#migration-003--007-account-isolation-case-study)
4. [Migration Lifecycle](#migration-lifecycle)
5. [Testing Strategy](#testing-strategy)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Keimenon manages database schema evolution through a custom migration system that supports:

- **Idempotent migrations**: Safe to run multiple times
- **Defensive programming**: Checks preconditions before executing
- **Rollback support**: Down migrations for reverting changes
- **Multi-scenario handling**: Works with fresh databases and existing databases
- **Account isolation**: All multi-tenant tables include `account_id`

### Key Principles

1. **Never lose data**: Migrations preserve existing data
2. **Fail gracefully**: Skip when preconditions not met
3. **Self-documenting**: Clear logging and comments
4. **Testable**: Unit tests for all migrations
5. **Graph-native**: Respect account boundaries

---

## Dual Migration Systems

Keimenon currently operates **two parallel migration systems**. This is intentional but should be understood clearly.

### System 1: SQL Migrations

**Location**: `packages/db/src/migrations/*.sql`

**Characteristics**:

- Legacy system for core schema
- Executed during database initialization via `SQLiteClient`
- Creates foundational tables: `nodes`, `edges`, `users`, `accounts`, etc.
- Not tracked in migrations table
- Run automatically when database is created

**Files**:

- `001_initial_schema.sql` - Core graph tables
- `002_phase_0_schema.sql` - Authentication and RBAC tables

**When to Use**: Almost never. Core schema is stable.

### System 2: TypeScript Migrations

**Location**: `apps/api/src/migrations/*.ts`

**Characteristics**:

- Modern system for schema evolution
- Tracked in `migrations` table
- Supports complex logic (defensive checks, validation)
- Can handle multiple scenarios (fresh DB vs. existing DB)
- Rollback support via `down()` functions
- **Recommended for all new migrations**

**Files**:

- `003_grouping_engine_schema.ts` - Phase 1-3 tables (blobs, spans, signatures, bands)
- `004_canonical_map_and_stats.ts` - Deduplication canonical mapping
- `005_clustering_schema.ts` - Clustering engine
- `006_settings_schema.ts` - Settings tables
- `006_policy_versions_and_runs.ts` - Policy versioning
- `007_add_account_isolation_to_phase1_tables.ts` - Account ID backfill for Phase 1-3

**When to Use**: Always for new schema changes.

### Why Two Systems?

**Historical Context**: The SQL migrations were created first for core schema. As the application evolved, we needed more sophisticated migration logic (defensive checks, multi-scenario handling), which TypeScript migrations provide.

**Future Direction**: All new migrations should use TypeScript. We may consolidate in the future, but this is low priority.

---

## Migration 003 & 007: Account Isolation Case Study

This is the perfect example of defensive migration architecture.

### The Problem

**Original State** (before 2025-11-08):

- Migration 003 created Phase 1-3 tables WITHOUT `account_id` columns
- This was a **security vulnerability** - data could leak across accounts
- Migration 007 was created to ADD `account_id` columns

**Failure Scenario**:

- Fresh database runs migration 007 first
- Migration 007 tries to `ALTER TABLE blobs ADD COLUMN account_id`
- Fails because `blobs` table doesn't exist yet

### The Solution

**Step 1: Fix Root Cause (Migration 003)**

Updated migration 003 to create tables WITH `account_id` from day 1:

```typescript
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  account_id TEXT,  -- Added on 2025-11-08
  ...
);

CREATE INDEX IF NOT EXISTS idx_blobs_account ON blobs(account_id);
```

**Step 2: Add Defensive Checks (Migration 007)**

Updated migration 007 to handle three scenarios:

1. **Tables don't exist** (migration 003 not run yet)
   - Skip gracefully with helpful message

2. **Tables exist WITH account_id** (new migration 003)
   - Skip gracefully, work already done

3. **Tables exist WITHOUT account_id** (old migration 003)
   - Apply migration, add account_id columns

```typescript
export async function up(db: Database.Database): Promise<void> {
  // Scenario 1: Check if tables exist
  const requiredTables = ['blobs', 'node_spans', 'node_signatures', 'lsh_bands'];
  const missingTables = requiredTables.filter((table) => !tableExists(db, table));

  if (missingTables.length > 0) {
    console.log('⏭️  Skipping: Tables do not exist yet');
    return;
  }

  // Scenario 2: Check if account_id already exists
  if (columnExists(db, 'blobs', 'account_id')) {
    console.log('✅ Migration already applied');
    return;
  }

  // Scenario 3: Tables exist but no account_id - apply migration
  console.log('⚠️  Detected old schema, applying account_id...');
  db.exec(MIGRATION_007_UP);
}
```

**Step 3: Update isApplied() Logic**

```typescript
export function isApplied(db: Database.Database): boolean {
  // If table doesn't exist, consider migration "applied"
  // (it will skip in up() function)
  if (!tableExists(db, 'blobs')) {
    return true;
  }

  // If table exists, check for account_id column
  return columnExists(db, 'blobs', 'account_id');
}
```

### Testing All Scenarios

Created comprehensive test suite with 8 tests:

1. Fresh database (migration 003 only)
2. Old database (003 without account_id + 007)
3. Idempotency (multiple runs safe)
4. isApplied() accuracy

**All tests pass** ✓

### Lessons Learned

1. **Fix root causes, not just symptoms**: Updated migration 003 instead of just patching with 007
2. **Defensive checks are mandatory**: Never assume preconditions
3. **Test all scenarios**: Fresh DB, existing DB, legacy DB
4. **Graceful degradation**: Skip with helpful messages, don't fail
5. **Self-documenting**: Logs explain what happened and why

---

## Migration Lifecycle

### 1. Planning

**Questions to Answer**:

- What schema changes are needed?
- What are the dependencies?
- How does this affect multi-tenancy?
- What are the rollback implications?
- How will we test this?

**Documentation**:

- Write migration header with purpose, dependencies, date
- Plan defensive checks
- Plan rollback strategy

### 2. Implementation

**File Structure**:

```typescript
// 1. Header documentation
/**
 * Migration NNN: Description
 * Purpose: ...
 * DEPENDENCIES: ...
 */

// 2. SQL constants
export const MIGRATION_NNN_UP = `...`;
export const MIGRATION_NNN_DOWN = `...`;

// 3. Up function (with defensive checks)
export async function up(db: Database.Database): Promise<void> {
  // Check preconditions
  // Execute migration
  // Log results
}

// 4. Down function (rollback)
export async function down(db: Database.Database): Promise<void> {
  // Revert changes
}

// 5. isApplied check
export function isApplied(db: Database.Database): boolean {
  // Check if migration effects exist
}
```

**Registration**:

Add to `run-migrations.ts`:

```typescript
import * as migrationNNN from './NNN_description';

const MIGRATIONS: Record<string, MigrationModule> = {
  // ...
  NNN: migrationNNN,
};
```

### 3. Testing

**Unit Tests** (`__tests__/migrations.test.ts`):

```typescript
describe('Migration NNN', () => {
  it('should create tables correctly', async () => { ... });
  it('should be idempotent', async () => { ... });
  it('should report isApplied correctly', async () => { ... });
});
```

**Manual Testing**:

```bash
# Test on fresh database
DB_PATH=./test.db npx tsx apps/api/src/migrations/run-migrations.ts

# Verify schema
sqlite3 ./test.db "PRAGMA table_info(my_table);"

# Test rollback
DB_PATH=./test.db npx tsx apps/api/src/migrations/run-migrations.ts --rollback NNN
```

### 4. Deployment

**Pre-Deployment**:

- [ ] All tests pass
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Rollback strategy documented

**Deployment Steps**:

```bash
# 1. Backup production database
cp ~/.keimenon/keimenon.db ~/.keimenon/keimenon-backup-$(date +%Y%m%d).db

# 2. Run migrations
npx tsx apps/api/src/migrations/run-migrations.ts

# 3. Verify migration status
npx tsx apps/api/src/migrations/run-migrations.ts --status

# 4. Run application tests
npm test

# 5. If failure, rollback
npx tsx apps/api/src/migrations/run-migrations.ts --rollback NNN
```

### 5. Post-Deployment

**Verification**:

- Check migration status
- Verify schema changes in production
- Monitor application logs for errors
- Run smoke tests

**Data Backfill** (if needed):

Some migrations add columns but don't populate them. Use backfill scripts:

```bash
npx tsx scripts/backfill-account-ids.ts
```

---

## Testing Strategy

### Automated Tests

**Coverage Requirements**:

- 100% of up() logic tested
- Idempotency verified
- isApplied() accuracy verified
- Multiple scenarios covered

**Test Patterns**:

```typescript
// Pattern 1: Fresh database
it('should create schema correctly on fresh database', async () => {
  const db = await createTestDb('test-fresh');
  await migration.up(db);
  assert.ok(tableExists(db, 'my_table'));
  db.close();
});

// Pattern 2: Idempotency
it('should be safe to run multiple times', async () => {
  const db = await createTestDb('test-idempotent');
  await migration.up(db);
  await migration.up(db); // Should not throw
  db.close();
});

// Pattern 3: Scenario coverage
it('should handle scenario X correctly', async () => {
  const db = await createTestDb('test-scenario-x');
  // Set up scenario X
  await migration.up(db);
  // Verify expected behavior
  db.close();
});
```

### Manual Testing

**Test Matrix**:

| Scenario | Migration 003 | Migration 007 | Expected Result               |
| -------- | ------------- | ------------- | ----------------------------- |
| Fresh DB | Not run       | Not run       | 007 skips (no tables)         |
| Fresh DB | Run (new)     | Not run       | 007 skips (has account_id)    |
| Old DB   | Run (old)     | Not run       | 007 applies (adds account_id) |
| Old DB   | Run (old)     | Run           | 007 already applied           |

### CI/CD Integration

```yaml
# .github/workflows/migrations.yml
name: Migration Tests

on: [push, pull_request]

jobs:
  test-migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: node --import tsx --test apps/api/src/migrations/__tests__/migrations.test.ts
```

---

## Best Practices

### 1. Always Use Defensive Checks

```typescript
// Good
export async function up(db: Database.Database): Promise<void> {
  // Check if work is already done
  if (columnExists(db, 'my_table', 'new_column')) {
    console.log('✅ Migration already applied');
    return;
  }

  db.exec(MIGRATION_UP);
}

// Bad
export async function up(db: Database.Database): Promise<void> {
  db.exec(MIGRATION_UP); // Will fail if column exists
}
```

### 2. Use IF NOT EXISTS

```typescript
// Good
CREATE TABLE IF NOT EXISTS my_table ...
CREATE INDEX IF NOT EXISTS idx_my_table ...

// Bad
CREATE TABLE my_table ...  // Fails on second run
```

### 3. Include Account Isolation

```typescript
// Good
CREATE TABLE my_table (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,  -- Multi-tenant isolation
  ...
);

CREATE INDEX idx_my_table_account ON my_table(account_id);

// Bad
CREATE TABLE my_table (
  id TEXT PRIMARY KEY,
  -- Missing account_id - security vulnerability!
  ...
);
```

### 4. Document Dependencies

```typescript
/**
 * Migration 008: Make Account ID Required
 *
 * DEPENDENCIES:
 * - Requires migration 007 (adds account_id columns)
 * - Requires backfill script to have run (populates account_id)
 *
 * BREAKS:
 * - Will fail if any rows have NULL account_id
 */
```

### 5. Informative Logging

```typescript
console.log('🔒 Running migration 007: Add Account Isolation');
console.log('⚠️  This is a CRITICAL SECURITY FIX for multi-tenant isolation');
console.log('✅ Migration completed successfully');
console.log('⏭️  Skipping: precondition not met');
```

### 6. Handle Errors Gracefully

```typescript
try {
  db.exec(MIGRATION_UP);
} catch (error: any) {
  if (error.message.includes('duplicate column name')) {
    console.log('✅ Column already exists');
    return;
  }
  throw error;
}
```

### 7. Write Rollback Logic

```typescript
export async function down(db: Database.Database): Promise<void> {
  // Always document what can/cannot be rolled back
  console.log('Rolling back migration 007...');

  // Drop indexes (safe)
  db.exec('DROP INDEX IF EXISTS idx_my_table_account');

  // Cannot drop columns in SQLite
  console.log('⚠️  Column removal not supported in SQLite');
  console.log('   Manual table recreation required for full rollback');
}
```

---

## Troubleshooting

### Migration Tracking Out of Sync

**Symptom**: Migration claims it ran but schema doesn't match

**Diagnosis**:

```sql
-- Check what's been applied
SELECT * FROM migrations ORDER BY version;

-- Check actual schema
PRAGMA table_info(my_table);
```

**Fix**:

```sql
-- Manually mark as NOT applied (re-run migration)
DELETE FROM migrations WHERE version = 'NNN';

-- OR manually mark as applied (skip migration)
INSERT INTO migrations (version, name, applied_at)
VALUES ('NNN', 'migration_NNN', strftime('%s','now') * 1000);
```

### SQLite Limitations

**Cannot DROP COLUMN**:

```typescript
// Instead of DROP COLUMN, create new table
export async function down(db: Database.Database): Promise<void> {
  db.exec(`
    CREATE TABLE my_table_new AS
    SELECT id, column1, column2  -- Exclude dropped column
    FROM my_table;

    DROP TABLE my_table;
    ALTER TABLE my_table_new RENAME TO my_table;
  `);
}
```

**Cannot MODIFY COLUMN**:

```typescript
// Instead of ALTER COLUMN, create new table with correct type
```

### Dependency Conflicts

**Symptom**: Migration 007 tries to run before migration 003

**Fix**: Update `isApplied()` to return true when dependencies missing:

```typescript
export function isApplied(db: Database.Database): boolean {
  // If dependency (migration 003) hasn't run, pretend we're applied
  // This makes the migration runner skip us
  if (!tableExists(db, 'required_table')) {
    return true;
  }

  // Check if our work is done
  return columnExists(db, 'my_table', 'new_column');
}
```

---

## See Also

- [Migration System README](../../apps/api/src/migrations/README.md) - Detailed usage guide
- [Migration 003](../../apps/api/src/migrations/003_grouping_engine_schema.ts) - Phase 1-3 tables
- [Migration 007](../../apps/api/src/migrations/007_add_account_isolation_to_phase1_tables.ts) - Account isolation fix
- [Backfill Script](../../scripts/backfill-account-ids.ts) - Data migration example
- [OVERVIEW.md](./OVERVIEW.md) - General architecture
