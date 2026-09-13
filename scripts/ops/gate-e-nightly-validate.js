#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    evidenceReport: 'test-results/ops/gate-e-evidence-latest.json',
    streakReport: 'test-results/ops/gate-e-nightly-streak-latest.json',
    requireStreak: false,
    output: 'test-results/ops/gate-e-nightly-validation-latest.json',
    summaryOutput: 'test-results/ops/gate-e-nightly-validation-latest.md',
    targetStreak: 14,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
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
    if (token === '--require-streak') {
      args.requireStreak = true;
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
    if (token === '--target-streak' && argv[index + 1]) {
      args.targetStreak = Number(argv[index + 1]);
      index += 1;
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

function computeStatus(pass, warnings) {
  if (pass) {
    return 'green';
  }
  if (warnings.length > 0) {
    return 'yellow';
  }
  return 'red';
}

function statusBadge(status) {
  if (status === 'green') return '[GREEN]';
  if (status === 'yellow') return '[YELLOW]';
  return '[RED]';
}

function evaluateGateENightly(options) {
  const warnings = [];
  const failures = [];

  const evidence = readJsonIfExists(options.evidenceReport);
  if (!evidence) {
    failures.push(`Missing evidence report: ${path.resolve(options.evidenceReport)}`);
  }

  let evidenceConsistent = false;
  if (evidence) {
    const hasBooleans =
      typeof evidence.pass === 'boolean' &&
      typeof evidence?.e2e?.pass === 'boolean' &&
      typeof evidence?.lod?.pass === 'boolean' &&
      typeof evidence?.drill?.pass === 'boolean';
    if (!hasBooleans) {
      failures.push('Evidence report is missing required boolean fields.');
    } else {
      const recomputedPass = evidence.e2e.pass && evidence.lod.pass && evidence.drill.pass;
      evidenceConsistent = evidence.pass === recomputedPass;
      if (!evidenceConsistent) {
        failures.push(
          `Evidence pass mismatch: report.pass=${evidence.pass}, recomputed=${recomputedPass}`
        );
      }
      if (!evidence.pass) {
        failures.push('Evidence report indicates non-green Gate-E run.');
      }
    }
  }

  const streak = readJsonIfExists(options.streakReport);
  let streakValid = false;
  if (!streak) {
    if (options.requireStreak) {
      failures.push(`Missing streak report: ${path.resolve(options.streakReport)}`);
    } else {
      warnings.push(
        `Streak report not found: ${path.resolve(options.streakReport)} (expected outside scheduled nightly runs)`
      );
    }
  } else {
    const hasFields =
      typeof streak.target === 'number' &&
      typeof streak.streak === 'number' &&
      typeof streak.meetsTarget === 'boolean';
    if (!hasFields) {
      failures.push('Streak report is missing required fields (target, streak, meetsTarget).');
    } else {
      if (streak.target !== options.targetStreak) {
        warnings.push(
          `Streak target mismatch: report.target=${streak.target}, expected=${options.targetStreak}`
        );
      }
      if (streak.meetsTarget && streak.streak < options.targetStreak) {
        failures.push(
          `Streak report inconsistent: meetsTarget=true but streak=${streak.streak} < ${options.targetStreak}`
        );
      }

      // Hard enforcement for final release signoff (--require-streak) or when meetsTarget is claimed
      const requireHistoryValidation = options.requireStreak || streak.meetsTarget;

      if (options.requireStreak) {
        if (!streak.meetsTarget || streak.streak < options.targetStreak) {
          failures.push(
            `Streak requirement not satisfied: current streak is ${streak.streak}, required target is ${options.targetStreak} (meetsTarget=${streak.meetsTarget})`
          );
        }
      }

      if (requireHistoryValidation) {
        if (
          !Array.isArray(streak.historicalRunsInspected) ||
          streak.historicalRunsInspected.length === 0
        ) {
          failures.push(
            'Streak claim unverifiable: missing historicalRunsInspected evidence array in streak report.'
          );
        } else {
          // Gather runs in the streak (current run if pass, plus successful historical runs)
          const validRuns = [];
          if (streak.currentRun?.pass) {
            validRuns.push({
              createdAt: streak.timestamp || new Date().toISOString(),
              conclusion: 'success',
            });
          }

          for (const run of streak.historicalRunsInspected) {
            if (run.conclusion !== 'success') {
              failures.push(
                `Historical run ${run.id || run.runNumber} is not successful (conclusion=${run.conclusion})`
              );
            } else {
              validRuns.push(run);
            }
          }

          // Distinct UTC dates
          const distinctDates = Array.from(
            new Set(
              validRuns
                .map((r) => r.createdAt && new Date(r.createdAt).toISOString().slice(0, 10))
                .filter(Boolean)
            )
          ).sort(); // chronological order e.g. ['2026-08-31', '2026-09-01', ...]

          const requiredCount = options.requireStreak ? options.targetStreak : streak.streak || 1;
          if (distinctDates.length < requiredCount) {
            failures.push(
              `Calendar streak requirement not satisfied: observed ${distinctDates.length} distinct UTC dates, required ${requiredCount}`
            );
          } else {
            // 1. Verify dates are strictly consecutive (no gaps)
            for (let i = 1; i < distinctDates.length; i++) {
              const prev = new Date(distinctDates[i - 1]);
              const curr = new Date(distinctDates[i]);
              const diffDays = Math.round(
                (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (diffDays !== 1) {
                failures.push(
                  `Calendar streak is not consecutive: gap of ${diffDays} days detected between ${distinctDates[i - 1]} and ${distinctDates[i]}`
                );
                break;
              }
            }

            // 2. Verify streak is current, not stale (latest date within 48h of reference time)
            const latestDate = new Date(distinctDates[distinctDates.length - 1]);
            const referenceTime = streak.timestamp
              ? new Date(streak.timestamp)
              : options.referenceDate
                ? new Date(options.referenceDate)
                : new Date();
            const staleDiffHours =
              (referenceTime.getTime() - latestDate.getTime()) / (1000 * 60 * 60);
            if (staleDiffHours > 48) {
              failures.push(
                `Calendar streak is stale: most recent successful run date (${distinctDates[distinctDates.length - 1]}) is ${Math.round(staleDiffHours)} hours old relative to report timestamp (max 48h allowed)`
              );
            }
          }
        }
      }
      streakValid = failures.length === 0;
    }
  }

  const pass = failures.length === 0;
  const status = computeStatus(pass, warnings);
  const payload = {
    timestamp: new Date().toISOString(),
    pass,
    status,
    failures,
    warnings,
    evidenceReport: path.resolve(options.evidenceReport),
    streakReport: path.resolve(options.streakReport),
    evidencePass: evidence ? evidence.pass === true : null,
    evidenceConsistent,
    streakSeen: Boolean(streak),
    streakValid,
    streakProgress: streak
      ? {
          target: streak.target,
          streak: streak.streak,
          meetsTarget: streak.meetsTarget,
        }
      : null,
    requireStreak: options.requireStreak,
  };

  const summary = [
    `## Gate-E Nightly Validation ${statusBadge(status)} ${status.toUpperCase()}`,
    '',
    `- Overall pass: ${pass ? 'true' : 'false'}`,
    `- Workflow: \`.github/workflows/gate-e-hardening.yml\``,
    `- Evidence file: \`${path.resolve(options.evidenceReport)}\``,
    `- Streak file: \`${path.resolve(options.streakReport)}\``,
    `- Require streak file: ${options.requireStreak ? 'true' : 'false'}`,
    ...(streak
      ? [
          `- Current streak: ${streak.streak}/${streak.target}`,
          `- Meets target: ${streak.meetsTarget ? 'true' : 'false'}`,
        ]
      : []),
    '',
    '### Failures',
    ...(failures.length > 0 ? failures.map((item) => `- ${item}`) : ['- none']),
    '',
    '### Warnings',
    ...(warnings.length > 0 ? warnings.map((item) => `- ${item}`) : ['- none']),
  ].join('\n');

  return { pass, status, payload, summary, failures, warnings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateGateENightly(args);

  ensureParentDir(args.output);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(result.payload, null, 2), 'utf8');
  ensureParentDir(args.summaryOutput);
  fs.writeFileSync(path.resolve(args.summaryOutput), result.summary, 'utf8');

  console.log(`[gate-e-nightly-validate] wrote ${path.resolve(args.output)}`);
  console.log(`[gate-e-nightly-validate] wrote ${path.resolve(args.summaryOutput)}`);

  if (!result.pass) {
    console.error('[gate-e-nightly-validate] FAILED');
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `[gate-e-nightly-validate] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

module.exports = {
  evaluateGateENightly,
  parseArgs,
  computeStatus,
};
