import { isTestServerRunning, stopTestServer } from './utils/test-server';

export default async function globalTeardown() {
  if (isTestServerRunning()) {
    await stopTestServer();
  }
}
