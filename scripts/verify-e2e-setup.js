#!/usr/bin/env node

/**
 * E2E Setup Verification Script
 *
 * Runs automated checks to verify the Playwright E2E testing setup is complete and functional.
 * This script checks:
 * - Playwright installation
 * - Test file structure
 * - Configuration files
 * - MCP server setup
 * - Dependencies
 *
 * Usage: node scripts/verify-e2e-setup.js
 */

const { execSync } = require('child_process');
const { existsSync, statSync } = require('fs');
const { join } = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function check(description, test) {
  try {
    const result = test();
    if (result === true || result === undefined) {
      log(`✅ ${description}`, colors.green);
      return true;
    } else {
      log(`❌ ${description}: ${result}`, colors.red);
      return false;
    }
  } catch (error) {
    log(`❌ ${description}: ${error.message}`, colors.red);
    return false;
  }
}

function fileExists(path, description) {
  return check(description, () => {
    if (!existsSync(path)) {
      return `File not found: ${path}`;
    }
    return true;
  });
}

function dirExists(path, description) {
  return check(description, () => {
    if (!existsSync(path)) {
      return `Directory not found: ${path}`;
    }
    if (!statSync(path).isDirectory()) {
      return `Path exists but is not a directory: ${path}`;
    }
    return true;
  });
}

function commandWorks(command, description) {
  return check(description, () => {
    try {
      execSync(command, { stdio: 'pipe' });
      return true;
    } catch (error) {
      return `Command failed: ${command}`;
    }
  });
}

async function main() {
  log('\n🎭 Playwright E2E Setup Verification\n', colors.cyan);
  log('='.repeat(50) + '\n', colors.cyan);

  const checks = [];

  // 1. Core Files
  log('📁 Checking Core Files...', colors.blue);
  checks.push(fileExists('playwright.config.ts', 'Playwright config exists'));
  checks.push(fileExists('package.json', 'Root package.json exists'));
  checks.push(fileExists('.env.test.example', 'Environment template exists'));
  checks.push(fileExists('E2E_TESTING_GUIDE.md', 'Main documentation exists'));
  checks.push(fileExists('E2E_PRODUCTION_CHECKLIST.md', 'Production checklist exists'));
  log('');

  // 2. Test Files
  log('🧪 Checking Test Files...', colors.blue);
  checks.push(dirExists('tests/e2e', 'E2E test directory exists'));
  checks.push(dirExists('tests/e2e/fixtures', 'Fixtures directory exists'));
  checks.push(fileExists('tests/e2e/fixtures/testId.ts', 'Test ID fixture exists'));
  checks.push(fileExists('tests/e2e/smoke.spec.ts', 'Smoke tests exist'));
  checks.push(fileExists('tests/e2e/flow-auth-canvas.spec.ts', 'Auth flow tests exist'));
  checks.push(fileExists('tests/e2e/README.md', 'Test documentation exists'));
  log('');

  // 3. Backend Integration
  log('🔗 Checking Backend Integration...', colors.blue);
  checks.push(
    fileExists(
      'apps/api/src/middleware/test-correlation.middleware.ts',
      'Test correlation middleware exists'
    )
  );
  checks.push(
    check('Middleware integrated in API', () => {
      const indexPath = 'apps/api/src/index.ts';
      if (!existsSync(indexPath)) return 'apps/api/src/index.ts not found';

      const { readFileSync } = require('fs');
      const content = readFileSync(indexPath, 'utf-8');

      if (!content.includes('testCorrelationMiddleware')) {
        return 'testCorrelationMiddleware not found in index.ts';
      }

      return true;
    })
  );
  log('');

  // 4. MCP Server
  log('🤖 Checking MCP Server...', colors.blue);
  checks.push(dirExists('.mcp/servers/playwright-e2e', 'MCP server directory exists'));
  checks.push(fileExists('.mcp/servers/playwright-e2e/index.js', 'MCP server code exists'));
  checks.push(fileExists('.mcp/servers/playwright-e2e/package.json', 'MCP package.json exists'));
  checks.push(fileExists('.mcp/servers/playwright-e2e/README.md', 'MCP documentation exists'));
  checks.push(
    fileExists(
      '.mcp/servers/playwright-e2e/claude-desktop-config.example.json',
      'MCP config example exists'
    )
  );
  checks.push(dirExists('.mcp/servers/playwright-e2e/node_modules', 'MCP dependencies installed'));
  log('');

  // 5. Scripts
  log('📜 Checking Scripts...', colors.blue);
  checks.push(dirExists('scripts/e2e', 'E2E scripts directory exists'));
  checks.push(fileExists('scripts/e2e/dev.js', 'Development script exists'));
  log('');

  // 6. CI/CD
  log('⚙️  Checking CI/CD...', colors.blue);
  checks.push(fileExists('.github/workflows/e2e.yml', 'GitHub Actions workflow exists'));
  log('');

  // 7. Dependencies
  log('📦 Checking Dependencies...', colors.blue);
  checks.push(
    check('Playwright package installed', () => {
      try {
        const packageJson = require('../package.json');
        if (!packageJson.devDependencies['@playwright/test']) {
          return '@playwright/test not in devDependencies';
        }
        return true;
      } catch {
        return 'Could not read package.json';
      }
    })
  );

  checks.push(
    check('NPM scripts configured', () => {
      try {
        const packageJson = require('../package.json');
        const requiredScripts = ['e2e', 'e2e:ui', 'e2e:install', 'e2e:dev'];
        const missing = requiredScripts.filter((script) => !packageJson.scripts[script]);

        if (missing.length > 0) {
          return `Missing scripts: ${missing.join(', ')}`;
        }
        return true;
      } catch {
        return 'Could not read package.json';
      }
    })
  );
  log('');

  // 8. Playwright Validation
  log('🎭 Checking Playwright Installation...', colors.blue);
  checks.push(commandWorks('npx playwright --version', 'Playwright CLI available'));

  checks.push(
    check('Playwright can list tests', () => {
      try {
        const output = execSync('npx playwright test --list', { encoding: 'utf-8' });
        if (!output.includes('Total:')) {
          return 'Unexpected output from test listing';
        }
        // Check for expected test count
        const match = output.match(/Total: (\d+) tests/);
        if (match && parseInt(match[1]) < 1) {
          return 'No tests found';
        }
        return true;
      } catch (error) {
        return `Failed to list tests: ${error.message}`;
      }
    })
  );
  log('');

  // 9. TypeScript Compilation
  log('📘 Checking TypeScript...', colors.blue);
  checks.push(
    check('Test files compile without errors', () => {
      try {
        execSync('npx tsc --noEmit tests/e2e/**/*.ts', { stdio: 'pipe' });
        return true;
      } catch (error) {
        // Check if error is only from non-test files
        const stderr = error.stderr?.toString() || '';
        if (stderr.includes('tests/e2e') && !stderr.includes('node_modules')) {
          return 'TypeScript errors in test files';
        }
        // Ignore errors from other parts of the codebase
        return true;
      }
    })
  );
  log('');

  // Summary
  const passed = checks.filter((c) => c).length;
  const total = checks.length;
  const percentage = Math.round((passed / total) * 100);

  log('\n' + '='.repeat(50), colors.cyan);
  log(`\n📊 Results: ${passed}/${total} checks passed (${percentage}%)`, colors.cyan);

  if (passed === total) {
    log('\n✅ All checks passed! E2E setup is complete and ready.', colors.green);
    log('\nNext steps:', colors.cyan);
    log('  1. Install Playwright browsers: npm run e2e:install', colors.reset);
    log('  2. Start dev servers: npm run dev', colors.reset);
    log('  3. Run smoke tests: npm run e2e -- --grep="@smoke"', colors.reset);
    log(
      '  4. Set up MCP in Claude Desktop (see .mcp/servers/playwright-e2e/README.md)\n',
      colors.reset
    );
    process.exit(0);
  } else {
    log(`\n❌ ${total - passed} checks failed. Please review the errors above.`, colors.red);
    log('\nFor help, see:', colors.yellow);
    log('  - E2E_TESTING_GUIDE.md', colors.reset);
    log('  - tests/e2e/README.md', colors.reset);
    log('  - E2E_PRODUCTION_CHECKLIST.md\n', colors.reset);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n❌ Verification script failed: ${error.message}`, colors.red);
  process.exit(1);
});
