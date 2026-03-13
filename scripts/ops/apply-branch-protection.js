#!/usr/bin/env node

const { execSync } = require('node:child_process');

const DEFAULT_BRANCH = 'main';
const DEFAULT_REQUIRED_CHECKS = [
  'Full E2E (Chromium)',
  'LOD Burn-in (10k/50k)',
  'Rollout/Rollback Drill',
];

function parseArgs(argv) {
  const parsed = {
    repo: '',
    branch: DEFAULT_BRANCH,
    checks: [...DEFAULT_REQUIRED_CHECKS],
    dryRun: false,
    verifyOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--repo' && argv[index + 1]) {
      parsed.repo = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === '--branch' && argv[index + 1]) {
      parsed.branch = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === '--checks' && argv[index + 1]) {
      parsed.checks = String(argv[index + 1])
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (token === '--verify-only') {
      parsed.verifyOnly = true;
      continue;
    }
  }

  if (!parsed.checks.length) {
    throw new Error('At least one required check must be provided');
  }

  return parsed;
}

function parseRepoFromRemote(remoteUrl) {
  const normalized = String(remoteUrl || '').trim();
  if (!normalized) {
    throw new Error('Unable to determine repository from remote URL');
  }

  const httpsMatch = normalized.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  const sshMatch = normalized.match(/github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  throw new Error(`Unsupported GitHub remote URL format: ${normalized}`);
}

function resolveRepo(cliRepo) {
  if (cliRepo) {
    return cliRepo;
  }

  const remote = execSync('git config --get remote.origin.url', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  return parseRepoFromRemote(remote);
}

function getToken() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (envToken) {
    return envToken;
  }

  try {
    const ghCliToken = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return ghCliToken;
  } catch (_error) {
    return '';
  }
}

async function githubRequest({ method, path, token, body }) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'keimenon-gate-e-branch-protection',
      'Content-Type': 'application/json',
    },
    body: typeof body === 'undefined' ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch (_error) {
          return text;
        }
      })()
    : null;

  if (!response.ok) {
    const error = new Error(
      `GitHub API ${method} ${path} failed (${response.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

async function verifyRequiredChecks({ owner, repo, branch, token, requiredChecks }) {
  const path = `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`;
  const requiredStatusChecks = await githubRequest({ method: 'GET', path, token });
  const configuredChecks = Array.isArray(requiredStatusChecks?.contexts)
    ? requiredStatusChecks.contexts
    : [];
  const missing = requiredChecks.filter((check) => !configuredChecks.includes(check));
  const strict = requiredStatusChecks?.strict === true;

  return {
    strict,
    configuredChecks,
    missing,
    pass: strict && missing.length === 0,
  };
}

async function applyBranchProtection({ owner, repo, branch, token, requiredChecks }) {
  const requiredStatusChecksPath = `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`;
  const requiredStatusPayload = {
    strict: true,
    contexts: requiredChecks,
  };

  try {
    await githubRequest({
      method: 'PATCH',
      path: requiredStatusChecksPath,
      token,
      body: requiredStatusPayload,
    });
    return { mode: 'update-required-status-checks' };
  } catch (error) {
    if (error && error.status !== 404) {
      throw error;
    }
  }

  const fullProtectionPath = `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`;
  await githubRequest({
    method: 'PUT',
    path: fullProtectionPath,
    token,
    body: {
      required_status_checks: requiredStatusPayload,
      enforce_admins: false,
      required_pull_request_reviews: null,
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
      lock_branch: false,
      allow_fork_syncing: true,
    },
  });

  return { mode: 'create-branch-protection' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoSlug = resolveRepo(args.repo);
  const [owner, repo] = repoSlug.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository slug: ${repoSlug}`);
  }

  if (args.dryRun) {
    console.log('[branch-protection] dry run');
    console.log(
      JSON.stringify(
        {
          owner,
          repo,
          branch: args.branch,
          requiredChecks: args.checks,
          verifyOnly: args.verifyOnly,
        },
        null,
        2
      )
    );
    return;
  }

  const token = getToken();
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set GH_TOKEN/GITHUB_TOKEN or authenticate via `gh auth login` with repository admin permissions.'
    );
  }

  if (args.verifyOnly) {
    const verification = await verifyRequiredChecks({
      owner,
      repo,
      branch: args.branch,
      token,
      requiredChecks: args.checks,
    });
    console.log(
      `[branch-protection] strict=${verification.strict} missing=${verification.missing.length}`
    );
    if (verification.missing.length > 0) {
      console.log(`[branch-protection] missing checks: ${verification.missing.join(', ')}`);
    }
    if (!verification.pass) {
      process.exit(1);
    }
    console.log('[branch-protection] verification passed');
    return;
  }

  const applyResult = await applyBranchProtection({
    owner,
    repo,
    branch: args.branch,
    token,
    requiredChecks: args.checks,
  });
  console.log(`[branch-protection] apply mode=${applyResult.mode}`);

  const verification = await verifyRequiredChecks({
    owner,
    repo,
    branch: args.branch,
    token,
    requiredChecks: args.checks,
  });
  if (!verification.pass) {
    throw new Error(
      `Branch protection verification failed. strict=${verification.strict}, missing=[${verification.missing.join(', ')}]`
    );
  }

  console.log('[branch-protection] apply + verification passed');
}

main().catch((error) => {
  console.error(`[branch-protection] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
