#!/usr/bin/env node

/**
 * Backup the Canvas Memory database
 * Usage: npm run backup
 * Options:
 *   --output <path>  - Custom backup location
 *   --compress       - Compress backup with gzip
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_DB_PATH = path.join(os.homedir(), '.canvas-memory', 'canvas.db');
const DEFAULT_BACKUP_DIR = path.join(os.homedir(), '.canvas-memory', 'backups');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    output: null,
    compress: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      options.output = args[i + 1];
      i++;
    } else if (args[i] === '--compress') {
      options.compress = true;
    }
  }

  return options;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function main() {
  const options = parseArgs();

  console.log('💾 Canvas Memory Database Backup\n');

  // Check if database exists
  if (!fs.existsSync(DEFAULT_DB_PATH)) {
    console.error('❌ Database not found at:', DEFAULT_DB_PATH);
    console.error('\n💡 Hint: Start the API server first to create the database:');
    console.error('   cd apps/api && npm run dev');
    process.exit(1);
  }

  // Get database info
  const dbStats = fs.statSync(DEFAULT_DB_PATH);
  console.log(`📊 Database: ${DEFAULT_DB_PATH}`);
  console.log(`   Size: ${formatBytes(dbStats.size)}`);
  console.log(`   Modified: ${dbStats.mtime.toLocaleString()}\n`);

  // Create backup directory if needed
  if (!fs.existsSync(DEFAULT_BACKUP_DIR)) {
    fs.mkdirSync(DEFAULT_BACKUP_DIR, { recursive: true });
    console.log(`📁 Created backup directory: ${DEFAULT_BACKUP_DIR}`);
  }

  // Generate backup filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
  const dateStr = timestamp[0];
  const timeStr = timestamp[1].split('-')[0]; // HH-MM-SS
  const backupFilename = `canvas-${dateStr}_${timeStr}.db`;

  const backupPath = options.output || path.join(DEFAULT_BACKUP_DIR, backupFilename);

  // Copy database file
  console.log(`📋 Creating backup...`);
  try {
    fs.copyFileSync(DEFAULT_DB_PATH, backupPath);
    const backupStats = fs.statSync(backupPath);

    console.log(`✅ Backup created successfully!`);
    console.log(`   Location: ${backupPath}`);
    console.log(`   Size: ${formatBytes(backupStats.size)}\n`);

    // Compress if requested
    if (options.compress) {
      console.log('🗜️  Compressing backup...');
      const zlib = require('zlib');
      const gzip = zlib.createGzip();
      const source = fs.createReadStream(backupPath);
      const destination = fs.createWriteStream(backupPath + '.gz');

      await new Promise((resolve, reject) => {
        source.pipe(gzip).pipe(destination)
          .on('finish', resolve)
          .on('error', reject);
      });

      // Remove uncompressed version
      fs.unlinkSync(backupPath);

      const compressedStats = fs.statSync(backupPath + '.gz');
      const ratio = Math.round((1 - compressedStats.size / backupStats.size) * 100);

      console.log(`✅ Compressed backup created!`);
      console.log(`   Location: ${backupPath}.gz`);
      console.log(`   Size: ${formatBytes(compressedStats.size)} (${ratio}% smaller)\n`);
    }

    // List recent backups
    const backups = fs.readdirSync(DEFAULT_BACKUP_DIR)
      .filter(f => f.startsWith('canvas-') && (f.endsWith('.db') || f.endsWith('.db.gz')))
      .map(f => {
        const stats = fs.statSync(path.join(DEFAULT_BACKUP_DIR, f));
        return { name: f, size: stats.size, mtime: stats.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (backups.length > 0) {
      console.log(`📚 Recent backups (${backups.length} total):`);
      backups.slice(0, 5).forEach((backup, i) => {
        const age = Math.floor((Date.now() - backup.mtime) / 1000 / 60);
        const ageStr = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;
        console.log(`   ${i + 1}. ${backup.name} (${formatBytes(backup.size)}) - ${ageStr}`);
      });

      if (backups.length > 5) {
        console.log(`   ... and ${backups.length - 5} more`);
      }
    }

    console.log('\n💡 Restore with:');
    console.log(`   npm run restore -- --file "${backupPath}"`);

  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
