#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { REQUIRED_NODE_MAJOR, isRequiredNodeVersion } = require('./project-node-runtime');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    output: null,
    compress: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--output' && args[index + 1]) {
      options.output = args[index + 1];
      index += 1;
    } else if (args[index] === '--compress') {
      options.compress = true;
    }
  }

  return options;
}

function resolveDatabasePath() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const localDocsPath =
    process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || path.join(homeDir, '.keimenon');
  return process.env.SQLITE_PATH?.replace('~', homeDir) || path.join(localDocsPath, 'keimenon.db');
}

function resolveBackupDirectory(databasePath) {
  const explicitDir = process.env.SQLITE_BACKUP_DIR;
  if (explicitDir) {
    return explicitDir;
  }

  return path.join(path.dirname(databasePath), 'backups');
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** exponent;
  return `${Math.round(value * 100) / 100} ${units[exponent]}`;
}

function formatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function compressFile(filePath) {
  const compressedPath = `${filePath}.gz`;

  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(zlib.createGzip())
      .pipe(fs.createWriteStream(compressedPath))
      .on('finish', resolve)
      .on('error', reject);
  });

  const sourceSize = fs.statSync(filePath).size;
  const compressedSize = fs.statSync(compressedPath).size;
  fs.unlinkSync(filePath);

  return {
    path: compressedPath,
    sourceSize,
    compressedSize,
  };
}

async function main() {
  if (!isRequiredNodeVersion()) {
    console.error(
      `[sqlite-backup] Node ${REQUIRED_NODE_MAJOR}.x is required. Active: v${process.versions.node}`
    );
    process.exit(1);
  }

  const options = parseArgs();
  const databasePath = resolveDatabasePath();

  if (!fs.existsSync(databasePath)) {
    console.error(`[sqlite-backup] Database not found: ${databasePath}`);
    process.exit(1);
  }

  const backupDirectory = resolveBackupDirectory(databasePath);
  fs.mkdirSync(backupDirectory, { recursive: true });

  const defaultBackupName = `keimenon-${formatTimestamp()}.db`;
  const backupPath = options.output || path.join(backupDirectory, defaultBackupName);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });

  const sourceStats = fs.statSync(databasePath);
  console.log(`[sqlite-backup] database=${databasePath}`);
  console.log(`[sqlite-backup] source_size=${formatBytes(sourceStats.size)}`);
  console.log(`[sqlite-backup] destination=${backupPath}`);

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });

  try {
    await db.backup(backupPath);
  } finally {
    db.close();
  }

  let finalPath = backupPath;
  let finalSize = fs.statSync(backupPath).size;

  if (options.compress) {
    const compressed = await compressFile(backupPath);
    finalPath = compressed.path;
    finalSize = compressed.compressedSize;
  }

  console.log(`[sqlite-backup] backup_created=${finalPath}`);
  console.log(`[sqlite-backup] backup_size=${formatBytes(finalSize)}`);
}

main().catch((error) => {
  console.error(`[sqlite-backup] ${error.message}`);
  process.exit(1);
});
