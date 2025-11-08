/**
 * Global Test Setup
 *
 * Starts the test server once before all tests and ensures it is stopped
 * when the process exits.
 */

import { before } from 'node:test';
import { startTestServer, stopTestServer, isTestServerRunning } from './utils/test-server';

let setupComplete = false;

before(
  async () => {
    if (!setupComplete) {
      console.log('\ndYs? Starting global test server...');
      await startTestServer();
      setupComplete = true;
      console.log('?o. Global test server ready\n');
    }
  },
  { timeout: 60000 }
);

const handleShutdown = async () => {
  if (setupComplete && isTestServerRunning()) {
    console.log('\ndY\u00151 Stopping global test server...');
    await stopTestServer();
    setupComplete = false;
    console.log('?o. Global test server stopped\n');
  }
};

process.once('SIGINT', async () => {
  await handleShutdown();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await handleShutdown();
  process.exit(0);
});

process.once('exit', () => {
  if (setupComplete && isTestServerRunning()) {
    void stopTestServer();
    setupComplete = false;
  }
});
