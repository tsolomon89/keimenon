/**
 * Global Test Setup
 *
 * Starts the test server once before all tests and stops it after.
 * This file should be imported by test files that need the API server.
 */

import { before, after } from 'node:test';
import { startTestServer, stopTestServer } from './utils/test-server';

// Track if setup has run
let setupComplete = false;

// Global setup - runs once before all tests
before(async () => {
  if (!setupComplete) {
    console.log('\n🚀 Starting global test server...');
    await startTestServer();
    setupComplete = true;
    console.log('✅ Global test server ready\n');
  }
}, 60000); // 60 second timeout for server startup

// Global teardown - runs once after all tests
after(async () => {
  if (setupComplete) {
    console.log('\n🧹 Stopping global test server...');
    await stopTestServer();
    setupComplete = false;
    console.log('✅ Global test server stopped\n');
  }
}, 30000); // 30 second timeout for cleanup
