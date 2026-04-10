#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  resolveRuntimePaths,
  getKnownDatabaseCandidates,
  getExistingDatabaseCandidates,
} = require('./runtime-paths');

const RUNTIME_SUBDIRECTORIES = [
  'documents',
  'metadata',
  'agent-artifacts',
  'uploads',
  'temp',
  'storage',
];

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isPathInside(targetPath, basePath) {
  const target = path.resolve(targetPath);
  const base = path.resolve(basePath);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function assertSafeDeleteTarget(targetPath, allowedRoots) {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  if (resolved === root) {
    throw new Error(`Refusing to delete filesystem root: ${resolved}`);
  }

  const allowed = allowedRoots.some((allowedRoot) => isPathInside(resolved, allowedRoot));
  if (!allowed) {
    throw new Error(`Refusing to delete outside allowed roots: ${resolved}`);
  }
}

async function ensureDirectory(directoryPath) {
  await fsp.mkdir(directoryPath, { recursive: true });
}

async function copyIfExists(sourcePath, targetPath) {
  const sourceStat = await fsp.stat(sourcePath).catch(() => null);
  if (!sourceStat) {
    return false;
  }

  if (sourceStat.isDirectory() && isPathInside(targetPath, sourcePath)) {
    return false;
  }

  await ensureDirectory(path.dirname(targetPath));
  if (sourceStat.isDirectory()) {
    await fsp.cp(sourcePath, targetPath, { recursive: true });
  } else {
    await fsp.copyFile(sourcePath, targetPath);
  }
  return true;
}

function createBackupPlan(runtimePaths, knownDbPaths) {
  const canonicalDbPath = runtimePaths.dbPath;
  const canonicalRoot = runtimePaths.localDocsRoot;
  const dbFiles = knownDbPaths.flatMap((dbPath) => {
    const related = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    return related;
  });

  const runtimeRoots = [
    canonicalRoot,
    ...knownDbPaths
      .filter((dbPath) => dbPath !== canonicalDbPath)
      .map((dbPath) => path.dirname(dbPath)),
  ];

  return {
    dbFiles: [...new Set(dbFiles.map((target) => path.resolve(target)))],
    runtimeRoots: [...new Set(runtimeRoots.map((target) => path.resolve(target)))],
  };
}

async function backupPaths(backupRoot, plan) {
  const backedUp = {
    files: [],
    directories: [],
  };

  for (const dbFilePath of plan.dbFiles) {
    const relative = path.join('db-files', dbFilePath.replace(/[:\\]/g, '_'));
    const target = path.join(backupRoot, relative);
    const copied = await copyIfExists(dbFilePath, target);
    if (copied) {
      backedUp.files.push(dbFilePath);
    }
  }

  for (const runtimeRoot of plan.runtimeRoots) {
    for (const directoryName of RUNTIME_SUBDIRECTORIES) {
      const source = path.join(runtimeRoot, directoryName);
      const relative = path.join('runtime', runtimeRoot.replace(/[:\\]/g, '_'), directoryName);
      const target = path.join(backupRoot, relative);
      const copied = await copyIfExists(source, target);
      if (copied) {
        backedUp.directories.push(source);
      }
    }
  }

  return backedUp;
}

function runCanonicalFactoryReset(runtimePaths) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const resetTimeoutMs = Number(process.env.GLOBAL_SWEEP_RESET_TIMEOUT_MS || 3600000);

  console.log('[factory-reset-global-sweep] running canonical full-fresh reset...');

  const result = spawnSync(
    process.execPath,
    [tsxCli, 'apps/api/src/scripts/factory-reset.ts', '--mode=full-fresh'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        SQLITE_PATH: runtimePaths.dbPath,
        LOCAL_DOCS_PATH: runtimePaths.localDocsRoot,
        STORAGE_PATH: runtimePaths.storagePath,
      },
      stdio: 'inherit',
      timeout: resetTimeoutMs,
      killSignal: 'SIGTERM',
    }
  );

  if (result.error && result.error.code === 'ETIMEDOUT') {
    throw new Error(
      `factory-reset timed out after ${Math.round(resetTimeoutMs / 1000)}s. Stop running dev processes (npm run dev:stop) and retry.`
    );
  }

  if (typeof result.status !== 'number' || result.status !== 0) {
    throw new Error(`factory-reset failed with status ${result.status ?? 'unknown'}`);
  }
}

async function purgeStaleLocations(runtimePaths, staleDbs) {
  const staleRoots = [...new Set(staleDbs.map((dbPath) => path.dirname(dbPath)))].filter(
    (rootPath) => path.resolve(rootPath) !== path.resolve(runtimePaths.localDocsRoot)
  );
  const repoRoot = path.resolve(__dirname, '..', '..');
  const allowedRoots = [os.homedir(), repoRoot];
  const removed = {
    dbFiles: [],
    runtimeDirectories: [],
  };

  for (const dbPath of staleDbs) {
    const targets = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const targetPath of targets) {
      const exists = await fsp.stat(targetPath).catch(() => null);
      if (!exists) {
        continue;
      }
      assertSafeDeleteTarget(targetPath, allowedRoots);
      await fsp.rm(targetPath, { force: true });
      removed.dbFiles.push(targetPath);
    }
  }

  for (const runtimeRoot of staleRoots) {
    for (const directoryName of RUNTIME_SUBDIRECTORIES) {
      const targetPath = path.join(runtimeRoot, directoryName);
      const exists = await fsp.stat(targetPath).catch(() => null);
      if (!exists || !exists.isDirectory()) {
        continue;
      }
      assertSafeDeleteTarget(targetPath, allowedRoots);
      await fsp.rm(targetPath, { recursive: true, force: true });
      removed.runtimeDirectories.push(targetPath);
    }
  }

  return removed;
}

async function main() {
  const runtimePaths = resolveRuntimePaths();
  const knownDbCandidates = getKnownDatabaseCandidates(runtimePaths.dbPath);
  const existingDbCandidates = getExistingDatabaseCandidates(runtimePaths.dbPath);
  const staleDbs = existingDbCandidates.filter((dbPath) => dbPath !== runtimePaths.dbPath);

  const backupDirectory = path.join(
    runtimePaths.localDocsRoot,
    'maintenance-backups',
    'global-sweep',
    nowStamp()
  );

  await ensureDirectory(backupDirectory);

  const backupPlan = createBackupPlan(runtimePaths, knownDbCandidates);
  console.log('[factory-reset-global-sweep] backing up known database and runtime paths...');
  const backedUp = await backupPaths(backupDirectory, backupPlan);

  await fsp.writeFile(
    path.join(backupDirectory, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runtimePaths,
        knownDbCandidates,
        existingDbCandidates,
        staleDbs,
        backupPlan,
        backedUp,
      },
      null,
      2
    )
  );

  runCanonicalFactoryReset(runtimePaths);
  console.log('[factory-reset-global-sweep] purging stale non-canonical database/runtime paths...');
  const removed = await purgeStaleLocations(runtimePaths, staleDbs);

  console.log('[factory-reset-global-sweep] complete');
  console.log(`- backup directory: ${backupDirectory}`);
  console.log(`- canonical reset database: ${runtimePaths.dbPath}`);
  console.log(`- stale db files removed: ${removed.dbFiles.length}`);
  console.log(`- stale runtime directories removed: ${removed.runtimeDirectories.length}`);
}

main().catch((error) => {
  console.error(
    `[factory-reset-global-sweep] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
