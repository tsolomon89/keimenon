import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Desktop app launches and renders login shell', async () => {
  const mainScript = path.join(__dirname, '../../desktop/dist/main.js');
  console.log(`Launching app from: ${mainScript}`);

  const launchEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: [mainScript],
    env: {
      ...launchEnv,
      NODE_ENV: 'development',
      FORCE_BUNDLED: 'true',
      NEXT_PUBLIC_E2E_TESTING: 'true',
      KEIMENON_SKIP_EMBEDDED_API: 'true',
      API_PORT: '4001',
    },
  });

  try {
    const window = await app.firstWindow();
    window.on('console', (msg) => console.log(`[Renderer]: ${msg.text()}`));

    await window.waitForLoadState('domcontentloaded');

    const title = await window.title();
    expect(title).toBe('Keimenon');

    await expect
      .poll(
        async () => {
          const hasLogin = (await window.locator('input[name="email"]').count()) > 0;
          const hasWelcomeModal =
            (await window.getByText('Welcome to Keimenon!', { exact: false }).count()) > 0;
          const hasDashboard =
            (await window.getByText('Manager Dashboard', { exact: false }).count()) > 0;
          return hasLogin || hasWelcomeModal || hasDashboard;
        },
        { timeout: 15000 }
      )
      .toBe(true);
  } finally {
    await app.close();
  }
});
