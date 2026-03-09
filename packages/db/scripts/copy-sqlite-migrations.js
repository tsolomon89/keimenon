const fs = require('fs/promises');
const path = require('path');

async function copySqliteMigrations() {
  const packageRoot = path.resolve(__dirname, '..');
  const sourceDir = path.join(packageRoot, 'src', 'sqlite', 'migrations');
  const destDir = path.join(packageRoot, 'dist', 'sqlite', 'migrations');

  await fs.mkdir(destDir, { recursive: true });

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'));

  await Promise.all(
    sqlFiles.map((file) =>
      fs.copyFile(path.join(sourceDir, file.name), path.join(destDir, file.name))
    )
  );

  console.log(`[copy-sqlite-migrations] Copied ${sqlFiles.length} migration file(s)`);
}

copySqliteMigrations().catch((error) => {
  console.error('[copy-sqlite-migrations] Failed to copy SQLite migrations:', error);
  process.exitCode = 1;
});
