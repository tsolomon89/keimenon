#!/usr/bin/env node

/**
 * Restore the Keimenon database from a backup
 * Usage: npm run restore -- --file <backup-file>
 * Options:
 *   --file <path>    - Path to backup file (required)
 *   --no-backup      - Don't create safety backup before restoring
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const DEFAULT_DB_PATH = path.join(os.homedir(), '.keimenon', 'keimenon.db');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    noBackup: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && i + 1 < args.length) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--no-backup') {
      options.noBackup = true;
    }
  }

  return options;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function askConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message + ' (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  const options = parseArgs();

  console.log('♻️  Keimenon Database Restore\n');

  // Validate backup file
  if (!options.file) {
    console.error('❌ Error: Backup file is required');
    console.error('\n💡 Usage:');
    console.error('   npm run restore -- --file <path-to-backup>');
    console.error('\n📚 List backups:');
    console.error('   ls ~/.keimenon/backups/');
    process.exit(1);
  }

  let backupPath = options.file;

  // Handle compressed backups
  const isCompressed = backupPath.endsWith('.gz');
  if (isCompressed) {
    console.log('🗜️  Detected compressed backup, decompressing...');

    const zlib = require('zlib');
    const tempPath = backupPath.replace('.gz', '');

    const source = fs.createReadStream(backupPath);
    const destination = fs.createWriteStream(tempPath);
    const gunzip = zlib.createGunzip();

    await new Promise((resolve, reject) => {
      source.pipe(gunzip).pipe(destination).on('finish', resolve).on('error', reject);
    });

    backupPath = tempPath;
    console.log('✅ Decompressed to:', tempPath);
  }

  if (!fs.existsSync(backupPath)) {
    console.error('❌ Backup file not found:', backupPath);
    process.exit(1);
  }

  const backupStats = fs.statSync(backupPath);
  console.log(`📊 Backup file: ${backupPath}`);
  console.log(`   Size: ${formatBytes(backupStats.size)}`);
  console.log(`   Created: ${backupStats.mtime.toLocaleString()}\n`);

  // Check current database
  let currentSize = 0;
  if (fs.existsSync(DEFAULT_DB_PATH)) {
    const currentStats = fs.statSync(DEFAULT_DB_PATH);
    currentSize = currentStats.size;
    console.log(`⚠️  Current database will be replaced!`);
    console.log(`   Current size: ${formatBytes(currentStats.size)}`);
    console.log(`   Current modified: ${currentStats.mtime.toLocaleString()}\n`);

    // Ask for confirmation
    const confirmed = await askConfirmation('⚠️  Are you sure you want to restore from backup?');
    if (!confirmed) {
      console.log('❌ Restore cancelled');

      // Clean up temp file if we decompressed
      if (isCompressed && backupPath !== options.file) {
        fs.unlinkSync(backupPath);
      }

      process.exit(0);
    }

    // Create safety backup unless disabled
    if (!options.noBackup) {
      const safetyBackup = DEFAULT_DB_PATH + '.before-restore';
      console.log('\n💾 Creating safety backup of current database...');
      fs.copyFileSync(DEFAULT_DB_PATH, safetyBackup);
      console.log(`✅ Safety backup created: ${safetyBackup}`);
    }
  } else {
    console.log('📝 No existing database found, creating new one from backup\n');
  }

  // Restore database
  console.log('\n♻️  Restoring database...');
  try {
    fs.copyFileSync(backupPath, DEFAULT_DB_PATH);

    const restoredStats = fs.statSync(DEFAULT_DB_PATH);
    console.log(`✅ Database restored successfully!`);
    console.log(`   Location: ${DEFAULT_DB_PATH}`);
    console.log(`   Size: ${formatBytes(restoredStats.size)}\n`);

    if (currentSize > 0) {
      const diff = restoredStats.size - currentSize;
      const diffStr = diff > 0 ? `+${formatBytes(diff)}` : formatBytes(diff);
      console.log(`📊 Size change: ${diffStr}`);
    }

    console.log('\n✅ Restore complete! Start the API server to use the restored database:');
    console.log('   cd apps/api && npm run dev');

    // Clean up temp file if we decompressed
    if (isCompressed && backupPath !== options.file) {
      fs.unlinkSync(backupPath);
    }
  } catch (error) {
    console.error('❌ Restore failed:', error.message);

    // Try to restore safety backup if it exists
    const safetyBackup = DEFAULT_DB_PATH + '.before-restore';
    if (fs.existsSync(safetyBackup)) {
      console.log('\n⚠️  Attempting to restore from safety backup...');
      try {
        fs.copyFileSync(safetyBackup, DEFAULT_DB_PATH);
        console.log('✅ Original database restored from safety backup');
      } catch (restoreError) {
        console.error('❌ Failed to restore safety backup:', restoreError.message);
      }
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
