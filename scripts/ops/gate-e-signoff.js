#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {
    targetStreak: 14,
    evidenceReport: 'test-results/ops/gate-e-evidence-latest.json',
    streakReport: 'test-results/ops/gate-e-nightly-streak-latest.json',
    drillReport: 'test-results/ops/rollout-rollback-drill-latest.json',
    lodReport: 'test-results/perf/lod-burnin-latest.json',
    output: 'test-results/ops/gate-e-completion-signoff-latest.json',
    summaryOutput: 'test-results/ops/gate-e-completion-signoff-latest.md',
    allowIncomplete: false,
    skipBranchProtectionVerify: false,
    updateGapAnalysis: false,
    gapAnalysisPath: 'agent_context/vision_gap_analysis.md',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--target-streak' && argv[index + 1]) {
      args.targetStreak = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--evidence-report' && argv[index + 1]) {
      args.evidenceReport = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--streak-report' && argv[index + 1]) {
      args.streakReport = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--drill-report' && argv[index + 1]) {
      args.drillReport = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--lod-report' && argv[index + 1]) {
      args.lodReport = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--output' && argv[index + 1]) {
      args.output = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--summary-output' && argv[index + 1]) {
      args.summaryOutput = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--allow-incomplete') {
      args.allowIncomplete = true;
      continue;
    }
    if (token === '--skip-branch-protection-verify') {
      args.skipBranchProtectionVerify = true;
      continue;
    }
    if (token === '--update-gap-analysis') {
      args.updateGapAnalysis = true;
      continue;
    }
    if (token === '--gap-analysis-path' && argv[index + 1]) {
      args.gapAnalysisPath = String(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
}

function readJsonStrict(filePath, label) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing ${label}: ${absolutePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function runBranchProtectionVerify(skip) {
  if (skip) {
    return {
      executed: false,
      pass: false,
      reason: 'skipped by flag',
      output: '',
      error: '',
    };
  }

  const result = spawnSync('npm run ops:branch-protection:verify', {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env },
  });

  const pass = typeof result.status === 'number' && result.status === 0;
  return {
    executed: true,
    pass,
    reason: pass ? 'verified' : 'verification command failed',
    output: String(result.stdout || '').trim(),
    error: String(result.stderr || '').trim(),
  };
}

function buildSummary(payload) {
  const status = payload.pass ? '[GREEN]' : payload.allowIncomplete ? '[YELLOW]' : '[RED]';
  const failureLines = payload.failures.length > 0 ? payload.failures : ['none'];
  return [
    `## Gate-E Completion Signoff ${status}`,
    '',
    `- Completed: ${payload.pass ? 'true' : 'false'}`,
    `- Allow incomplete mode: ${payload.allowIncomplete ? 'true' : 'false'}`,
    `- Target streak: ${payload.targetStreak}`,
    `- Current streak: ${payload.currentStreak}`,
    `- Meets target: ${payload.meetsTarget}`,
    `- Evidence pass: ${payload.criteria.evidencePass}`,
    `- Drill pass: ${payload.criteria.drillPass}`,
    `- LOD pass: ${payload.criteria.lodPass}`,
    `- Branch protection verified: ${payload.criteria.branchProtectionVerified}`,
    '',
    '### Evidence Pointers',
    `- Evidence: \`${payload.paths.evidenceReport}\``,
    `- Streak: \`${payload.paths.streakReport}\``,
    `- Drill: \`${payload.paths.drillReport}\``,
    `- LOD: \`${payload.paths.lodReport}\``,
    '',
    '### Failure Reasons',
    ...failureLines.map((line) => `- ${line}`),
    '',
    '### Workflow URLs',
    ...(payload.workflowUrls.length > 0
      ? payload.workflowUrls.map((url) => `- ${url}`)
      : ['- none available in streak artifact']),
  ].join('\n');
}

function updateGapAnalysis(gapAnalysisPath, payload) {
  const absolutePath = path.resolve(gapAnalysisPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Gap analysis file not found: ${absolutePath}`);
  }

  const completionBlock = [
    '## Completion Status',
    '',
    `- Last signoff evaluation: ${payload.timestamp}`,
    `- Completed: ${payload.pass ? 'true' : 'false'}`,
    `- Target streak: ${payload.targetStreak}`,
    `- Current streak: ${payload.currentStreak}`,
    `- Meets target: ${payload.meetsTarget}`,
    `- Branch protection verified: ${payload.criteria.branchProtectionVerified}`,
    '- Evidence pointers:',
    `  - ${payload.paths.evidenceReport}`,
    `  - ${payload.paths.streakReport}`,
    `  - ${payload.paths.drillReport}`,
    `  - ${payload.paths.lodReport}`,
    '',
  ].join('\n');

  const currentContent = fs.readFileSync(absolutePath, 'utf8');
  const updatedContent = currentContent.match(/^## Completion Status[\s\S]*$/m)
    ? currentContent.replace(/^## Completion Status[\s\S]*$/m, completionBlock)
    : `${currentContent.trimEnd()}\n\n${completionBlock}`;

  fs.writeFileSync(absolutePath, updatedContent, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const failures = [];
  let evidence = null;
  let streak = null;
  let drill = null;
  let lod = null;

  try {
    evidence = readJsonStrict(args.evidenceReport, 'evidence report');
  } catch (error) {
    if (!args.allowIncomplete) {
      throw error;
    }
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    streak = readJsonStrict(args.streakReport, 'streak report');
  } catch (error) {
    if (!args.allowIncomplete) {
      throw error;
    }
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    drill = readJsonStrict(args.drillReport, 'drill report');
  } catch (error) {
    if (!args.allowIncomplete) {
      throw error;
    }
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    lod = readJsonStrict(args.lodReport, 'lod report');
  } catch (error) {
    if (!args.allowIncomplete) {
      throw error;
    }
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const currentStreak = Number(streak?.streak || 0);
  const meetsTarget = Boolean(streak?.meetsTarget) && currentStreak >= args.targetStreak;

  if (evidence?.pass !== true) {
    failures.push('Gate-E evidence report is not green.');
  }
  if (drill?.pass !== true) {
    failures.push('Rollout/rollback drill report indicates failure.');
  }
  if (lod?.pass !== true) {
    failures.push('LOD burn-in report indicates failure.');
  }
  if (!meetsTarget) {
    failures.push(`Nightly streak has not reached target (${currentStreak}/${args.targetStreak}).`);
  }

  const branchProtection = runBranchProtectionVerify(args.skipBranchProtectionVerify);
  if (!branchProtection.pass) {
    failures.push(
      args.skipBranchProtectionVerify
        ? 'Branch protection verification was skipped.'
        : 'Branch protection verification failed (run npm run ops:branch-protection:verify with valid GH auth).'
    );
  }

  const pass = failures.length === 0;
  const workflowUrls = Array.isArray(streak?.historicalRunsInspected)
    ? streak.historicalRunsInspected
        .map((run) => (run && typeof run.htmlUrl === 'string' ? run.htmlUrl : null))
        .filter(Boolean)
    : [];

  const payload = {
    timestamp: new Date().toISOString(),
    pass,
    allowIncomplete: args.allowIncomplete,
    targetStreak: args.targetStreak,
    currentStreak,
    meetsTarget,
    failures,
    criteria: {
      evidencePass: evidence.pass === true,
      drillPass: drill.pass === true,
      lodPass: lod.pass === true,
      branchProtectionVerified: branchProtection.pass,
    },
    branchProtection,
    workflowUrls,
    paths: {
      evidenceReport: path.resolve(args.evidenceReport),
      streakReport: path.resolve(args.streakReport),
      drillReport: path.resolve(args.drillReport),
      lodReport: path.resolve(args.lodReport),
    },
  };

  const summary = buildSummary(payload);
  ensureParentDir(args.output);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(payload, null, 2), 'utf8');
  ensureParentDir(args.summaryOutput);
  fs.writeFileSync(path.resolve(args.summaryOutput), summary, 'utf8');

  if (args.updateGapAnalysis) {
    updateGapAnalysis(args.gapAnalysisPath, payload);
  }

  console.log(`[gate-e-signoff] wrote ${path.resolve(args.output)}`);
  console.log(`[gate-e-signoff] wrote ${path.resolve(args.summaryOutput)}`);
  if (args.updateGapAnalysis) {
    console.log(`[gate-e-signoff] updated ${path.resolve(args.gapAnalysisPath)}`);
  }

  if (!pass && !args.allowIncomplete) {
    console.error('[gate-e-signoff] FAILED');
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[gate-e-signoff] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
