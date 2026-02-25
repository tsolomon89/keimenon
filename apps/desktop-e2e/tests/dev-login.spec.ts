import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Dev Login Flow', async () => {
  // Path to the main process entry point
  const mainScript = path.join(__dirname, '../../desktop/dist/main.js');
  console.log(`Launching app from: ${mainScript}`);

  const app = await electron.launch({
    args: [mainScript],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      FORCE_BUNDLED: 'true', // Force loading from local web-dist instead of localhost:3000
      NEXT_PUBLIC_E2E_TESTING: 'true',
    },
  });

  try {
    const window = await app.firstWindow();
    window.on('console', msg => console.log(`[Renderer]: ${msg.text()}`));
    
    // Clear storage to ensure clean login state (prevent auto-login)
    await window.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    console.log('Cleared storage, reloading...');
    await window.reload();
  
  // Reload to capture startup logs that might have happened before we attached listener
  // console.log('Reloading window to capture startup logs...');
  // await window.reload();
  // await window.waitForLoadState('domcontentloaded');

    await window.waitForLoadState('domcontentloaded');

    const title = await window.title();
    console.log(`Window title: ${title}`);
    expect(title).toBe('Keimenon');

    // Screenshot for startup verification
    await window.screenshot({ path: 'startup.png' });

    // console.log('Clicking Auto-Fill Dev...');
    // await window.getByText('🚀 Auto-Fill Dev').click();

    // Verify inputs filled (Manual fill to avoid async fetch hangs in the UI)
    await window.locator('input[name="email"]').fill('admin@admin.com');
    await window.locator('input[name="password"]').fill('admin123');
    await expect(window.locator('input[name="email"]')).toHaveValue('admin@admin.com');

    // Click Sign In
    console.log('Signing in...');
    await window.getByRole('button', { name: /Sign In/i }).click();

    // Wait for navigation/dashboard (simple check for now)
    // Use a specific timeout as API/DB init might take a moment
    // Verify Manager Dashboard loads (Admin view)
    await expect(window.getByText('Manager Dashboard', { exact: false })).toBeVisible({ timeout: 15000 });
    
    console.log('Dashboard loaded!');
    await window.screenshot({ path: 'dashboard.png' });
  } catch (error) {
    console.error('Test Failed!', error);
    // Try to dump page content if window is still open
    try {
      if (app) {
        const window = await app.firstWindow();
        const content = await window.content();
        console.log('--- PAGE CONTENT DUMP ---');
        console.log(content);
        console.log('--- END CONTENT DUMP ---');
        await window.screenshot({ path: 'failure.png' });
      }
    } catch (innerError) {
      console.error('Failed to dump content:', innerError);
    }
    throw error;
  } finally {
    await app.close();
  }
});
