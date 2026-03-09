import { test, expect, type Page } from '../fixtures/test-isolation';
import { login } from '../helpers/login';
import path from 'path';
import fs from 'fs';

// Configuration
const TARGET_SIZE_MB = 500; // 500MB for reasonable test duration, scalable to 1GB
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function dismissWelcomeModal(page: Page): Promise<void> {
  const getStartedButton = page.getByRole('button', { name: /get started/i });
  if (await getStartedButton.isVisible({ timeout: 10000 }).catch(() => false)) {
    await getStartedButton.click({ force: true });
    await getStartedButton.waitFor({ state: 'hidden', timeout: 5000 });
  }
}

test.describe('Huge File Scenario', () => {
  let largeFilePath: string;

  test.beforeAll(async () => {
    // Use existing real-world huge file provided by user
    largeFilePath = path.resolve(__dirname, '../../test_data/chat_data/claude_conversations.json');

    // Verify it exists, else fail fast (or fallback to smaller one for CI if needed, but strict req is huge file)
    if (!fs.existsSync(largeFilePath)) {
      throw new Error(
        `Huge test file not found at: ${largeFilePath}. Please ensure test_data is populated.`
      );
    }

    const stats = fs.statSync(largeFilePath);
    console.log(`Using test file: ${largeFilePath}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  });

  // No cleanup needed for read-only static test data
  // test.afterAll(() => { ... });

  test('should handle massive file upload with concurrent UI usage', async ({ page }) => {
    test.setTimeout(TIMEOUT_MS);

    // 1. Login
    await login(page, 'admin@admin.com', 'TestPass123!');
    // 2. Open import rail from either welcome modal CTA or shell action button
    const welcomeDialog = page.getByRole('dialog', { name: /welcome to keimenon/i });
    const welcomeImportButton = welcomeDialog.getByRole('button', {
      name: /import chat conversations/i,
    });

    if (await welcomeImportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await welcomeImportButton.click({ force: true });
    } else {
      await dismissWelcomeModal(page);
      const openImportButton = page.getByRole('button', { name: /upload sources/i }).first();
      await openImportButton.click();
    }

    await expect(page.getByTestId('chat-import-modal')).toBeVisible();

    // 3. Start Upload
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles(largeFilePath);

    // Wait for config stage and trigger real import job creation/upload
    const importButton = page.getByRole('button', { name: /import & review/i });
    await expect(importButton).toBeVisible({ timeout: 120000 });
    await importButton.click();

    // 4. Lifecycle check: Pause/Resume during active upload
    console.log('Upload started. Waiting for progress...');

    // Wait for "Pause Upload" button to appear (indicates upload has started)
    const pauseButton = page.getByRole('button', { name: 'Pause Upload' });
    await expect(pauseButton).toBeVisible({ timeout: 120000 });

    // Allow some progress
    await page.waitForTimeout(2000);

    // PAUSE
    console.log('Testing Pause...');
    await pauseButton.click();

    // Verify "Resume Upload" appears
    const resumeButton = page.getByRole('button', { name: 'Resume Upload' });
    await expect(resumeButton).toBeVisible();
    console.log('Upload paused successfully.');

    // RESUME
    console.log('Testing Resume...');
    await expect(resumeButton).toBeVisible();
    await resumeButton.click();

    // Verify "Pause Upload" returns (resumed)
    await expect(pauseButton).toBeVisible();
    console.log('Upload resumed successfully.');

    // 5. Concurrency check: close modal during active upload and keep using shell controls.
    await page.getByRole('button', { name: /close import modal/i }).click();
    await expect(page.getByTestId('chat-import-modal')).toBeHidden();

    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Keimenon', exact: true }).click();
    await expect(page.getByRole('button', { name: /upload sources/i }).first()).toBeVisible();
  });
});
