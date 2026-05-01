import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export interface MigrationRecord {
  id: number;
  version: string;
  name: string;
  applied_at: number;
  checksum?: string;
}

interface MigrationFile {
  version: string;
  name: string;
  path: string;
}

const DESTRUCTIVE_MIGRATION_PREFIXES = ['026_', '027_', '040_'];

export class MigrationRunner {
  constructor(
    private db: Database.Database,
    private migrationsDir?: string
  ) {}

  async runPendingMigrations(): Promise<void> {
    this.ensureMigrationsTable();

    const applied = this.getAppliedMigrations();
    const available = await this.getAvailableMigrations();
    const appliedNames = new Set(applied.map((migration) => migration.name));
    const pending = available.filter((migration) => !appliedNames.has(migration.name));

    if (pending.length === 0) {
      console.log('[MigrationRunner] No pending migrations');
      return;
    }

    await this.backupDatabaseIfNeeded(pending);

    for (const migration of pending) {
      await this.runMigration(migration);
    }
  }

  async markAllAvailableMigrationsApplied(): Promise<void> {
    this.ensureMigrationsTable();

    const appliedNames = new Set(this.getAppliedMigrations().map((migration) => migration.name));
    const available = await this.getAvailableMigrations();

    for (const migration of available) {
      if (appliedNames.has(migration.name)) {
        continue;
      }

      const sql = await fs.readFile(migration.path, 'utf-8');
      const checksum = this.calculateChecksum(sql);
      this.recordMigration(migration, checksum);
    }
  }

  async markMigrationsAppliedThrough(maxVersionInclusive: string): Promise<void> {
    this.ensureMigrationsTable();

    const maxVersion = Number.parseInt(maxVersionInclusive, 10);
    if (!Number.isFinite(maxVersion)) {
      throw new Error(`Invalid max migration version: ${maxVersionInclusive}`);
    }

    const appliedNames = new Set(this.getAppliedMigrations().map((migration) => migration.name));
    const available = await this.getAvailableMigrations();

    for (const migration of available) {
      const migrationVersion = Number.parseInt(migration.version, 10);
      if (!Number.isFinite(migrationVersion) || migrationVersion > maxVersion) {
        continue;
      }
      if (appliedNames.has(migration.name)) {
        continue;
      }

      const sql = await fs.readFile(migration.path, 'utf-8');
      const checksum = this.calculateChecksum(sql);
      this.recordMigration(migration, checksum);
    }
  }

  hasAppliedMigrations(): boolean {
    this.ensureMigrationsTable();

    const row = this.db.prepare('SELECT COUNT(*) AS count FROM migrations').get() as
      | { count?: number }
      | undefined;

    return (row?.count ?? 0) > 0;
  }

  getMigrationStatus(): { applied: MigrationRecord[]; pending: string[] } {
    return {
      applied: this.getAppliedMigrations(),
      pending: [],
    };
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL,
        checksum TEXT
      )
    `);

    // Self-heal legacy installations that created `migrations` without
    // the full column set (notably missing `version`).
    const columns = this.db.prepare(`PRAGMA table_info(migrations)`).all() as Array<{
      name: string;
    }>;
    const columnSet = new Set(columns.map((column) => column.name));

    if (!columnSet.has('version')) {
      this.db.exec(`ALTER TABLE migrations ADD COLUMN version TEXT`);
      this.db.exec(`
        UPDATE migrations
        SET version = CASE
          WHEN instr(name, '_') > 0 THEN substr(name, 1, instr(name, '_') - 1)
          ELSE name
        END
        WHERE version IS NULL OR version = ''
      `);
    }

    if (!columnSet.has('applied_at')) {
      this.db.exec(`ALTER TABLE migrations ADD COLUMN applied_at INTEGER`);
      this.db
        .prepare(`UPDATE migrations SET applied_at = ? WHERE applied_at IS NULL`)
        .run(Date.now());
    }

    if (!columnSet.has('checksum')) {
      this.db.exec(`ALTER TABLE migrations ADD COLUMN checksum TEXT`);
    }
  }

  private getAppliedMigrations(): MigrationRecord[] {
    const stmt = this.db.prepare(
      'SELECT id, version, name, applied_at, checksum FROM migrations ORDER BY version, id'
    );

    return stmt.all() as MigrationRecord[];
  }

  private async getAvailableMigrations(): Promise<MigrationFile[]> {
    const migrationsDir = this.migrationsDir || path.join(__dirname, 'migrations');
    let files: string[];

    try {
      files = await fs.readdir(migrationsDir);
    } catch (error: any) {
      throw new Error(
        `SQLite migrations directory is missing or unreadable: ${migrationsDir} (${error.message})`
      );
    }

    const sqlFiles = files
      .filter((file) => file.endsWith('.sql'))
      .sort((left, right) => {
        const leftVersion = parseInt(left.split('_')[0], 10);
        const rightVersion = parseInt(right.split('_')[0], 10);
        return leftVersion - rightVersion;
      });

    if (sqlFiles.length === 0) {
      throw new Error(`No SQLite migration files found in ${migrationsDir}`);
    }

    return sqlFiles.map((file) => ({
      version: file.split('_')[0],
      name: file,
      path: path.join(migrationsDir, file),
    }));
  }

  private async backupDatabaseIfNeeded(pendingMigrations: MigrationFile[]): Promise<void> {
    const needsBackup = pendingMigrations.some((migration) =>
      DESTRUCTIVE_MIGRATION_PREFIXES.some((prefix) => migration.name.startsWith(prefix))
    );

    if (!needsBackup) {
      return;
    }

    const databasePath = this.getDatabasePath();
    if (!databasePath) {
      console.warn('[MigrationRunner] Skipping pre-migration backup for non-file database');
      return;
    }

    try {
      await fs.access(databasePath);
    } catch {
      console.warn(
        `[MigrationRunner] Skipping pre-migration backup because database file does not exist: ${databasePath}`
      );
      return;
    }

    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (error: any) {
      console.warn(
        `[MigrationRunner] WAL checkpoint before backup failed: ${error.message ?? error}`
      );
    }

    const parsed = path.parse(databasePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      parsed.dir,
      `${parsed.name}.pre-migration-${timestamp}${parsed.ext || '.db'}`
    );

    await fs.copyFile(databasePath, backupPath);
    console.log(`[MigrationRunner] Created pre-migration backup at ${backupPath}`);
  }

  private getDatabasePath(): string | null {
    const databasePath = (this.db as any).name;

    if (!databasePath || databasePath === ':memory:' || databasePath.startsWith('file:')) {
      return null;
    }

    return databasePath;
  }

  private async runMigration(migration: MigrationFile): Promise<void> {
    const sql = await fs.readFile(migration.path, 'utf-8');
    const checksum = this.calculateChecksum(sql);

    try {
      const applyMigration = this.db.transaction(() => {
        this.db.exec(sql);
        this.recordMigration(migration, checksum);
      });

      applyMigration();
      console.log(`[MigrationRunner] Applied ${migration.name}`);
    } catch (error: any) {
      if (this.isIdempotentMigrationError(error)) {
        this.recordMigration(migration, checksum);
        console.warn(
          `[MigrationRunner] ${migration.name} appears already applied (${error.message}). Recording migration.`
        );
        return;
      }

      throw new Error(`Migration ${migration.name} failed: ${error.message}`);
    }
  }

  private recordMigration(migration: MigrationFile, checksum: string): void {
    this.db
      .prepare(
        `
          INSERT OR IGNORE INTO migrations (version, name, applied_at, checksum)
          VALUES (?, ?, ?, ?)
        `
      )
      .run(migration.version, migration.name, Date.now(), checksum);
  }

  private calculateChecksum(sql: string): string {
    return createHash('sha256').update(sql).digest('hex');
  }

  private isIdempotentMigrationError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('duplicate column name') ||
      message.includes('already exists') ||
      message.includes('duplicate index name')
    );
  }
}
