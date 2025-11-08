#!/usr/bin/env node

/**
 * Clean Next.js Cache Script
 *
 * Removes the Next.js .next/cache directory to prevent HMR cache poisoning.
 * This fixes issues where newly created modules (like env.config.ts) are cached as 404s.
 *
 * Usage:
 *   npm run e2e:clean-cache
 *   node scripts/e2e/clean-cache.js
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function cleanNextCache() {
  const nextCachePath = path.join(__dirname, '../../apps/web/.next/cache');

  try {
    if (fs.existsSync(nextCachePath)) {
      log('🗑️  Cleaning Next.js cache...', colors.yellow);
      fs.rmSync(nextCachePath, { recursive: true, force: true });
      log('✅ Next.js cache cleaned successfully!', colors.green);
      log('\n💡 Tip: Run this if you experience module resolution issues', colors.blue);
    } else {
      log('✅ Next.js cache is already clean (directory does not exist)', colors.green);
    }
  } catch (error) {
    log(`❌ Failed to clean Next.js cache: ${error.message}`, colors.yellow);
    process.exit(1);
  }
}

cleanNextCache();
