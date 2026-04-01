#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const args = {
    txtOutput: 'test-results/ops/branch-protection-verify-latest.txt',
    jsonOutput: 'test-results/ops/branch-protection-verify-latest.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--txt-output' && argv[index + 1]) {
      args.txtOutput = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--json-output' && argv[index + 1]) {
      args.jsonOutput = String(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function runGitBranchResolve() {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    return 'unknown';
  }
  return String(result.stdout || '').trim() || 'unknown';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = `node scripts/ops/apply-branch-protection.js --verify-only`;
  const verify = spawnSync(
    process.execPath,
    ['scripts/ops/apply-branch-protection.js', '--verify-only'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );

  const pass = verify.status === 0;
  const payload = {
    timestamp: new Date().toISOString(),
    branch: runGitBranchResolve(),
    pass,
    command,
    exitCode: typeof verify.status === 'number' ? verify.status : 1,
    stdout: String(verify.stdout || '').trim(),
    stderr: String(verify.stderr || '').trim(),
  };

  const txtContent = [
    `timestamp: ${payload.timestamp}`,
    `branch: ${payload.branch}`,
    `pass: ${payload.pass}`,
    `exitCode: ${payload.exitCode}`,
    `command: ${payload.command}`,
    '',
    'stdout:',
    payload.stdout || '(empty)',
    '',
    'stderr:',
    payload.stderr || '(empty)',
    '',
  ].join('\n');

  ensureParentDir(args.txtOutput);
  fs.writeFileSync(path.resolve(args.txtOutput), txtContent, 'utf8');
  ensureParentDir(args.jsonOutput);
  fs.writeFileSync(path.resolve(args.jsonOutput), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`[branch-protection-evidence] wrote ${path.resolve(args.txtOutput)}`);
  console.log(`[branch-protection-evidence] wrote ${path.resolve(args.jsonOutput)}`);

  if (!pass) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[branch-protection-evidence] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
