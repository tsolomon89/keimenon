# Database Migrations

This directory contains TypeScript-based database migrations for the Canvas Memory application.

## Overview

Canvas Memory uses a custom TypeScript migration system built on top of `better-sqlite3`. Migrations are executed in sequence and tracked in a `migrations` table.

## Quick Start

```bash
# Run all pending migrations
npx tsx apps/api/src/migrations/run-migrations.ts

# Check migration status
npx tsx apps/api/src/migrations/run-migrations.ts --status

# Rollback a specific migration
npx tsx apps/api/src/migrations/run-migrations.ts --rollback 007
```

## Migration Architecture

### Two Migration Systems

Canvas Memory currently has **two parallel migration systems**:

1. **SQL Migrations** (`packages/db/src/migrations/*.sql`)
   - Legacy system for core schema
   - Executed during database initialization
   - Not tracked in migrations table

2. **TypeScript Migrations** (`apps/api/src/migrations/*.ts`)
   - Modern system for schema evolution
   - Tracked in migrations table
   - Supports complex logic and defensive checks
   - **Recommended for new migrations**

### When to Use Each System

**Use TypeScript Migrations for:**

- Schema changes requiring defensive checks (e.g., table existence)
- Multi-step migrations with validation
- Migrations that need to handle multiple scenarios (fresh DB vs. existing DB)
- Changes to Phase 1-3 tables (grouping engine)
- Changes requiring data backfill or transformation

**Use SQL Migrations for:**

- Initial core schema setup
- Simple, one-time schema additions
- Changes that will never need rollback logic

## Writing a Migration

### File Structure

```typescript
import Database from 'better-sqlite3';

/**
 * Migration NNN: Description
 *
 * Purpose: Detailed description of what this migration does
 *
 * DEPENDENCIES: List any migrations that must run first
 *
 * Phase: [Foundation|Security|Feature]
 * Date: YYYY-MM-DD
 */

export const MIGRATION_NNN_UP = `
-- SQL statements for migration
CREATE TABLE IF NOT EXISTS ...
`;

export const MIGRATION_NNN_DOWN = `
-- SQL statements for rollback
DROP TABLE IF EXISTS ...
`;

/**
 * Apply migration
 */
export async function up(db: Database.Database): Promise<void> {
  console.log('Running migration NNN: Description...');

  // Defensive checks (optional but recommended)
  // - Check if work is already done
  // - Check if dependencies exist
  // - Validate preconditions

  db.exec(MIGRATION_NNN_UP);

  console.log('✅ Migration NNN completed successfully');
}

/**
 * Rollback migration
 */
export async function down(db: Database.Database): Promise<void> {
  console.log('Rolling back migration NNN...');

  db.exec(MIGRATION_NNN_DOWN);

  console.log('Migration NNN rolled back');
}

/**
 * Check if migration has been applied
 */
export function isApplied(db: Database.Database): boolean {
  // Check if migration effects are present
  // Return true if already applied, false otherwise

  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get('your_table');

  return !!result;
}
```

### Naming Convention

- `NNN_description_of_migration.ts`
- `NNN` is a zero-padded number (e.g., `003`, `007`, `012`)
- Use underscores for multi-word descriptions
- Be descriptive but concise

### Best Practices

#### 1. Defensive Programming

Always check preconditions before executing:

```typescript
export async function up(db: Database.Database): Promise<void> {
  // Check if table exists
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get('my_table');

  if (!tableExists) {
    console.log('⏭️  Skipping: my_table does not exist');
    return;
  }

  // Check if column already exists
  const columns = db.prepare('PRAGMA table_info(my_table)').all() as any[];
  const hasColumn = columns.some((col: any) => col.name === 'new_column');

  if (hasColumn) {
    console.log('✅ Migration already applied');
    return;
  }

  // Proceed with migration
  db.exec(MIGRATION_UP);
}
```

#### 2. Idempotency

Migrations should be safe to run multiple times:

```typescript
// Good - uses IF NOT EXISTS
CREATE TABLE IF NOT EXISTS my_table ...
CREATE INDEX IF NOT EXISTS idx_my_table ...

// Bad - will fail on second run
CREATE TABLE my_table ...
```

#### 3. Account Isolation

For multi-tenant tables, always include `account_id`:

```typescript
CREATE TABLE IF NOT EXISTS my_table (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,  -- Multi-tenant isolation
  data TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_my_table_account ON my_table(account_id);
```

#### 4. Informative Logging

Use emoji and clear messages:

```typescript
console.log('🔒 Running migration: Security Fix');
console.log('⚠️  This migration affects production data');
console.log('✅ Migration completed successfully');
console.log('⏭️  Skipping: precondition not met');
console.log('❌ Migration failed:', error);
```

#### 5. Error Handling

Handle expected errors gracefully:

```typescript
try {
  db.exec(MIGRATION_UP);
} catch (error: any) {
  // Handle duplicate column error
  if (error.message && error.message.includes('duplicate column name')) {
    console.log('✅ Column already exists');
    return;
  }

  // Re-throw unexpected errors
  throw error;
}
```

## Migration Dependencies

Some migrations depend on others. Document this clearly:

```typescript
/**
 * Migration 007: Add Account Isolation
 *
 * DEPENDENCIES:
 * - Requires migration 003 (creates tables)
 * - Must run BEFORE migration 008 (makes account_id NOT NULL)
 */
```

### Example: Migration 003 → 007 Relationship

- **Migration 003**: Creates Phase 1-3 tables WITH `account_id` from day 1
- **Migration 007**: Adds `account_id` to Phase 1-3 tables IF they were created WITHOUT it (legacy databases)

Migration 007 has defensive checks:

1. Skip if tables don't exist (migration 003 not run yet)
2. Skip if `account_id` already exists (new migration 003)
3. Only apply to databases with old migration 003

## Testing Migrations

### Unit Tests

Create tests in `__tests__/migrations.test.ts`:

```typescript
describe('Migration NNN', () => {
  it('should create tables correctly', async () => {
    const db = await createTestDb('test-nnn');

    await migrationNNN.up(db);

    assert.ok(tableExists(db, 'my_table'));
    db.close();
  });

  it('should be idempotent', async () => {
    const db = await createTestDb('test-nnn-idempotent');

    await migrationNNN.up(db);
    await migrationNNN.up(db); // Should not throw

    db.close();
  });
});
```

### Manual Testing

```bash
# Create a test database
cp ~/.canvas-memory/canvas.db ~/.canvas-memory/canvas-backup.db

# Run migration
DB_PATH=~/.canvas-memory/canvas-test.db npx tsx apps/api/src/migrations/run-migrations.ts

# Verify schema
sqlite3 ~/.canvas-memory/canvas-test.db "PRAGMA table_info(my_table);"

# Rollback if needed
DB_PATH=~/.canvas-memory/canvas-test.db npx tsx apps/api/src/migrations/run-migrations.ts --rollback NNN
```

## Rollback Strategy

### When to Rollback

- Migration caused data loss
- Migration broke existing functionality
- Need to revert to previous schema version

### How to Rollback

```bash
# Rollback a specific migration
npx tsx apps/api/src/migrations/run-migrations.ts --rollback 007
```

### Rollback Best Practices

1. **Data Safety**: Rollbacks should preserve data when possible
2. **Column Removal**: SQLite doesn't support DROP COLUMN, so rollbacks leave columns in place
3. **Manual Steps**: Complex rollbacks may require manual intervention (document this)

```typescript
export async function down(db: Database.Database): Promise<void> {
  console.log('Rolling back migration 007...');

  // Drop indexes (safe)
  db.exec(`
    DROP INDEX IF EXISTS idx_my_table_account;
  `);

  // Cannot drop columns in SQLite
  console.log('⚠️  Column removal requires manual table recreation');
  console.log('   See migration file for manual rollback steps');
}
```

## Common Patterns

### Adding a Column

```typescript
export const MIGRATION_UP = `
ALTER TABLE my_table ADD COLUMN new_column TEXT;
CREATE INDEX IF NOT EXISTS idx_my_table_new ON my_table(new_column);
`;
```

### Creating a Table

```typescript
export const MIGRATION_UP = `
CREATE TABLE IF NOT EXISTS my_new_table (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_my_new_table_account ON my_new_table(account_id);
`;
```

### Data Migration

```typescript
export async function up(db: Database.Database): Promise<void> {
  console.log('Migrating data...');

  const rows = db.prepare('SELECT id, old_column FROM my_table').all();

  const update = db.prepare('UPDATE my_table SET new_column = ? WHERE id = ?');

  const transaction = db.transaction(() => {
    for (const row of rows) {
      const newValue = transformData(row.old_column);
      update.run(newValue, row.id);
    }
  });

  transaction();

  console.log(`✅ Migrated ${rows.length} rows`);
}
```

## Troubleshooting

### Migration Failed: Table Already Exists

Use `CREATE TABLE IF NOT EXISTS` or add defensive checks.

### Migration Failed: Column Already Exists

Add column existence check before ALTER TABLE:

```typescript
const columns = db.prepare('PRAGMA table_info(my_table)').all();
const hasColumn = columns.some((col) => col.name === 'new_column');

if (!hasColumn) {
  db.exec('ALTER TABLE my_table ADD COLUMN new_column TEXT');
}
```

### Migration Tracking Out of Sync

The migrations table tracks what's been applied:

```sql
-- View applied migrations
SELECT * FROM migrations ORDER BY version;

-- Manually mark migration as applied (use with caution)
INSERT INTO migrations (version, name, applied_at)
VALUES ('007', 'migration_007', strftime('%s','now') * 1000);

-- Manually mark migration as NOT applied
DELETE FROM migrations WHERE version = '007';
```

## See Also

- [Architecture: Database Migrations](../../../docs/architecture/MIGRATIONS.md)
- [Migration 003: Grouping Engine Schema](./003_grouping_engine_schema.ts)
- [Migration 007: Account Isolation](./007_add_account_isolation_to_phase1_tables.ts)
- [Backfill Script](../../../scripts/backfill-account-ids.ts)
