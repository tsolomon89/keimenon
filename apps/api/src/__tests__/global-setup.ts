import { startTestServer, stopTestServer } from './utils/test-server';

export default async function globalSetup() {
  await startTestServer();

  return async () => {
    await stopTestServer();
  };
}
