import { test, expect } from '@playwright/test';
import { generateLargeDataset, cleanupLargeFile } from '../utils/large-file-generator';
import path from 'path';
import fs from 'fs';

// Configuration
const TARGET_SIZE_MB = 500; // 500MB for reasonable test duration, scalable to 1GB
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

test.describe('Huge File Scenario', () => {
  let largeFilePath: string;

  test.beforeAll(async () => {
    // Use existing real-world huge file provided by user
    largeFilePath = path.resolve(__dirname, '../../test_data/chat_data/claude_conversations.json');
    
    // Verify it exists, else fail fast (or fallback to smaller one for CI if needed, but strict req is huge file)
    if (!fs.existsSync(largeFilePath)) {
      throw new Error(`Huge test file not found at: ${largeFilePath}. Please ensure test_data is populated.`);
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
    await page.goto('/');
    // Assuming auth bypass or standard login. 
    // If auth required:
    // await page.getByLabel('Email').fill('admin@example.com');
    // await page.getByLabel('Password').fill('password');
    // await page.getByRole('button', { name: 'Sign In' }).click();
    // await expect(page.getByText('Dashboard')).toBeVisible();

    // 2. Go to Data Management / Upload
    await page.goto('/settings/data');
    await expect(page.getByText('Data Management')).toBeVisible();

    // 3. Start Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(largeFilePath);

    // 4. Concurrency & Lifecycle Check: Pause/Resume
    console.log('Upload started. Waiting for progress...');
    
    // Wait for "Pause Upload" button to appear (indicates upload has started)
    const pauseButton = page.getByRole('button', { name: 'Pause Upload' });
    await expect(pauseButton).toBeVisible({ timeout: 60000 });
    
    // Allow some progress
    await page.waitForTimeout(2000);
    
    // PAUSE
    console.log('Testing Pause...');
    await pauseButton.click();
    
    // Verify "Resume Upload" appears
    const resumeButton = page.getByRole('button', { name: 'Resume Upload' });
    await expect(resumeButton).toBeVisible();
    console.log('Upload paused successfully.');
    
    // Interact with other elements while paused (Concurrency verify)
    await page.getByRole('tab', { name: 'Appearance' }).click();
    await page.getByRole('tab', { name: 'Data' }).click();
    
    // RESUME
    console.log('Testing Resume...');
    // Re-locate button as we navigated away (if SPA state preserved) or if modal persisted
    // NOTE: Navigating away might close the modal if not persistent. 
    // Assuming modal stays open or we just check status in table. 
    // Actually, ChatImportModal usually closes on navigate? 
    // Let's NOT navigate away if it closes modal. 
    // Instead, just click Resume.
    await expect(resumeButton).toBeVisible(); 
    await resumeButton.click();
    
    // Verify "Pause Upload" returns (resumed)
    await expect(pauseButton).toBeVisible();
    console.log('Upload resumed successfully.');

    // 5. Wait for Completion (or longer timeout)
    // Given 1.1GB, full completion takes time. We verify the "Processing" stage starts.
    // The modal changes to "Analysis" or "Config" after upload.
    // We wait for the "Pause" button to disappear (upload done)
    await expect(pauseButton).toBeHidden({ timeout: TIMEOUT_MS });
    
    // Check for success message or next stage
    await expect(page.getByText('Import Job Created Successfully')).toBeVisible({ timeout: TIMEOUT_MS });
    
    // Check if it appears in Graph Explorer (optional deep verification)
    // await page.goto('/explorer');
    // await expect(page.getBodyText('large_dataset')).toBeVisible();
  });
});
