import Database from 'better-sqlite3';

/**
 * Migration 006: Settings Schema
 * JSON-driven configuration with scope hierarchy
 */
export function up(db: Database.Database): void {
  console.log('Running migration 006: Settings Schema');

  // Settings configuration table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      control_id TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('defaults', 'org', 'workspace', 'role', 'user', 'view', 'component')),
      scope_id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(control_id, scope, scope_id)
    );

    CREATE INDEX IF NOT EXISTS idx_settings_config_control ON settings_config(control_id);
    CREATE INDEX IF NOT EXISTS idx_settings_config_scope ON settings_config(scope, scope_id);
  `);

  // Settings change history
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings_changes (
      id TEXT PRIMARY KEY,
      control_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL,
      changed_at INTEGER NOT NULL,
      reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_settings_changes_control ON settings_changes(control_id);
    CREATE INDEX IF NOT EXISTS idx_settings_changes_scope ON settings_changes(scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_settings_changes_time ON settings_changes(changed_at DESC);
  `);

  console.log('✓ Settings schema created');
}

export function down(db: Database.Database): void {
  console.log('Rolling back migration 006: Settings Schema');

  db.exec(`
    DROP TABLE IF EXISTS settings_config;
    DROP TABLE IF EXISTS settings_changes;
  `);

  console.log('✓ Settings schema removed');
}
