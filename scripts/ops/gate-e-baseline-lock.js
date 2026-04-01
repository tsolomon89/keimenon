#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {
    skipPreflight: false,
    outputRoot: 'test-results/ops/baselines',
    reportOutput: 'test-results/ops/gate-e-baseline-lock-latest.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--skip-preflight') {
      args.skipPreflight = true;
      continue;
    }
    if (token === '--output-root' && argv[index + 1]) {
      args.outputRoot = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--report-output' && argv[index + 1]) {
      args.reportOutput = String(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function ensureDir(targetPath) {
  fs.mkdirSync(path.resolve(targetPath), { recursive: true });
}

function runCommand(command, cwd) {
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  });
  const pass = typeof result.status === 'number' && result.status === 0;
  return {
    command,
    pass,
    durationMs: Date.now() - startedAt,
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null,
  };
}

function runCapture(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }
  return String(result.stdout || '').trim() || null;
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
}

function copyArtifacts(artifacts, destinationDir) {
  const copied = [];
  for (const artifactPath of artifacts) {
    const absoluteSource = path.resolve(artifactPath);
    if (!fs.existsSync(absoluteSource)) {
      throw new Error(`Required artifact missing: ${absoluteSource}`);
    }
    const destinationPath = path.join(path.resolve(destinationDir), path.basename(artifactPath));
    fs.copyFileSync(absoluteSource, destinationPath);
    copied.push({
      source: absoluteSource,
      destination: destinationPath,
      sizeBytes: fs.statSync(destinationPath).size,
    });
  }
  return copied;
}

function getExpectedEarliestCompletionDateIso(startDateIso) {
  const startDate = new Date(startDateIso);
  const completionDate = new Date(startDate.getTime());
  completionDate.setUTCDate(completionDate.getUTCDate() + 14);
  return completionDate.toISOString().slice(0, 10);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const cwd = process.cwd();

  const commandPlan = [
    'npm run ops:gate-e:required-checks:sync',
    'npm run ops:vision-doc-sync:check',
  ];
  if (!args.skipPreflight) {
    commandPlan.push('npm run gate-e:hardening:ci');
  }
  commandPlan.push(
    [
      'node scripts/ops/gate-e-evidence-bundle.js',
      '--e2e-status success',
      '--lod-report test-results/perf/lod-burnin-latest.json',
      '--drill-report test-results/ops/rollout-rollback-drill-latest.json',
      '--output test-results/ops/gate-e-evidence-latest.json',
      '--summary-output test-results/ops/gate-e-summary-latest.md',
    ].join(' ')
  );
  // Re-run check sync because E2E output cleanup can clear test-results content.
  commandPlan.push('npm run ops:gate-e:required-checks:sync');
  commandPlan.push('npm run ops:vision-doc-sync:check');

  const commandResults = [];
  for (const command of commandPlan) {
    console.log(`[gate-e-baseline-lock] running: ${command}`);
    const result = runCommand(command, cwd);
    commandResults.push(result);
    if (!result.pass) {
      const failedReport = {
        timestamp: new Date().toISOString(),
        pass: false,
        reason: `Command failed: ${command}`,
        commandResults,
      };
      writeJson(args.reportOutput, failedReport);
      process.exit(1);
    }
  }

  const timestamp = new Date().toISOString();
  const sanitizedTimestamp = timestamp.replace(/[:.]/g, '-');
  const baselineDirectory = path.join(path.resolve(args.outputRoot), sanitizedTimestamp);
  ensureDir(baselineDirectory);

  const requiredArtifacts = [
    'test-results/ops/required-checks-sync-latest.json',
    'test-results/ops/gate-e-evidence-latest.json',
    'test-results/ops/gate-e-summary-latest.md',
    'test-results/ops/rollout-rollback-drill-latest.json',
    'test-results/perf/lod-burnin-latest.json',
  ];
  const copiedArtifacts = copyArtifacts(requiredArtifacts, baselineDirectory);

  const report = {
    timestamp,
    pass: true,
    durationMs: Date.now() - startedAt,
    skipPreflight: args.skipPreflight,
    gitSha: runCapture('git rev-parse HEAD', cwd),
    baselineDirectory,
    expectedEarliestNightlyCompletionDate: getExpectedEarliestCompletionDateIso(timestamp),
    commandResults,
    copiedArtifacts,
    notes: [
      'The nightly streak artifact is generated only for scheduled workflow runs.',
      'Use npm run ops:gate-e:nightly:validate -- --require-streak with downloaded nightly artifacts.',
    ],
  };

  writeJson(args.reportOutput, report);
  writeJson(path.join(baselineDirectory, 'baseline-lock-report.json'), report);

  console.log(`[gate-e-baseline-lock] PASS`);
  console.log(`[gate-e-baseline-lock] baseline directory: ${baselineDirectory}`);
  console.log(`[gate-e-baseline-lock] report: ${path.resolve(args.reportOutput)}`);
}

try {
  main();
} catch (error) {
  console.error(`[gate-e-baseline-lock] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
