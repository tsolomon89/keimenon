#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    output: 'test-results/ops/gate-e-handoff-bundle-latest.json',
    summaryOutput: 'test-results/ops/gate-e-handoff-bundle-latest.md',
    allowMissingStreak: true,
    includeSignoff: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--output' && argv[i + 1]) {
      args.output = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--summary-output' && argv[i + 1]) {
      args.summaryOutput = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--require-streak') {
      args.allowMissingStreak = false;
      continue;
    }
    if (token === '--no-signoff') {
      args.includeSignoff = false;
      continue;
    }
  }

  return args;
}

function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
}

function readJsonIfExists(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function fileInfo(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  const stats = fs.statSync(absolutePath);
  return {
    path: absolutePath,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const requiredFiles = [
    'test-results/ops/gate-e-evidence-latest.json',
    'test-results/ops/rollout-rollback-drill-latest.json',
    'test-results/perf/lod-burnin-latest.json',
  ];
  if (args.includeSignoff) {
    requiredFiles.push(
      'test-results/ops/gate-e-completion-signoff-latest.json',
      'test-results/ops/gate-e-completion-signoff-latest.md'
    );
  }

  const optionalFiles = ['test-results/ops/gate-e-nightly-streak-latest.json'];
  const missingRequired = [];
  const required = [];
  for (const filePath of requiredFiles) {
    const info = fileInfo(filePath);
    if (!info) {
      missingRequired.push(path.resolve(filePath));
      continue;
    }
    required.push(info);
  }

  const optional = [];
  for (const filePath of optionalFiles) {
    const info = fileInfo(filePath);
    if (info) {
      optional.push(info);
    }
  }

  const streakJson = readJsonIfExists('test-results/ops/gate-e-nightly-streak-latest.json');
  if (!streakJson && !args.allowMissingStreak) {
    missingRequired.push(path.resolve('test-results/ops/gate-e-nightly-streak-latest.json'));
  }

  const pass = missingRequired.length === 0;
  const payload = {
    timestamp: new Date().toISOString(),
    pass,
    required,
    optional,
    missingRequired,
    streak: streakJson
      ? {
          target: streakJson.target,
          streak: streakJson.streak,
          meetsTarget: streakJson.meetsTarget,
        }
      : null,
  };

  const summary = [
    `## Gate-E Handoff Bundle ${pass ? '[GREEN]' : '[RED]'}`,
    '',
    `- Bundle pass: ${pass ? 'true' : 'false'}`,
    `- Required files present: ${required.length}/${requiredFiles.length}`,
    `- Optional files present: ${optional.length}/${optionalFiles.length}`,
    '',
    '### Required Files',
    ...required.map((f) => `- \`${f.path}\``),
    ...(missingRequired.length > 0
      ? ['', '### Missing Required', ...missingRequired.map((p) => `- \`${p}\``)]
      : []),
    '',
    '### Optional Files',
    ...(optional.length > 0 ? optional.map((f) => `- \`${f.path}\``) : ['- none']),
  ].join('\n');

  ensureParentDir(args.output);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(payload, null, 2), 'utf8');
  ensureParentDir(args.summaryOutput);
  fs.writeFileSync(path.resolve(args.summaryOutput), `${summary}\n`, 'utf8');

  console.log(`[gate-e-handoff] wrote ${path.resolve(args.output)}`);
  console.log(`[gate-e-handoff] wrote ${path.resolve(args.summaryOutput)}`);

  if (!pass) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[gate-e-handoff] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
