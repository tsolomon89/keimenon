#!/usr/bin/env node

/**
 * Integration Test Runner
 *
 * Runs end-to-end tests on the chat import pipeline using real data
 * Tests: Streaming parser, Sources builder, Code extractor, Similarity engine
 */

const path = require('path');
const fs = require('fs');

// ANSI colors
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results
const results = {
  passed: [],
  failed: [],
  skipped: [],
  totalTime: 0,
};

/**
 * Test suite runner
 */
async function runTests() {
  printHeader();

  const startTime = Date.now();

  try {
    // Check prerequisites
    await checkPrerequisites();

    // Run test suites
    await runTestSuite('Streaming JSON Parser', './test-streaming-parser.js');
    await runTestSuite('Sources Builder', './test-sources-builder.js');
    await runTestSuite('Code Extractor', './test-code-extractor.js');
    await runTestSuite('Similarity Engine', './test-similarity-engine.js');
    await runTestSuite('End-to-End Pipeline', './test-e2e-pipeline.js');
    await runTestSuite('Neo4j Data Integrity', './test-neo4j-integrity.js');

    // Calculate total time
    results.totalTime = Date.now() - startTime;

    // Print summary
    printSummary();

    // Exit with appropriate code
    process.exit(results.failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n${COLORS.red}✗ Test runner failed:${COLORS.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Print header
 */
function printHeader() {
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧪 Keimenon - Integration Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(COLORS.reset);
}

/**
 * Check prerequisites
 */
async function checkPrerequisites() {
  console.log(`${COLORS.bright}━━━ Prerequisites ━━━${COLORS.reset}\n`);

  // Check test data exists
  const testDataPath = path.resolve(
    __dirname,
    '../../../../ai_context/chat_data/test-samples/tiny.json'
  );

  if (!fs.existsSync(testDataPath)) {
    throw new Error(`Test data not found: ${testDataPath}`);
  }

  console.log(`${COLORS.green}✓${COLORS.reset} Test data found`);

  // Check Neo4j connection (optional for some tests)
  const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  console.log(`${COLORS.blue}ℹ${COLORS.reset} Neo4j: ${neo4jUri}`);

  // Check environment
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'test';
  }

  console.log(`${COLORS.green}✓${COLORS.reset} Environment: ${process.env.NODE_ENV}\n`);
}

/**
 * Run a test suite
 */
async function runTestSuite(name, testFile) {
  console.log(`${COLORS.bright}━━━ ${name} ━━━${COLORS.reset}\n`);

  const testPath = path.join(__dirname, testFile);

  // Check if test file exists
  if (!fs.existsSync(testPath)) {
    console.log(`${COLORS.yellow}⊘${COLORS.reset} Skipped (file not found)\n`);
    results.skipped.push({ name, reason: 'File not found' });
    return;
  }

  const startTime = Date.now();

  try {
    // Dynamic import the test module
    const testModule = require(testPath);

    // Run the test
    if (typeof testModule.run === 'function') {
      await testModule.run();
    } else {
      throw new Error('Test module must export a run() function');
    }

    const duration = Date.now() - startTime;

    console.log(`${COLORS.green}✓${COLORS.reset} Passed (${duration}ms)\n`);
    results.passed.push({ name, duration });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`${COLORS.red}✗${COLORS.reset} Failed (${duration}ms)`);
    console.error(`${COLORS.red}  Error:${COLORS.reset} ${error.message}`);
    if (error.stack) {
      console.error(`${COLORS.red}  Stack:${COLORS.reset}\n${error.stack}`);
    }
    console.log('');

    results.failed.push({ name, duration, error: error.message });
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log(`${COLORS.bright}━━━ Test Summary ━━━${COLORS.reset}\n`);

  const total = results.passed.length + results.failed.length + results.skipped.length;

  console.log(`Total:    ${total}`);
  console.log(`${COLORS.green}Passed:   ${results.passed.length}${COLORS.reset}`);

  if (results.failed.length > 0) {
    console.log(`${COLORS.red}Failed:   ${results.failed.length}${COLORS.reset}`);
  }

  if (results.skipped.length > 0) {
    console.log(`${COLORS.yellow}Skipped:  ${results.skipped.length}${COLORS.reset}`);
  }

  console.log(`Time:     ${results.totalTime}ms`);

  // Show failed tests
  if (results.failed.length > 0) {
    console.log(`\n${COLORS.red}Failed Tests:${COLORS.reset}`);
    results.failed.forEach((test) => {
      console.log(`  • ${test.name}: ${test.error}`);
    });
  }

  // Show skipped tests
  if (results.skipped.length > 0) {
    console.log(`\n${COLORS.yellow}Skipped Tests:${COLORS.reset}`);
    results.skipped.forEach((test) => {
      console.log(`  • ${test.name}: ${test.reason}`);
    });
  }

  console.log('');

  // Final verdict
  if (results.failed.length === 0) {
    console.log(`${COLORS.bright}${COLORS.green}✓ All tests passed!${COLORS.reset}\n`);
  } else {
    console.log(`${COLORS.bright}${COLORS.red}✗ Some tests failed${COLORS.reset}\n`);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
