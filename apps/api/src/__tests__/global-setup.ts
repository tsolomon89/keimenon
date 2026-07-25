import { startTestServer, stopTestServer } from './utils/test-server';
import path from 'path';
import fs from 'fs';

export default async function globalSetup() {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const testDbsDir = path.join(projectRoot, '.test-dbs');

  // Clean .test-dbs from previous runs
  if (fs.existsSync(testDbsDir)) {
    try {
      fs.rmSync(testDbsDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('[global-setup] Pre-test cleanup failed:', err);
    }
  }

  await startTestServer();

  // Write the server's initialized DB path to db-path.txt for workers
  fs.mkdirSync(testDbsDir, { recursive: true });
  fs.writeFileSync(path.join(testDbsDir, 'db-path.txt'), process.env.DB_PATH!);

  return async () => {
    await stopTestServer();

    // Clean .test-dbs after all runs complete
    if (fs.existsSync(testDbsDir)) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          fs.rmSync(testDbsDir, { recursive: true, force: true });
          break;
        } catch (err) {
          if (attempt === 5) {
            console.warn(`[global-setup] Post-test cleanup failed after 5 attempts:`, err);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          }
        }
      }
    }
  };
}
