#!/usr/bin/env node

/**
 * validate-env.js
 * Validate local-first environment configuration.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

async function validateApiEnv() {
  const errors = [];
  const warnings = [];

  const envPath = path.join(__dirname, '../apps/api/.env');
  if (!fs.existsSync(envPath)) {
    errors.push('apps/api/.env not found. Copy from .env.example');
    return { valid: false, errors, warnings };
  }

  const env = parseEnvFile(envPath);
  const storageMode = env.STORAGE_MODE || 'local';

  if (storageMode !== 'local') {
    errors.push(`STORAGE_MODE='${storageMode}' is unsupported. Use STORAGE_MODE=local`);
  }

  if (!env.LOCAL_DOCS_PATH) {
    errors.push('LOCAL_DOCS_PATH not configured');
  }

  if (!env.SQLITE_PATH) {
    errors.push('SQLITE_PATH not configured');
  }

  const port = parseInt(env.PORT || '4001', 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    warnings.push(`PORT ${env.PORT} is unusual (expected 1024-65535)`);
  }

  const storagePath = env.STORAGE_PATH || './storage';
  const storageFullPath = path.resolve(__dirname, '../apps/api', storagePath);

  if (!fs.existsSync(storageFullPath)) {
    warnings.push(`STORAGE_PATH ${storagePath} does not exist (will be created)`);
  } else {
    try {
      const testFile = path.join(storageFullPath, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch {
      errors.push(`STORAGE_PATH ${storagePath} is not writable`);
    }
  }

  const maxSize = parseInt(env.MAX_FILE_SIZE_MB || '10', 10);
  if (isNaN(maxSize) || maxSize < 1 || maxSize > 2048) {
    warnings.push(`MAX_FILE_SIZE_MB ${env.MAX_FILE_SIZE_MB} is unusual (expected 1-2048)`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateWebEnv() {
  const errors = [];
  const warnings = [];

  const envPath = path.join(__dirname, '../apps/web/.env.local');
  if (!fs.existsSync(envPath)) {
    errors.push('apps/web/.env.local not found. Copy from .env.example');
    return { valid: false, errors, warnings };
  }

  const env = parseEnvFile(envPath);

  if (!env.NEXT_PUBLIC_API_URL) {
    errors.push('NEXT_PUBLIC_API_URL not configured');
  } else {
    try {
      new URL(env.NEXT_PUBLIC_API_URL);
    } catch {
      errors.push('NEXT_PUBLIC_API_URL is not a valid URL');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim();
    }
  }

  return env;
}

function validateNodeVersion() {
  const errors = [];
  const warnings = [];

  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

  if (majorVersion !== 22) {
    errors.push(`Node.js ${nodeVersion} is unsupported (required: 22.x)`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateNpmVersion() {
  const errors = [];
  const warnings = [];

  try {
    const { execSync } = require('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseInt(npmVersion.split('.')[0], 10);

    if (majorVersion < 9) {
      errors.push(`npm ${npmVersion} is too old (required: >=9.0.0)`);
    }
  } catch {
    errors.push('npm not found in PATH');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateDependencies() {
  const errors = [];
  const warnings = [];

  const rootNodeModules = path.join(__dirname, '../node_modules');
  if (!fs.existsSync(rootNodeModules)) {
    errors.push('Dependencies not installed. Run: npm install');
  }

  for (const workspace of ['apps/api', 'apps/web']) {
    const nodeModules = path.join(__dirname, '..', workspace, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      warnings.push(`${workspace}/node_modules not found (workspace install may be needed)`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateAll(options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    console.log('Validating environment...\n');
  }

  const results = {
    node: validateNodeVersion(),
    npm: validateNpmVersion(),
    dependencies: validateDependencies(),
    api: await validateApiEnv(),
    web: await validateWebEnv(),
  };

  const allErrors = [];
  const allWarnings = [];

  for (const [name, result] of Object.entries(results)) {
    if (result.errors.length > 0) {
      if (verbose) {
        console.log(`FAIL ${name.toUpperCase()}`);
        result.errors.forEach((err) => console.log(`  - ${err}`));
      }
      allErrors.push(...result.errors.map((e) => `[${name}] ${e}`));
    } else if (verbose) {
      console.log(`OK   ${name.toUpperCase()}`);
    }

    if (result.warnings.length > 0) {
      if (verbose) {
        result.warnings.forEach((warn) => console.log(`  WARN ${warn}`));
      }
      allWarnings.push(...result.warnings.map((w) => `[${name}] ${w}`));
    }
  }

  if (verbose) {
    console.log('');
    if (allErrors.length === 0) {
      console.log('Environment validation passed');
      if (allWarnings.length > 0) {
        console.log(`Warnings: ${allWarnings.length}`);
      }
    } else {
      console.log(`Environment validation failed (${allErrors.length} error(s))`);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

if (require.main === module) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  validateAll({ verbose })
    .then((result) => {
      if (!verbose && result.errors.length > 0) {
        console.error('Environment validation failed:\n');
        result.errors.forEach((err) => console.error(`  - ${err}`));
        console.error('\nRun with --verbose for details');
      }

      process.exit(result.valid ? 0 : 1);
    })
    .catch((error) => {
      console.error('Validation error:', error.message);
      process.exit(2);
    });
}

module.exports = {
  validateAll,
  validateApiEnv,
  validateWebEnv,
  validateNodeVersion,
  validateNpmVersion,
  validateDependencies,
};
