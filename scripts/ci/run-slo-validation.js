#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const mode = process.env.GOLDEN_SLO_MODE || 'pr';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log(`[run-slo-validation] Starting E2E SLO collection (mode=${mode})...`);
const testResult = spawnSync(npmCmd, ['run', 'e2e:golden-path:slo'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    GOLDEN_SLO_MODE: mode,
  },
  shell: true,
});

if (testResult.status !== 0) {
  console.error('[run-slo-validation] E2E SLO test collection failed.');
  process.exit(testResult.status ?? 1);
}

console.log(
  '[run-slo-validation] E2E SLO collection succeeded. Evaluating thresholds against baseline...'
);
const evalResult = spawnSync(
  npmCmd,
  [
    'run',
    'ops:golden-path:slo:eval',
    '--',
    '--mode',
    mode,
    '--metrics',
    'test-results/slo/golden-path-metrics.json',
    '--baseline',
    'scripts/ops/golden-path-slo-baseline.json',
    '--output',
    'test-results/slo/golden-path-slo-result.json',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
    shell: true,
  }
);

if (evalResult.status !== 0) {
  console.error('[run-slo-validation] SLO evaluation failed (threshold breach detected).');
  process.exit(evalResult.status ?? 1);
}

console.log('[run-slo-validation] SLO validation passed successfully.');
process.exit(0);
