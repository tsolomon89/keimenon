#!/usr/bin/env node

/**
 * validate-env.js
 * Validate environment configuration for Keimenon
 * Checks required variables, formats, and accessibility
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * Validate API environment
 */
async function validateApiEnv() {
  const errors = [];
  const warnings = [];

  // Load .env file
  const envPath = path.join(__dirname, '../apps/api/.env');

  if (!fs.existsSync(envPath)) {
    errors.push('apps/api/.env not found. Copy from .env.example');
    return { valid: false, errors, warnings };
  }

  const env = parseEnvFile(envPath);

  // Check storage mode
  const storageMode = env.STORAGE_MODE || 'local';

  // Only validate Neo4j if not in local mode
  if (storageMode !== 'local') {
    // Required variables for Neo4j mode
    const required = {
      NEO4J_URI: 'Neo4j connection URI',
      NEO4J_USER: 'Neo4j username',
      NEO4J_PASSWORD: 'Neo4j password',
    };

    for (const [key, description] of Object.entries(required)) {
      if (!env[key] || env[key] === 'your_password' || env[key] === 'your_secret_key_here') {
        errors.push(`${key} not configured (${description})`);
      }
    }

    // Validate Neo4j URI format
    const validProtocols = ['bolt://', 'neo4j://', 'neo4j+s://', 'neo4j+ssc://'];
    const hasValidProtocol = validProtocols.some(
      (proto) => env.NEO4J_URI && env.NEO4J_URI.startsWith(proto)
    );

    if (env.NEO4J_URI && !hasValidProtocol) {
      errors.push('NEO4J_URI must start with bolt://, neo4j://, neo4j+s://, or neo4j+ssc://');
    }
  }

  // Validate port
  const port = parseInt(env.PORT || '4001');
  if (isNaN(port) || port < 1024 || port > 65535) {
    warnings.push(`PORT ${env.PORT} is unusual (expected 1024-65535)`);
  }

  // Check storage path
  const storagePath = env.STORAGE_PATH || './storage';
  const storageFullPath = path.resolve(__dirname, '../apps/api', storagePath);

  if (!fs.existsSync(storageFullPath)) {
    warnings.push(`STORAGE_PATH ${storagePath} does not exist (will be created)`);
  } else {
    // Check if writable
    try {
      const testFile = path.join(storageFullPath, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      errors.push(`STORAGE_PATH ${storagePath} is not writable`);
    }
  }

  // Validate max file size
  const maxSize = parseInt(env.MAX_FILE_SIZE_MB || '10');
  if (isNaN(maxSize) || maxSize < 1 || maxSize > 2048) {
    warnings.push(`MAX_FILE_SIZE_MB ${env.MAX_FILE_SIZE_MB} is unusual (expected 1-2048)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate Web environment
 */
async function validateWebEnv() {
  const errors = [];
  const warnings = [];

  // Load .env.local file
  const envPath = path.join(__dirname, '../apps/web/.env.local');

  if (!fs.existsSync(envPath)) {
    errors.push('apps/web/.env.local not found. Copy from .env.example');
    return { valid: false, errors, warnings };
  }

  const env = parseEnvFile(envPath);

  // Required variables
  if (!env.NEXT_PUBLIC_API_URL) {
    errors.push('NEXT_PUBLIC_API_URL not configured');
  } else {
    // Validate URL format
    try {
      new URL(env.NEXT_PUBLIC_API_URL);
    } catch (error) {
      errors.push('NEXT_PUBLIC_API_URL is not a valid URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse .env file into object
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=value
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      env[key] = value;
    }
  }

  return env;
}

/**
 * Validate Node.js version
 */
function validateNodeVersion() {
  const errors = [];
  const warnings = [];

  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (majorVersion < 18) {
    errors.push(`Node.js ${nodeVersion} is too old (required: >=18.0.0)`);
  } else if (majorVersion < 20) {
    warnings.push(`Node.js ${nodeVersion} works but >=20.0.0 recommended`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate npm version
 */
function validateNpmVersion() {
  const errors = [];
  const warnings = [];

  try {
    const { execSync } = require('child_process');
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseInt(npmVersion.split('.')[0]);

    if (majorVersion < 9) {
      errors.push(`npm ${npmVersion} is too old (required: >=9.0.0)`);
    }
  } catch (error) {
    errors.push('npm not found in PATH');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if dependencies are installed
 */
function validateDependencies() {
  const errors = [];
  const warnings = [];

  // Check root node_modules
  const rootNodeModules = path.join(__dirname, '../node_modules');
  if (!fs.existsSync(rootNodeModules)) {
    errors.push('Dependencies not installed. Run: npm install');
  }

  // Check workspace node_modules
  const workspaces = ['apps/api', 'apps/web'];
  for (const workspace of workspaces) {
    const nodeModules = path.join(__dirname, '..', workspace, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
      warnings.push(`${workspace}/node_modules not found (may need npm install)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run all validations
 */
async function validateAll(options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    console.log('🔍 Validating environment...\n');
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
        console.log(`✗ ${name.toUpperCase()}`);
        result.errors.forEach((err) => console.log(`  ✗ ${err}`));
      }
      allErrors.push(...result.errors.map((e) => `[${name}] ${e}`));
    } else if (verbose) {
      console.log(`✓ ${name.toUpperCase()}`);
    }

    if (result.warnings.length > 0) {
      if (verbose) {
        result.warnings.forEach((warn) => console.log(`  ⚠ ${warn}`));
      }
      allWarnings.push(...result.warnings.map((w) => `[${name}] ${w}`));
    }
  }

  if (verbose) {
    console.log('');
    if (allErrors.length === 0) {
      console.log('✅ Environment validation passed');
      if (allWarnings.length > 0) {
        console.log(`⚠️  ${allWarnings.length} warning(s)`);
      }
    } else {
      console.log(`❌ Environment validation failed (${allErrors.length} error(s))`);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// CLI usage
if (require.main === module) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  validateAll({ verbose })
    .then((result) => {
      if (!verbose && result.errors.length > 0) {
        console.error('Environment validation failed:\n');
        result.errors.forEach((err) => console.error(`  ✗ ${err}`));
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
