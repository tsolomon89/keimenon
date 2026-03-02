#!/usr/bin/env node

/**
 * Integration test runner for the API import pipeline.
 *
 * Runs integration suites that validate local SQLite behavior end-to-end.
 */

const path = require('path');
const fs = require('fs');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const results = {
  passed: [],
  failed: [],
  skipped: [],
  totalTime: 0,
};

async function runTests() {
  printHeader();
  const startTime = Date.now();

  try {
    await checkPrerequisites();

    await runTestSuite('Streaming JSON Parser', './test-streaming-parser.js');
    await runTestSuite('Sources Builder', './test-sources-builder.js');
    await runTestSuite('Code Extractor', './test-code-extractor.js');
    await runTestSuite('Similarity Engine', './test-similarity-engine.js');
    await runTestSuite('End-to-End Pipeline', './test-e2e-pipeline.js');

    results.totalTime = Date.now() - startTime;
    printSummary();
    process.exit(results.failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n${COLORS.red}x Test runner failed:${COLORS.reset} ${error.message}`);
    process.exit(1);
  }
}

function printHeader() {
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log('====================================================');
  console.log('  Keimenon Integration Tests (Local Storage)');
  console.log('====================================================');
  console.log(COLORS.reset);
}

async function checkPrerequisites() {
  console.log(`${COLORS.bright}--- Prerequisites ---${COLORS.reset}\n`);

  const testDataPath = path.resolve(
    __dirname,
    '../../../../ai_context/chat_data/test-samples/tiny.json'
  );

  if (!fs.existsSync(testDataPath)) {
    throw new Error(`Test data not found: ${testDataPath}`);
  }

  console.log(`${COLORS.green}ok${COLORS.reset} Test data found`);

  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
  }

  console.log(`${COLORS.green}ok${COLORS.reset} Environment: ${process.env.NODE_ENV}\n`);
}

async function runTestSuite(name, testFile) {
  console.log(`${COLORS.bright}--- ${name} ---${COLORS.reset}\n`);

  const testPath = path.join(__dirname, testFile);
  if (!fs.existsSync(testPath)) {
    console.log(`${COLORS.yellow}skip${COLORS.reset} File not found\n`);
    results.skipped.push({ name, reason: 'File not found' });
    return;
  }

  const startTime = Date.now();

  try {
    const testModule = require(testPath);
    if (typeof testModule.run === 'function') {
      await testModule.run();
    } else {
      throw new Error('Test module must export a run() function');
    }

    const duration = Date.now() - startTime;
    console.log(`${COLORS.green}ok${COLORS.reset} Passed (${duration}ms)\n`);
    results.passed.push({ name, duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`${COLORS.red}x${COLORS.reset} Failed (${duration}ms)`);
    console.error(`${COLORS.red}  Error:${COLORS.reset} ${error.message}`);
    if (error.stack) {
      console.error(`${COLORS.red}  Stack:${COLORS.reset}\n${error.stack}`);
    }
    console.log('');
    results.failed.push({ name, duration, error: error.message });
  }
}

function printSummary() {
  console.log(`${COLORS.bright}--- Test Summary ---${COLORS.reset}\n`);

  const total = results.passed.length + results.failed.length + results.skipped.length;
  console.log(`Total:   ${total}`);
  console.log(`${COLORS.green}Passed:  ${results.passed.length}${COLORS.reset}`);

  if (results.failed.length > 0) {
    console.log(`${COLORS.red}Failed:  ${results.failed.length}${COLORS.reset}`);
  }

  if (results.skipped.length > 0) {
    console.log(`${COLORS.yellow}Skipped: ${results.skipped.length}${COLORS.reset}`);
  }

  console.log(`Time:    ${results.totalTime}ms`);

  if (results.failed.length > 0) {
    console.log(`\n${COLORS.red}Failed Tests:${COLORS.reset}`);
    for (const test of results.failed) {
      console.log(`  - ${test.name}: ${test.error}`);
    }
  }

  if (results.skipped.length > 0) {
    console.log(`\n${COLORS.yellow}Skipped Tests:${COLORS.reset}`);
    for (const test of results.skipped) {
      console.log(`  - ${test.name}: ${test.reason}`);
    }
  }

  console.log('');

  if (results.failed.length === 0) {
    console.log(`${COLORS.bright}${COLORS.green}All tests passed${COLORS.reset}\n`);
  } else {
    console.log(`${COLORS.bright}${COLORS.red}Some tests failed${COLORS.reset}\n`);
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
