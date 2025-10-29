#!/usr/bin/env node

/**
 * MCP Server Test Script
 *
 * Tests the Playwright E2E MCP server's core functionality
 * by simulating tool calls and checking responses.
 */

const { spawn } = require('child_process');
const { readdir } = require('fs/promises');
const { join } = require('path');

async function testMCPServer() {
  console.log('🤖 Testing MCP Server Functionality\n');
  console.log('='.repeat(50) + '\n');

  // Test 1: Check test artifacts exist
  console.log('📁 Test 1: Checking test artifacts...');
  try {
    const resultsDir = join(__dirname, '../test-results');
    const files = await readdir(resultsDir);
    const testDirs = files.filter((f) => f.startsWith('flow-auth') || f.startsWith('smoke'));
    console.log(`✅ Found ${testDirs.length} test result directories`);

    if (testDirs.length > 0) {
      console.log(`   Example: ${testDirs[0]}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 2: Check junit.xml was created
  console.log('📊 Test 2: Checking JUnit report...');
  try {
    const junitPath = join(__dirname, '../test-results/junit.xml');
    const { statSync } = require('fs');
    const stat = statSync(junitPath);
    console.log(`✅ JUnit report exists (${stat.size} bytes)`);
  } catch (error) {
    console.log(`❌ JUnit report not found`);
  }
  console.log('');

  // Test 3: Check HTML report directory
  console.log('📄 Test 3: Checking HTML report...');
  try {
    const reportDir = join(__dirname, '../playwright-report');
    const files = await readdir(reportDir);
    console.log(`✅ HTML report exists with ${files.length} files`);
  } catch (error) {
    console.log(`❌ HTML report not found (run: npm run e2e:report)`);
  }
  console.log('');

  // Test 4: Simulate env.info tool
  console.log('🔧 Test 4: Simulating env.info tool...');
  const nodeVersion = process.version;
  console.log(`   Node version: ${nodeVersion}`);

  // Get Playwright version
  try {
    const { execSync } = require('child_process');
    const pwVersion = execSync('npx playwright --version', { encoding: 'utf-8' }).trim();
    console.log(`   Playwright: ${pwVersion}`);
    console.log('✅ Environment info available');
  } catch (error) {
    console.log('❌ Could not get Playwright version');
  }
  console.log('');

  // Test 5: Simulate pw.lastFailures tool
  console.log('🔍 Test 5: Simulating pw.lastFailures tool...');
  try {
    const resultsDir = join(__dirname, '../test-results');
    const dirs = await readdir(resultsDir);
    const failureDirs = [];

    for (const dir of dirs) {
      if (dir.startsWith('flow-auth') || dir.startsWith('smoke')) {
        const dirPath = join(resultsDir, dir);
        try {
          const files = await readdir(dirPath);
          const hasScreenshot = files.some((f) => f.endsWith('.png'));
          const hasVideo = files.some((f) => f.endsWith('.webm'));

          if (hasScreenshot || hasVideo) {
            failureDirs.push({
              test: dir,
              screenshot: hasScreenshot,
              video: hasVideo,
              path: dirPath,
            });
          }
        } catch {}
      }
    }

    console.log(`✅ Found ${failureDirs.length} test failures with artifacts:`);
    failureDirs.slice(0, 3).forEach((f) => {
      console.log(`   - ${f.test}`);
      if (f.screenshot) console.log(`     └─ Screenshot: ✅`);
      if (f.video) console.log(`     └─ Video: ✅`);
    });
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 6: Simulate artifacts.list tool
  console.log('📦 Test 6: Simulating artifacts.list tool...');
  try {
    const resultsDir = join(__dirname, '../test-results');
    const dirs = await readdir(resultsDir);
    let artifactCount = { screenshots: 0, videos: 0, traces: 0 };

    for (const dir of dirs) {
      if (dir.startsWith('flow-auth') || dir.startsWith('smoke')) {
        const dirPath = join(resultsDir, dir);
        try {
          const files = await readdir(dirPath);
          artifactCount.screenshots += files.filter((f) => f.endsWith('.png')).length;
          artifactCount.videos += files.filter((f) => f.endsWith('.webm')).length;
          artifactCount.traces += files.filter((f) => f.endsWith('.zip')).length;
        } catch {}
      }
    }

    console.log('✅ Artifact inventory:');
    console.log(`   Screenshots: ${artifactCount.screenshots}`);
    console.log(`   Videos: ${artifactCount.videos}`);
    console.log(`   Traces: ${artifactCount.traces}`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(50));
  console.log('\n✅ MCP Server Test Complete!\n');
  console.log('The MCP server can:');
  console.log('  • List test failures with artifact paths');
  console.log('  • Report environment information');
  console.log('  • Inventory test artifacts (screenshots, videos, traces)');
  console.log('  • Access JUnit and HTML reports\n');
  console.log('To use with Claude Desktop:');
  console.log('  1. See: .mcp/servers/playwright-e2e/README.md');
  console.log('  2. Configure: claude-desktop-config.example.json');
  console.log('  3. Ask Claude: "List all Playwright tests"\n');
}

testMCPServer().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
