#!/usr/bin/env node

const bypassRequested = process.env.KEIMENON_BYPASS_PM_CHECK === '1';
const userAgent = (process.env.npm_config_user_agent || '').toLowerCase();
const execPath = (process.env.npm_execpath || '').toLowerCase();

if (bypassRequested) {
  console.warn('[pm-check] Bypassing package manager check via KEIMENON_BYPASS_PM_CHECK=1.');
  process.exit(0);
}

const isNpm = userAgent.startsWith('npm/') || execPath.includes('npm-cli');

if (!isNpm) {
  const detected = process.env.npm_config_user_agent || process.env.npm_execpath || 'unknown';
  console.error(`[pm-check] Unsupported package manager detected: ${detected}`);
  console.error('[pm-check] Keimenon requires npm workspaces for consistent native-module builds.');
  console.error('[pm-check] Use Node 22 and run: npm install');
  process.exit(1);
}

process.exit(0);
