#!/usr/bin/env node

/**
 * Diagnose Modules Script
 *
 * Queries the /health/modules endpoint to detect module loading issues.
 * Useful for diagnosing HMR cache poisoning and module resolution problems.
 *
 * Usage:
 *   npm run diagnose-modules
 *   node scripts/diagnose-modules.js
 *   node scripts/diagnose-modules.js --url http://127.0.0.1:4001
 *
 * Exit Codes:
 *   0 - All modules healthy
 *   1 - Module health check failed or server unreachable
 */

const http = require('http');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const urlArg = args.find((arg) => arg.startsWith('--url='));
  const baseUrl = urlArg ? urlArg.split('=')[1] : 'http://127.0.0.1:4001';
  return baseUrl;
}

async function checkModuleHealth(baseUrl) {
  const url = new URL('/health/modules', baseUrl);

  return new Promise((resolve, reject) => {
    const req = http.get(url.toString(), (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout after 5 seconds'));
    });
  });
}

function printModuleStatus(modules) {
  log('\n📊 Module Status:', colors.bright);
  log('─'.repeat(60), colors.cyan);

  for (const [name, status] of Object.entries(modules)) {
    const icon = status.loaded ? '✅' : '❌';
    const nameColor = status.loaded ? colors.green : colors.red;

    log(`\n${icon} ${name}`, nameColor);
    log(`   Loaded: ${status.loaded}`, colors.reset);

    if (status.responsive !== undefined) {
      log(`   Responsive: ${status.responsive}`, colors.reset);
    }

    if (status.error) {
      log(`   Error: ${status.error}`, colors.red);
    }
  }

  log('─'.repeat(60), colors.cyan);
}

function printIssues(issues) {
  if (issues.length === 0) return;

  log('\n⚠️  Issues Detected:', colors.yellow);
  log('─'.repeat(60), colors.cyan);

  for (const issue of issues) {
    log(`\n• ${issue.module}`, colors.bright);
    log(`  ${issue.issue}`, colors.yellow);
  }

  log('─'.repeat(60), colors.cyan);
}

function printRecommendations(issues) {
  if (issues.length === 0) return;

  log('\n💡 Recommendations:', colors.blue);
  log('─'.repeat(60), colors.cyan);

  const recommendations = new Set();

  for (const issue of issues) {
    if (issue.issue.includes('Not loaded') || issue.issue.includes('not initialized')) {
      recommendations.add('• Restart the API server: npm run kill-ports && npm run dev');
    }
    if (issue.issue.includes('connectivity') || issue.issue.includes('responsive')) {
      recommendations.add('• Check database connection and file permissions');
    }
    if (issue.module === 'workerPool' || issue.module === 'jobRepository') {
      recommendations.add('• Verify job system initialization in apps/api/src/index.ts');
    }
  }

  recommendations.forEach((rec) => log(rec, colors.blue));

  log('─'.repeat(60), colors.cyan);
}

async function main() {
  const baseUrl = parseArgs();

  log('\n🔍 Module Health Diagnostic', colors.bright + colors.cyan);
  log(`📍 Server: ${baseUrl}`, colors.reset);

  try {
    const { statusCode, data } = await checkModuleHealth(baseUrl);

    log(`\n🌐 HTTP Status: ${statusCode}`, colors.reset);
    log(`⏰ Timestamp: ${data.timestamp}`, colors.reset);
    log(`🏷️  Environment: ${data.environment}`, colors.reset);

    const isHealthy = data.healthy && statusCode === 200;
    const healthIcon = isHealthy ? '✅' : '❌';
    const healthColor = isHealthy ? colors.green : colors.red;

    log(
      `\n${healthIcon} Overall Health: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`,
      healthColor + colors.bright
    );

    if (data.modules) {
      printModuleStatus(data.modules);
    }

    if (data.issues && data.issues.length > 0) {
      printIssues(data.issues);
      printRecommendations(data.issues);
    }

    if (!isHealthy) {
      log('\n❌ Module health check failed!', colors.red + colors.bright);
      log('   See recommendations above for troubleshooting steps.\n', colors.yellow);
      process.exit(1);
    }

    log('\n✅ All modules are healthy!\n', colors.green + colors.bright);
    process.exit(0);
  } catch (error) {
    log('\n❌ Failed to connect to server!', colors.red + colors.bright);
    log(`   Error: ${error.message}`, colors.red);
    log('\n💡 Troubleshooting:', colors.blue);
    log('   1. Ensure the API server is running:', colors.blue);
    log('      npm run dev (or npm run e2e:dev for test mode)', colors.blue);
    log('   2. Check if port 4001 is in use:', colors.blue);
    log('      npm run kill-ports', colors.blue);
    log('   3. Verify the server is listening on the correct address:', colors.blue);
    log(`      curl ${baseUrl}/health\n`, colors.blue);
    process.exit(1);
  }
}

main();
