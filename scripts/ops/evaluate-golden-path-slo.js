#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    mode: 'pr',
    metrics: 'test-results/slo/golden-path-metrics.json',
    baseline: 'scripts/ops/golden-path-slo-baseline.json',
    output: 'test-results/slo/golden-path-slo-result.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--mode' && argv[index + 1]) {
      args.mode = String(argv[index + 1]).toLowerCase();
      index += 1;
      continue;
    }
    if (token === '--metrics' && argv[index + 1]) {
      args.metrics = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--baseline' && argv[index + 1]) {
      args.baseline = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--output' && argv[index + 1]) {
      args.output = String(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  if (args.mode !== 'pr' && args.mode !== 'nightly') {
    throw new Error(`Unsupported mode "${args.mode}". Expected "pr" or "nightly".`);
  }

  return args;
}

function readJson(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing JSON file: ${absolutePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function ensureOutputDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function getFixtureDuration(metrics, fixtureName) {
  const fixture = (metrics.fixtures || []).find((item) => item && item.name === fixtureName);
  if (!fixture || !Number.isFinite(Number(fixture.durationMs))) {
    return undefined;
  }
  return Number(fixture.durationMs);
}

function evaluate(args, metrics, baseline) {
  const breaches = [];
  const mode = args.mode;

  const tinyImportMs = getFixtureDuration(metrics, 'tiny');
  const smallImportMs = getFixtureDuration(metrics, 'small');
  const mediumImportMs = getFixtureDuration(metrics, 'medium');
  const realGptImportMs = getFixtureDuration(metrics, 'real_gpt');
  const similarityApplyMs = Number(metrics.similarityApplyMs || 0);
  const stalledJobsOver180s = Number(metrics.stalledJobsOver180s || 0);
  const requiredScenarioFailures = Number(metrics.requiredScenarioFailures || 0);

  const assertLimit = (name, value, limit) => {
    if (!Number.isFinite(value)) {
      breaches.push(`${name}: missing metric`);
      return;
    }
    if (value > limit) {
      breaches.push(`${name}: ${value}ms exceeds ${limit}ms`);
    }
  };

  if (mode === 'pr') {
    assertLimit('tiny import', tinyImportMs, 120000);
    assertLimit('small import', smallImportMs, 420000);
    assertLimit('similarity apply', similarityApplyMs, 60000);
  } else {
    assertLimit('medium import', mediumImportMs, 900000);
    assertLimit('real_gpt import', realGptImportMs, 2700000);
    assertLimit('similarity apply', similarityApplyMs, 120000);
  }

  if (stalledJobsOver180s > 0) {
    breaches.push(`stalled jobs: expected 0, got ${stalledJobsOver180s}`);
  }
  if (requiredScenarioFailures > 0) {
    breaches.push(`required scenario failures: expected 0, got ${requiredScenarioFailures}`);
  }

  let failureBudget7dPercent;
  let regressionPercentVsMedian;
  if (mode === 'nightly') {
    const rolling7d = baseline?.rolling7d || {};
    const runs = Number(rolling7d.runs || 0);
    const failures = Number(rolling7d.failures || 0);
    failureBudget7dPercent = runs > 0 ? (failures / runs) * 100 : undefined;
    if (!Number.isFinite(failureBudget7dPercent)) {
      breaches.push('nightly failure budget: missing rolling7d baseline');
    } else if (failureBudget7dPercent > 2) {
      breaches.push(`nightly failure budget: ${failureBudget7dPercent.toFixed(2)}% exceeds 2.00%`);
    }

    const medians = baseline?.medians || {};
    const regressionCandidates = [];
    const pushRegression = (name, current, median) => {
      if (!Number.isFinite(current) || !Number.isFinite(median) || median <= 0) {
        return;
      }
      const regression = ((current - median) / median) * 100;
      regressionCandidates.push({ name, regression });
      if (regression > 15) {
        breaches.push(
          `${name} regression: ${regression.toFixed(2)}% exceeds 15.00% vs baseline median`
        );
      }
    };

    pushRegression('medium import', mediumImportMs, Number(medians.mediumImportMs || 0));
    pushRegression('real_gpt import', realGptImportMs, Number(medians.realGptImportMs || 0));
    pushRegression('similarity apply', similarityApplyMs, Number(medians.similarityApplyMs || 0));

    if (regressionCandidates.length > 0) {
      regressionPercentVsMedian = Math.max(...regressionCandidates.map((item) => item.regression));
    }
  }

  const result = {
    mode,
    timestamp: new Date().toISOString(),
    pass: breaches.length === 0,
    breaches,
    metrics: {
      tinyImportMs,
      smallImportMs,
      mediumImportMs,
      realGptImportMs,
      similarityApplyMs,
      stalledJobsOver180s,
      requiredScenarioFailures,
      failureBudget7dPercent,
      regressionPercentVsMedian,
    },
  };

  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const metrics = readJson(args.metrics);
  const baseline = fs.existsSync(path.resolve(args.baseline)) ? readJson(args.baseline) : {};
  const result = evaluate(args, metrics, baseline);

  ensureOutputDir(args.output);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(result, null, 2), 'utf8');

  if (!result.pass) {
    console.error('[golden-path-slo] FAILED');
    for (const breach of result.breaches) {
      console.error(`- ${breach}`);
    }
    process.exit(1);
  }

  console.log('[golden-path-slo] OK');
}

main();
