import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Desktop app launches and renders login shell', async () => {
  const packagedExe = path.join(__dirname, '../../desktop/out/win-unpacked/Keimenon.exe');
  const mainScript = path.join(__dirname, '../../desktop/dist/main.js');
  const isPackaged = fs.existsSync(packagedExe);
  console.log(`Launching app from: ${isPackaged ? packagedExe : mainScript}`);

  const launchEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch(
    isPackaged
      ? {
          executablePath: packagedExe,
          env: {
            ...launchEnv,
            NEXT_PUBLIC_E2E_TESTING: 'true',
            API_PORT: process.env.API_PORT || '4001',
          },
        }
      : {
          args: [mainScript],
          env: {
            ...launchEnv,
            NODE_ENV: 'development',
            FORCE_BUNDLED: 'true',
            NEXT_PUBLIC_E2E_TESTING: 'true',
            API_PORT: process.env.API_PORT || '4001',
          },
        }
  );

  app.process().stdout?.on('data', (data) => {
    console.log(`[Main stdout]: ${data.toString()}`);
  });
  app.process().stderr?.on('data', (data) => {
    console.error(`[Main stderr]: ${data.toString()}`);
  });

  try {
    const window = await app.firstWindow();
    window.on('console', (msg) => console.log(`[Renderer]: ${msg.text()}`));

    await window.waitForLoadState('domcontentloaded');

    const title = await window.title();
    expect(title).toBe('Keimenon');

    // Wait for backend initialization gate to dismiss - must NOT be stuck at startup!
    await expect(window.getByText('Preparing backend services', { exact: false })).toBeHidden({
      timeout: 30000,
    });
    await expect(window.getByText('Keimenon Startup', { exact: false })).toBeHidden({
      timeout: 30000,
    });

    // Verify genuine interactive shell rendered (Login form or active Dashboard)
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
