import { test, expect } from './fixtures/test-isolation';

const TEST_USER = {
  email: 'admin@admin.com',
  password: 'TestPass123!',
};

async function loginViaApiAndBootstrapPage(page: any, apiRequest: any): Promise<string> {
  const loginResponse = await apiRequest.post('/api/v1/auth/login', {
    data: TEST_USER,
  });
  expect(loginResponse.ok()).toBeTruthy();

  const body = await loginResponse.json();
  let token = body?.token;

  if (!token && body?.requiresAccountSelection && body?.tempToken && body?.availableAccounts?.[0]) {
    const adminAccount =
      body.availableAccounts.find((a: any) => a.accountType === 'admin') ||
      body.availableAccounts[0];
    const selectResponse = await apiRequest.post('/api/v1/auth/select-account', {
      data: {
        tempToken: body.tempToken,
        accountId: adminAccount.accountId,
      },
    });
    expect(selectResponse.ok()).toBeTruthy();
    const selectBody = await selectResponse.json();
    token = selectBody?.token;
  }

  expect(typeof token).toBe('string');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((resolvedToken: string) => {
    localStorage.setItem('keimenon_token', resolvedToken);
    localStorage.setItem('keimenon_welcome_shown', 'true');
    localStorage.removeItem('temp_auth_token');
  }, token);

  return token;
}

test.describe('Frontend Golden Path: Canvas Selection → Scoped Conversation Payload', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.setTimeout(60000);

  test.beforeEach(async ({ page, apiRequest }) => {
    page.on('console', (msg) => console.log(msg.text()));
    page.on('pageerror', (err) => console.log(err.message));
    await loginViaApiAndBootstrapPage(page, apiRequest);
    await page.goto('/keimenon');
    // Ensure the keimenon view is fully loaded by waiting for canvas
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });
  });

  test('context_spec payload correctly excludes unsupported nodes and avoids stale state', async ({
    page,
  }) => {
    // 1. Hydrate store with deterministic test nodes (Source, Group, and unsupported Phrase)
    await page.evaluate(() => {
      const store = (window as any).__keimenonStore.getState();
      store.setNodes([
        {
          id: 'source-1',
          type: 'source',
          kind: 'Source',
          position: { x: 0, y: 0 },
          data: { label: 'Source 1' },
        },
        {
          id: 'group-1',
          type: 'group',
          kind: 'Group',
          position: { x: 0, y: 0 },
          data: { label: 'Group 1' },
        },
        {
          id: 'phrase-1',
          type: 'phrase',
          kind: 'Phrase',
          position: { x: 0, y: 0 },
          data: { label: 'Phrase 1' },
        },
      ]);
      store.selectNode('source-1', true);
      store.selectNode('group-1', true);
      store.selectNode('phrase-1', true);
    });

    // 2. Assert Selection Stack appears with 3 nodes
    await expect(page.getByText('Selection Stack (3)')).toBeVisible();

    // 3. Click Discuss Selection and verify context modal appears
    await page.getByRole('button', { name: /Discuss Selection/i }).click();

    // Assert the warning text is visible in the modal showing 1 unsupported node was excluded
    await expect(page.getByText(/Discussing 2 valid sources\/groups\./i)).toBeVisible();
    await expect(page.getByText(/1 node\(s\) omitted/i)).toBeVisible();

    // 4. Intercept the conversation creation API POST using route mock
    let postData: any = null;
    await page.route('**/api/v1/conversations', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        postData = req.postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            conversation: {
              id: 'conv-mock-1',
              title: postData?.title || 'Mock Title',
              account_id: 'acc-1',
              human_principal_id: 'hum-1',
              context_spec: postData?.context_spec,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      } else {
        await route.fallback();
      }
    });

    // Fill out the title and submit
    await page.getByPlaceholder('Research on topic X').fill('Test Conversation Scope');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Start Conversation', exact: true })
      .click();

    // Wait for modal to close indicating success
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 5. Assert the payload
    expect(postData).not.toBeNull();
    expect(postData.title).toBe('Test Conversation Scope');
    expect(postData.context_spec).toBeDefined();
    expect(postData.context_spec.source_ids).toContain('source-1');
    expect(postData.context_spec.group_ids).toContain('group-1');
    expect(postData.context_spec.source_ids).not.toContain('phrase-1');
    expect(postData.context_spec.group_ids).not.toContain('phrase-1');

    // 6. Assert stale state does not persist
    // Close the browser view and open start conversation modal again manually
    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await page.getByRole('button', { name: 'Start New Conversation', exact: true }).click();

    // Ensure the old warning isn't there
    await expect(page.getByText('Canvas Selection')).not.toBeVisible();
    await expect(page.getByText(/Discussing 2 valid sources\/groups\./i)).not.toBeVisible();
  });
});
