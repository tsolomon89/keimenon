#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    streakReport: 'test-results/ops/gate-e-nightly-streak-latest.json',
    evidenceReport: 'test-results/ops/gate-e-evidence-latest.json',
    output: 'test-results/ops/gate-e-nightly-tracker-latest.md',
    appendTo: '',
    date: new Date().toISOString().slice(0, 10),
    runUrl: '',
    allowMissingStreak: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--streak-report' && argv[i + 1]) {
      args.streakReport = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--evidence-report' && argv[i + 1]) {
      args.evidenceReport = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--output' && argv[i + 1]) {
      args.output = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--append-to' && argv[i + 1]) {
      args.appendTo = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--date' && argv[i + 1]) {
      args.date = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--run-url' && argv[i + 1]) {
      args.runUrl = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--require-streak') {
      args.allowMissingStreak = false;
      continue;
    }
  }

  return args;
}

function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
}

function readJsonRequired(filePath, label) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing ${label}: ${absolutePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function renderTrackerEntry({ date, streak, evidence, runUrl, streakMissingWarning }) {
  const run =
    runUrl ||
    (streak &&
    Array.isArray(streak.historicalRunsInspected) &&
    streak.historicalRunsInspected[0] &&
    typeof streak.historicalRunsInspected[0].htmlUrl === 'string'
      ? streak.historicalRunsInspected[0].htmlUrl
      : '');

  const passSet = [
    evidence?.e2e?.pass === true ? 'E2E' : null,
    evidence?.lod?.pass === true ? 'LOD' : null,
    evidence?.drill?.pass === true ? 'Drill' : null,
    evidence?.pass === true ? 'Evidence' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const row = [
    '| Date | Streak | Meets Target | Nightly Pass | Pass Components | Run URL |',
    '| --- | ---: | --- | --- | --- | --- |',
    `| ${date} | ${Number(streak?.streak || 0)}/${Number(streak?.target || 14)} | ${Boolean(streak?.meetsTarget)} | ${Boolean(streak?.currentRun?.pass)} | ${passSet || 'none'} | ${run || 'n/a'} |`,
  ].join('\n');

  const warningBlock = streakMissingWarning ? [`> WARNING: ${streakMissingWarning}`, ''] : [];

  const block = [
    `## Gate-E Nightly Tracker Entry (${date})`,
    '',
    ...warningBlock,
    row,
    '',
    '### Artifact Pointers',
    `- Streak: \`${path.resolve('test-results/ops/gate-e-nightly-streak-latest.json')}\``,
    `- Evidence: \`${path.resolve('test-results/ops/gate-e-evidence-latest.json')}\``,
    '',
  ].join('\n');

  return block;
}

function appendEntry(targetPath, entry) {
  const absolutePath = path.resolve(targetPath);
  ensureParentDir(absolutePath);
  const existing = fs.existsSync(absolutePath)
    ? fs.readFileSync(absolutePath, 'utf8').trimEnd()
    : '';
  const merged = existing ? `${existing}\n\n${entry}` : entry;
  fs.writeFileSync(absolutePath, `${merged}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let streak = readJsonIfExists(args.streakReport);
  if (!streak && !args.allowMissingStreak) {
    throw new Error(`Missing streak report: ${path.resolve(args.streakReport)}`);
  }
  const evidence = readJsonRequired(args.evidenceReport, 'evidence report');
  const streakMissingWarning = streak
    ? ''
    : `Streak report not found at ${path.resolve(args.streakReport)}. This is expected outside scheduled nightly runs.`;

  const entry = renderTrackerEntry({
    date: args.date,
    streak,
    evidence,
    runUrl: args.runUrl,
    streakMissingWarning,
  });

  ensureParentDir(args.output);
  fs.writeFileSync(path.resolve(args.output), `${entry}\n`, 'utf8');
  console.log(`[gate-e-nightly-tracker] wrote ${path.resolve(args.output)}`);

  if (args.appendTo) {
    appendEntry(args.appendTo, entry);
    console.log(`[gate-e-nightly-tracker] appended ${path.resolve(args.appendTo)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[gate-e-nightly-tracker] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
