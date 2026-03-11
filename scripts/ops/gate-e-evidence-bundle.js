#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    e2eStatus: 'unknown',
    lodReport: '',
    drillReport: '',
    output: 'test-results/ops/gate-e-evidence-latest.json',
    summaryOutput: 'test-results/ops/gate-e-summary-latest.md',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--e2e-status' && argv[i + 1]) {
      args.e2eStatus = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--lod-report' && argv[i + 1]) {
      args.lodReport = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--drill-report' && argv[i + 1]) {
      args.drillReport = String(argv[i + 1]);
      i += 1;
      continue;
    }
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
  }

  return args;
}

function readJsonFile(filePath) {
  if (!filePath) {
    throw new Error('Missing required report path');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Report not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function statusToEmoji(status) {
  if (status === 'green') return '[GREEN]';
  if (status === 'yellow') return '[YELLOW]';
  return '[RED]';
}

function computeOverallStatus(input) {
  if (input.e2e && input.lod && input.drill) {
    return 'green';
  }
  if (!input.e2e && !input.lod && !input.drill) {
    return 'red';
  }
  return 'yellow';
}

function ensureParentDir(targetPath) {
  const dir = path.dirname(path.resolve(targetPath));
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const lodReport = readJsonFile(args.lodReport);
  const drillReport = readJsonFile(args.drillReport);

  const e2ePass = args.e2eStatus === 'success';
  const lodPass = lodReport && lodReport.pass === true;
  const drillPass = drillReport && drillReport.pass === true;

  const overallStatus = computeOverallStatus({
    e2e: e2ePass,
    lod: lodPass,
    drill: drillPass,
  });
  const pass = e2ePass && lodPass && drillPass;

  const evidence = {
    timestamp: new Date().toISOString(),
    pass,
    status: overallStatus,
    e2e: {
      status: args.e2eStatus,
      pass: e2ePass,
    },
    lod: {
      pass: lodPass,
      durationMs: lodReport.durationMs ?? null,
      config: lodReport.config ?? null,
      results: Array.isArray(lodReport.results) ? lodReport.results : [],
    },
    drill: {
      pass: drillPass,
      mode: drillReport.mode ?? 'unknown',
      durationMs: drillReport.durationMs ?? null,
      steps: Array.isArray(drillReport.steps) ? drillReport.steps : [],
    },
  };

  const summary = [
    `## Gate-E Summary ${statusToEmoji(overallStatus)} ${overallStatus.toUpperCase()}`,
    '',
    `- Overall pass: ${pass ? 'true' : 'false'}`,
    `- E2E (Chromium): ${args.e2eStatus}`,
    `- LOD burn-in: ${lodPass ? 'pass' : 'fail'}`,
    `- Rollout/Rollback drill: ${drillPass ? 'pass' : 'fail'}`,
    '',
    '### Evidence',
    `- LOD report: \`${args.lodReport}\``,
    `- Drill report: \`${args.drillReport}\``,
    `- Bundle: \`${args.output}\``,
  ].join('\n');

  ensureParentDir(args.output);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(evidence, null, 2), 'utf8');
  ensureParentDir(args.summaryOutput);
  fs.writeFileSync(path.resolve(args.summaryOutput), summary, 'utf8');

  console.log(`[gate-e-evidence] wrote ${path.resolve(args.output)}`);
  console.log(`[gate-e-evidence] wrote ${path.resolve(args.summaryOutput)}`);

  if (!pass) {
    console.error('[gate-e-evidence] FAILED');
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[gate-e-evidence] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
