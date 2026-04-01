#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    workflow: '.github/workflows/gate-e-hardening.yml',
    requiredChecksDoc: 'docs/ops/branch-protection-required-checks.md',
    output: 'test-results/ops/required-checks-sync-latest.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--workflow' && argv[index + 1]) {
      args.workflow = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--required-checks-doc' && argv[index + 1]) {
      args.requiredChecksDoc = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--output' && argv[index + 1]) {
      args.output = String(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function readUtf8(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function normalizeName(name) {
  return String(name).trim().replace(/^['"]/, '').replace(/['"]$/, '');
}

function parseRequiredChecks(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const checks = [];
  let inRequiredChecksBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!inRequiredChecksBlock) {
      if (line.includes('must be required on `main`')) {
        inRequiredChecksBlock = true;
      }
      continue;
    }

    if (line.startsWith('## ')) {
      break;
    }

    const match = line.match(/^\d+\.\s+`([^`]+)`\s*$/);
    if (match) {
      checks.push(normalizeName(match[1]));
    }
  }

  return checks;
}

function parseWorkflowJobNames(workflowYaml) {
  const matches = [...workflowYaml.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)];
  return matches.map((match) => normalizeName(match[1]));
}

function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const workflowText = readUtf8(args.workflow);
  const checksDocText = readUtf8(args.requiredChecksDoc);
  const workflowJobNames = parseWorkflowJobNames(workflowText);
  const requiredChecks = parseRequiredChecks(checksDocText);

  if (requiredChecks.length === 0) {
    throw new Error(
      `No required checks found in ${path.resolve(args.requiredChecksDoc)}. Expected numbered markdown list with backticks.`
    );
  }

  const workflowNameSet = new Set(workflowJobNames);
  const missingInWorkflow = requiredChecks.filter((checkName) => !workflowNameSet.has(checkName));
  const undocumentedWorkflowJobs = workflowJobNames.filter(
    (jobName) => !requiredChecks.includes(jobName)
  );
  const pass = missingInWorkflow.length === 0;

  const payload = {
    timestamp: new Date().toISOString(),
    pass,
    workflow: path.resolve(args.workflow),
    requiredChecksDoc: path.resolve(args.requiredChecksDoc),
    requiredChecks,
    workflowJobNames,
    missingInWorkflow,
    undocumentedWorkflowJobs,
  };

  ensureParentDir(args.output);
  fs.writeFileSync(path.resolve(args.output), JSON.stringify(payload, null, 2), 'utf8');

  if (pass) {
    console.log('[required-checks-sync] OK');
    console.log(
      `[required-checks-sync] required checks are present in workflow: ${requiredChecks.join(', ')}`
    );
    if (undocumentedWorkflowJobs.length > 0) {
      console.log(
        `[required-checks-sync] note: workflow has additional jobs not listed as required checks: ${undocumentedWorkflowJobs.join(', ')}`
      );
    }
    return;
  }

  console.error('[required-checks-sync] FAILED');
  for (const missingName of missingInWorkflow) {
    console.error(
      `- missing workflow job for required check '${missingName}' in ${path.resolve(args.workflow)}`
    );
  }
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`[required-checks-sync] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
