/**
 * verify-gemma-target.js
 *
 * This script enforces the Gemma 4 product target by scanning the repository
 * for legacy Gemma 2 strings ("gemma 2", "gemma-2", "2b-it") outside of
 * archived documentation or known safe paths.
 *
 * If prohibited strings are found, the script exits with code 1, breaking the build.
 */

const { execSync } = require('child_process');
const path = require('path');

const FORBIDDEN_PATTERNS = ['gemma-2', 'gemma 2', '2b-it'];

// We only want to search in the source files, skip node_modules, dist, etc.
const EXCLUDED_DIRS = ['node_modules', 'dist', 'build', '.git', '.next', 'coverage', '.agent'];

const ALLOWED_FILES = [
  'docs/epics/GEMMA_MODEL_INSTALLATION_STRATEGY.md',
  'AGENTS.md',
  'GEMINI.md',
  'scripts/ops/verify-gemma-target.js', // Allow this script itself
  'apps/api/src/services/agent/__tests__/gemma-model-source-registry.test.ts', // Allow tests that verify absence
];

function runRipgrep() {
  const isWindows = process.platform === 'win32';
  try {
    const patterns = FORBIDDEN_PATTERNS.map((p) => `-e "${p}"`).join(' ');
    const exclusions = EXCLUDED_DIRS.map((d) => `--glob "!**/${d}/**"`).join(' ');

    const command = `npx ripgrep -i ${patterns} ${exclusions} .`;

    // ripgrep exits with 0 if it finds matches, 1 if no matches found
    let output = '';
    try {
      output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
      if (e.status === 1) {
        // This is the success case! Ripgrep found no matches.
        return { matches: [] };
      }
      throw e;
    }

    if (output) {
      const lines = output.trim().split('\n');
      const matches = lines.map((line) => {
        const separatorIndex = isWindows
          ? line.indexOf('.ts:') !== -1
            ? line.indexOf('.ts:') + 3
            : line.indexOf('.md:') !== -1
              ? line.indexOf('.md:') + 3
              : line.indexOf(':')
          : line.indexOf(':');
        const file = separatorIndex !== -1 ? line.substring(0, separatorIndex) : line;
        return file;
      });
      return { matches: [...new Set(matches)] }; // Unique files
    }

    return { matches: [] };
  } catch (error) {
    console.error('Error running ripgrep:', error.message);
    process.exit(1);
  }
}

function verify() {
  console.log('Verifying codebase against legacy Gemma 2 references...');
  const { matches } = runRipgrep();

  const violatingFiles = matches.filter((file) => {
    // Normalize path for comparison
    const normalizedFile = file.replace(/\\/g, '/');
    return !ALLOWED_FILES.some((allowed) => normalizedFile.endsWith(allowed));
  });

  if (violatingFiles.length > 0) {
    console.error('\nERROR: Found prohibited Gemma 2 references in active codebase files:');
    violatingFiles.forEach((f) => console.error(` - ${f}`));
    console.error('\nKeimenon targets Gemma 4 exclusively. Please remove these legacy references.');
    console.error(
      'If these are legitimate historical references, add them to the ALLOWED_FILES list in verify-gemma-target.js.'
    );
    process.exit(1);
  } else {
    console.log('Verification passed: No prohibited Gemma 2 references found.');
    process.exit(0);
  }
}

verify();
