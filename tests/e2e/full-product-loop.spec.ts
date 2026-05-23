import { test, expect } from './fixtures/test-isolation';
import { login, getCachedAuthToken } from './helpers/login';
import { createTestSourceNode, createTestGroupNode } from './helpers/create-test-node';

test.describe('Full Browser Product Loop E2E', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.setTimeout(60000);

  test.beforeEach(async ({ page, apiRequest }) => {
    page.on('console', (msg) => console.log(msg.text()));
    page.on('pageerror', (err) => console.log(err.message));

    // 1. Login using existing helper
    await login(page, 'admin@admin.com', 'TestPass123!');
  });

  test('executes real conversation creation, message runtime, AgentRun, and provenance endpoint', async ({
    page,
    apiRequest,
  }) => {
    // 2. Seed Source and Group using real API endpoints
    const sourceData = createTestSourceNode({
      title: 'Loop Source',
      content: 'E2E loop test content',
    });
    const groupData = createTestGroupNode({ name: 'Loop Group' });

    // We must use the final account-scoped token that was saved to localStorage,
    // not the temporary token from the cache.
    const token = await page.evaluate(() => window.localStorage.getItem('keimenon_token'));
    if (!token) {
      throw new Error('Authentication token not found in localStorage after login');
    }
    const headers = { Authorization: `Bearer ${token}` };
    const sourceRes = await apiRequest.post('/api/v1/nodes/source', {
      headers,
      data: sourceData,
    });
    const sourceResText = await sourceRes.text();
    if (!sourceRes.ok()) {
      console.error('Source node creation failed:', sourceResText);
    }
    expect(sourceRes.ok(), `Source node failed: ${sourceResText}`).toBeTruthy();

    const groupRes = await apiRequest.post('/api/v1/nodes/group', {
      headers,
      data: groupData,
    });
    const groupResText = await groupRes.text();
    if (!groupRes.ok()) {
      console.error('Group node creation failed:', groupResText);
    }
    expect(groupRes.ok(), `Group node failed: ${groupResText}`).toBeTruthy();

    // 3. Ensure or create an agent principal
    const principalsRes = await apiRequest.get('/api/v1/principals?kind=agent', { headers });
    expect(principalsRes.ok()).toBeTruthy();
    const principalsBody = await principalsRes.json();
    let agentPrincipalId = principalsBody.principals?.[0]?.id;

    if (!agentPrincipalId) {
      console.log('No agent principal found. Creating one...');
      const createRes = await apiRequest.post('/api/v1/principals', {
        headers,
        data: {
          display_name: 'E2E Agent',
          principal_kind: 'agent',
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const createBody = await createRes.json();
      agentPrincipalId = createBody.principal.id;
    }
    expect(agentPrincipalId).toBeDefined();

    // 4. Navigate to /keimenon
    await page.goto('/keimenon');

    // 5. Wait for canvas/app shell
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

    // Dismiss welcome modal if it appears
    const welcomeModal = page.getByRole('dialog', { name: /Welcome to Keimenon!/i });
    try {
      await welcomeModal.waitFor({ state: 'visible', timeout: 5000 });
      await welcomeModal.getByRole('button', { name: /Close welcome modal/i }).click();
      await welcomeModal.waitFor({ state: 'hidden', timeout: 5000 });
    } catch (e) {
      // It's okay if it doesn't appear
    }

    // Wait for nodes to be loaded from the backend
    await page.waitForFunction(
      (ids) => {
        const store = (window as any).__keimenonStore?.getState();
        if (!store || !store.nodes) return false;
        const nodeIds = store.nodes.map((n: any) => n.id);
        return ids.every((id: string) => nodeIds.includes(id));
      },
      [sourceData.id, groupData.id],
      { timeout: 15000 }
    );

    // 6. Select both nodes through store.selectNode(...)
    await page.evaluate(
      (ids) => {
        const store = (window as any).__keimenonStore.getState();
        ids.forEach((id: string) => store.selectNode(id, true));
      },
      [sourceData.id, groupData.id]
    );

    // 8. Click Discuss Selection
    await page.getByRole('button', { name: /Discuss Selection/i }).click();

    // Wait for the conversation creation modal
    await expect(page.getByText(/Discussing 2 valid sources\/groups\./i)).toBeVisible();

    // Fill the purpose
    await page.getByPlaceholder('Research on topic X').fill('Analyze the seeded loop data');

    // Select the agent
    const agentSelect = page.getByLabel(/Agent \(optional\)/i);
    await expect(agentSelect).toBeVisible();
    await agentSelect.selectOption({ label: 'E2E Agent' });

    // 9. Start conversation through real backend
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Start Conversation', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 11. Assert ConversationSynthesisView opens and click "Launch Runtime"
    await expect(page.getByRole('button', { name: 'Launch Runtime', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Launch Runtime', exact: true }).click();

    // 12. Assert ConversationMessageRuntime opens
    // Wait for the conversation view to appear
    await expect(page.getByPlaceholder('Message runtime...')).toBeVisible();

    // 12. Assert context bounds are shown
    await expect(page.getByText(/Loop Source/i).first()).toBeVisible();
    await expect(page.getByText(/Loop Group/i).first()).toBeVisible();

    // 13. Send message
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/messages') && response.request().method() === 'POST'
    );
    await page.getByPlaceholder('Message runtime...').fill('Hello, please synthesize the context.');
    await page.keyboard.press('Enter');
    const msgRes = await responsePromise;
    console.log('Message response:', msgRes.status(), await msgRes.text());

    // 14. Assert user message appears
    await expect(page.getByText('Hello, please synthesize the context.').first()).toBeVisible();

    // 15. Assert assistant message appears via mock provider
    // The mock provider responds with "Mocked Assistant Response..."
    const assistantMessage = page.getByText(/Mocked Assistant Response/).last();
    await expect(assistantMessage).toBeVisible({ timeout: 15000 });

    // 16. Assert AgentRun metadata appears
    // The "View Provenance" button should appear
    const provenanceBtn = page.getByRole('button', { name: /View Provenance/i }).last();
    await expect(provenanceBtn).toBeVisible({ timeout: 10000 });

    // 17. Click View Provenance
    await provenanceBtn.click();

    // 18. Assert ProvenanceViewerModal opens
    const provenanceModal = page.getByRole('dialog').filter({ hasText: /Provenance/i });
    await expect(provenanceModal).toBeVisible();

    // Wait for hydration/loading to complete
    await expect(provenanceModal.getByText(/Hydrating provenance subgraph.../i)).toBeHidden({
      timeout: 10000,
    });

    // 19. Assert either evidence items or empty evidence state renders
    const emptyState = provenanceModal.getByText(/No explicit evidence was bound to this run/i);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    // We expect the mock provider to not have explicit evidence attached unless we mocked that too.
    // If it has evidence, it will show "Evidence Provenance Subgraph"
    const hasEvidence = await provenanceModal
      .getByText(/Evidence Provenance Subgraph/i)
      .isVisible()
      .catch(() => false);

    expect(hasEvidence || hasEmptyState).toBeTruthy();
  });
});
