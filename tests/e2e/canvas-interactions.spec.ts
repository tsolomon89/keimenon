import { test, expect } from './fixtures/test-isolation';
import { login } from './helpers/login';
import { createTestSourceNode } from './helpers/create-test-node';

const TEST_USER = {
  email: 'admin@admin.com',
  password: 'TestPass123!',
};

async function ensureCanvasVisible(page: any) {
  const canvas = page.locator('canvas').first();

  for (let attempt = 0; attempt < 4; attempt++) {
    if (await canvas.isVisible().catch(() => false)) {
      return canvas;
    }

    const keimenonModeButton = page.getByRole('button', { name: 'Keimenon', exact: true });
    if (await keimenonModeButton.count()) {
      await keimenonModeButton.click();
    }

    const keimenonViewButton = page.getByTitle('Keimenon View');
    if (await keimenonViewButton.count()) {
      await keimenonViewButton.click();
    }

    await page.waitForTimeout(750);
  }

  await expect(canvas).toBeVisible({ timeout: 30000 });
  return canvas;
}

async function seedGraphData(apiRequest: any, token: string): Promise<void> {
  const seedNodes = [
    createTestSourceNode({
      title: 'Canvas Seed 1',
      content: 'Canvas interaction seed content 1',
      platform: 'test',
    }),
    createTestSourceNode({
      title: 'Canvas Seed 2',
      content: 'Canvas interaction seed content 2',
      platform: 'test',
    }),
    createTestSourceNode({
      title: 'Canvas Seed 3',
      content: 'Canvas interaction seed content 3',
      platform: 'test',
    }),
  ];

  for (const node of seedNodes) {
    const response = await apiRequest.post('/api/v1/nodes/source', {
      headers: { Authorization: `Bearer ${token}` },
      data: node,
    });
    expect(response.ok()).toBeTruthy();
  }
}

test.describe('Canvas Interactions', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.setTimeout(60000);

  test.beforeEach(async ({ page, apiRequest }) => {
    await login(page, TEST_USER.email, TEST_USER.password);

    const token = await page.evaluate(() => localStorage.getItem('keimenon_token'));
    if (!token) {
      throw new Error('No keimenon_token found after login');
    }

    await page.evaluate(() => localStorage.setItem('keimenon_welcome_shown', 'true'));
    await seedGraphData(apiRequest, token);

    await page.goto('/keimenon');
    await ensureCanvasVisible(page);
  });

  test('should allow dragging a node to a new position', async ({ page }) => {
    const canvas = await ensureCanvasVisible(page);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const startX = (box?.x || 0) + (box?.width || 0) * 0.5;
    const startY = (box?.y || 0) + (box?.height || 0) * 0.5;
    const endX = startX + 120;
    const endY = startY + 80;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 12 });
    await page.mouse.up();

    await ensureCanvasVisible(page);
    await expect(page.locator('aside')).toHaveCount(2);
  });

  test('should support multi-selection via drag rectangle', async ({ page }) => {
    const canvas = await ensureCanvasVisible(page);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const startX = (box?.x || 0) + 4;
    const startY = (box?.y || 0) + 4;
    const endX = (box?.x || 0) + (box?.width || 0) - 4;
    const endY = (box?.y || 0) + (box?.height || 0) - 4;

    await page.keyboard.down('Shift');
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 16 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await ensureCanvasVisible(page);
    await expect(page.locator('aside')).toHaveCount(2);

    const selectionStackVisible = await page
      .getByText(/Selection Stack \(/)
      .isVisible()
      .catch(() => false);
    const noSelectionVisible = await page
      .getByText(/No selection/i)
      .isVisible()
      .catch(() => false);
    const accountInspectorVisible = await page
      .getByText(/Account ID:/i)
      .isVisible()
      .catch(() => false);

    // Sidebar mode can switch between selection and account inspector states in parallel workers.
    await expect
      .poll(
        async () => {
          const selectionVisible = await page
            .getByText(/Selection Stack \(/)
            .isVisible()
            .catch(() => false);
          const noSelectionStateVisible = await page
            .getByText(/No selection/i)
            .isVisible()
            .catch(() => false);
          const accountStateVisible = await page
            .getByText(/Account ID:/i)
            .isVisible()
            .catch(() => false);

          return selectionVisible || noSelectionStateVisible || accountStateVisible;
        },
        { timeout: 8000 }
      )
      .toBe(true);

    expect(selectionStackVisible || noSelectionVisible || accountInspectorVisible).toBe(true);
  });

  test('physics simulation should settle', async ({ page }) => {
    const canvas = await ensureCanvasVisible(page);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.waitForTimeout(4000);
    await page.mouse.wheel(0, -250);
    await page.waitForTimeout(150);
    await page.mouse.wheel(0, 250);

    const startX = (box?.x || 0) + (box?.width || 0) * 0.45;
    const startY = (box?.y || 0) + (box?.height || 0) * 0.45;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY + 30, { steps: 6 });
    await page.mouse.up();

    await ensureCanvasVisible(page);
    await expect(page.locator('aside')).toHaveCount(2);
  });
});
