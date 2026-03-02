import fs from 'fs';
import os from 'os';
import path from 'path';

type ConfigShape = {
  storageMode?: string;
  database?: {
    local?: {
      path?: string;
      autoBackup?: boolean;
      verbose?: boolean;
    };
    cloud?: unknown;
  };
  [key: string]: unknown;
};

const dryRun = process.argv.includes('--dry-run');
const homeDir = os.homedir();
const baseDir = path.join(homeDir, '.keimenon');
const configPath = path.join(baseDir, 'config.json');
const sqlitePath = path.join(baseDir, 'keimenon.db');

function log(msg: string): void {
  // Keep script output deterministic for automation.
  process.stdout.write(`${msg}\n`);
}

function ensureDir(): void {
  if (!fs.existsSync(baseDir)) {
    if (dryRun) {
      log(`[dry-run] Would create directory: ${baseDir}`);
      return;
    }
    fs.mkdirSync(baseDir, { recursive: true });
    log(`Created directory: ${baseDir}`);
  }
}

function loadConfig(): ConfigShape {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as ConfigShape;
}

function buildLocalOnlyConfig(input: ConfigShape): ConfigShape {
  const local = input.database?.local ?? {};
  return {
    ...input,
    storageMode: 'local',
    database: {
      local: {
        path: local.path ?? sqlitePath,
        autoBackup: local.autoBackup ?? true,
        verbose: local.verbose ?? false,
      },
    },
  };
}

function saveConfig(config: ConfigShape): void {
  const payload = `${JSON.stringify(config, null, 2)}\n`;
  if (dryRun) {
    log(`[dry-run] Would write config to ${configPath}`);
    log(payload.trimEnd());
    return;
  }
  fs.writeFileSync(configPath, payload, 'utf8');
  log(`Wrote local-only config: ${configPath}`);
}

function main(): void {
  ensureDir();
  const current = loadConfig();
  const nextConfig = buildLocalOnlyConfig(current);
  saveConfig(nextConfig);

  if (dryRun) {
    log('[dry-run] Migration simulation complete.');
  } else {
    log('Migration complete. Storage mode is now local-only.');
  }
}

main();
