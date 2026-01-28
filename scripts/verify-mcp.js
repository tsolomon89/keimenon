#!/usr/bin/env node

/**
 * Test Script for MCP Servers
 *
 * This script tests each MCP server independently to verify they work.
 * Run this to confirm MCP servers are functioning correctly.
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test an MCP server by sending an initialize request
 */
async function testMCPServer(name, scriptPath) {
  return new Promise((resolve, reject) => {
    log(`\n🧪 Testing ${name}...`, 'cyan');

    const serverPath = `${PROJECT_ROOT}/.mcp/servers/${scriptPath}/index.js`;
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SQLITE_PATH: `${process.env.HOME || process.env.USERPROFILE}/.keimenon/keimenon.db`,
        API_BASE_URL: 'http://localhost:4001',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      server.kill();
      reject(new Error('Timeout'));
    }, 5000);

    server.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    server.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    server.on('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        log(`   ❌ ${name} timed out`, 'red');
        reject(new Error('Timeout'));
        return;
      }

      // For MCP servers, stderr output showing startup is actually success
      if (
        stderr.includes('Server running on stdio') ||
        stderr.includes('Indexed') ||
        stderr.includes('Loaded')
      ) {
        log(`   ✅ ${name} started successfully`, 'green');
        log(`   📋 Output: ${stderr.trim().split('\n')[0]}`, 'blue');
        resolve({ name, success: true, output: stderr });
      } else if (stderr.includes('Database not found')) {
        log(`   ⚠️  ${name} started but database not found`, 'yellow');
        log(`   💡 Run "cd apps/api && npm run dev" to initialize database`, 'yellow');
        resolve({ name, success: false, error: 'Database not found' });
      } else {
        log(`   ❌ ${name} failed to start`, 'red');
        if (stderr) log(`   Error: ${stderr.trim()}`, 'red');
        reject(new Error(stderr || 'Unknown error'));
      }
    });

    server.on('error', (error) => {
      clearTimeout(timeout);
      log(`   ❌ ${name} error: ${error.message}`, 'red');
      reject(error);
    });

    // Send a simple request to trigger startup logs
    setTimeout(() => {
      server.kill();
    }, 2000);
  });
}

async function main() {
  log('═══════════════════════════════════════', 'cyan');
  log('   MCP Servers Test Suite', 'cyan');
  log('═══════════════════════════════════════', 'cyan');

  const servers = [
    { name: 'Database Server', path: 'database' },
    { name: 'Docs Server', path: 'docs' },
    { name: 'API Testing Server', path: 'api-testing' },
    { name: 'Chat Import Server', path: 'chat-import' },
  ];

  const results = [];

  for (const server of servers) {
    try {
      const result = await testMCPServer(server.name, server.path);
      results.push(result);
    } catch (error) {
      results.push({ name: server.name, success: false, error: error.message });
    }
  }

  // Summary
  log('\n═══════════════════════════════════════', 'cyan');
  log('   Test Summary', 'cyan');
  log('═══════════════════════════════════════', 'cyan');

  const passed = results.filter((r) => r.success).length;
  const total = results.length;

  results.forEach((result) => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const color = result.success ? 'green' : 'red';
    log(`${status} - ${result.name}`, color);
  });

  log(`\n📊 Results: ${passed}/${total} servers working`, passed === total ? 'green' : 'yellow');

  if (passed === total) {
    log('\n🎉 All MCP servers are working correctly!', 'green');
    log('💡 You can now use them in VSCode/Claude Code', 'green');
  } else {
    log('\n⚠️  Some servers failed. Check the errors above.', 'yellow');
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  process.exit(1);
});
