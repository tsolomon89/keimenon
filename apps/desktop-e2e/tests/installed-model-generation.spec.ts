import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Installed desktop application executes genuine on-device model generation with retained output and exact evidence', async ({
  request,
}) => {
  const packagedExe = path.join(__dirname, '../../desktop/out/win-unpacked/Keimenon.exe');
  const mainScript = path.join(__dirname, '../../desktop/dist/main.js');
  const isPackaged = fs.existsSync(packagedExe);
  console.log(`[InstalledE2E] Launching app from: ${isPackaged ? packagedExe : mainScript}`);

  const apiPort = process.env.API_PORT || '4001';
  const baseUrl = `http://127.0.0.1:${apiPort}`;

  const launchEnv = { ...process.env } as NodeJS.ProcessEnv;
  delete launchEnv.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch(
    isPackaged
      ? {
          executablePath: packagedExe,
          env: {
            ...launchEnv,
            NEXT_PUBLIC_E2E_TESTING: 'true',
            API_PORT: apiPort,
          },
        }
      : {
          args: [mainScript],
          env: {
            ...launchEnv,
            NODE_ENV: 'development',
            FORCE_BUNDLED: 'true',
            NEXT_PUBLIC_E2E_TESTING: 'true',
            API_PORT: apiPort,
          },
        }
  );

  app.process().stdout?.on('data', (data) => {
    console.log(`[InstalledApp stdout]: ${data.toString()}`);
  });
  app.process().stderr?.on('data', (data) => {
    console.error(`[InstalledApp stderr]: ${data.toString()}`);
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // 1. Wait for embedded backend readiness
    await expect
      .poll(
        async () => {
          try {
            const res = await request.get(`${baseUrl}/ready`);
            return res.ok();
          } catch {
            return false;
          }
        },
        { timeout: 30000, intervals: [500, 1000] }
      )
      .toBe(true);

    console.log('[InstalledE2E] Embedded backend is READY on', baseUrl);

    // 2. Authenticate with standard login
    const loginRes = await request.post(`${baseUrl}/api/v1/auth/login`, {
      data: { email: 'admin@admin.com', password: 'TestPass123!' },
    });
    expect(loginRes.ok()).toBe(true);
    const loginData = await loginRes.json();
    const token = loginData.token;
    const accountId = loginData.account?.id;
    const headers = { Authorization: `Bearer ${token}` };

    // 3. Ensure agent principal exists
    const principalsRes = await request.get(`${baseUrl}/api/v1/principals?kind=agent`, { headers });
    expect(principalsRes.ok()).toBe(true);
    const principalsBody = await principalsRes.json();
    let agentPrincipalId = principalsBody.principals?.[0]?.id;

    if (!agentPrincipalId) {
      const createPrincRes = await request.post(`${baseUrl}/api/v1/principals`, {
        headers,
        data: { display_name: 'Installed Gemma Agent', principal_kind: 'agent' },
      });
      expect(createPrincRes.ok()).toBe(true);
      const createPrincBody = await createPrincRes.json();
      agentPrincipalId = createPrincBody.principal.id;
    }
    expect(agentPrincipalId).toBeDefined();

    // 4. Create an authentic source node with content for evidence binding
    const sourceId = `src_installed_${Date.now()}`;
    const sourceData = {
      id: sourceId,
      kind: 'Source',
      created_at: Date.now(),
      updated_at: Date.now(),
      fingerprint: 'e'.repeat(64),
      mime_type: 'text/plain',
      size_bytes: 110,
      title: 'Installed App Architecture Spec',
      metadata: {
        platform: 'desktop',
        content:
          'Keimenon runs on-device local inference using Google Gemma models via native LiteRT-LM C engine with strict provenance.',
      },
    };

    const sourceRes = await request.post(`${baseUrl}/api/v1/nodes/source`, {
      headers,
      data: sourceData,
    });
    expect(sourceRes.ok()).toBe(true);

    // 5. Create a conversation bound to this source
    const convRes = await request.post(`${baseUrl}/api/v1/conversations`, {
      headers,
      data: {
        title: 'Installed App Real Model Synthesis',
        agent_principal_id: agentPrincipalId,
        context_spec: {
          source_ids: [sourceId],
          group_ids: [],
        },
      },
    });
    expect(convRes.ok()).toBe(true);
    const convBody = await convRes.json();
    const conversationId = convBody.conversation.id;
    expect(conversationId).toBeDefined();

    // 6. Execute genuine on-device model synthesis through the installed application
    console.log('[InstalledE2E] Sending message to trigger genuine on-device model synthesis...');
    const messageRes = await request.post(
      `${baseUrl}/api/v1/conversations/${conversationId}/messages`,
      {
        headers,
        data: {
          content: 'Summarize the architecture specification.',
          run_synthesis: true,
          skill_id: 'bounded-answer',
        },
      }
    );

    expect(messageRes.ok()).toBe(true);
    const messageBody = await messageRes.json();

    // Strict acceptance criteria:
    // a) Synthesis must NOT report an error
    expect(messageBody.synthesisError).toBeUndefined();

    // b) Assistant message must be produced with real non-empty content
    expect(messageBody.assistantMessage).toBeDefined();
    const assistantContent =
      messageBody.assistantMessage.content || messageBody.assistantMessage.properties?.content;
    expect(typeof assistantContent).toBe('string');
    expect(assistantContent.trim().length).toBeGreaterThan(0);
    expect(assistantContent).not.toContain('Synthesis failed');

    // c) Agent run status must be explicitly 'success'
    expect(messageBody.agentRunDetails).toBeDefined();
    expect(messageBody.agentRunDetails.status).toBe('success');
    expect(messageBody.agentRunDetails.provider).toBe('gemma-local');
    expect(messageBody.agentRunDetails.skill_used).toBe('bounded-answer');

    // d) Exact source evidence must be bound to this run
    expect(Array.isArray(messageBody.agentRunDetails.evidence_used)).toBe(true);
    expect(messageBody.agentRunDetails.evidence_used.length).toBeGreaterThan(0);
    expect(messageBody.agentRunDetails.evidence_used).toContain(sourceId);

    const runId = messageBody.agentRunDetails.agent_run_id;
    expect(runId).toBeDefined();

    // 7. Verify provenance workspace endpoint returns full graph with exact evidence
    const provRes = await request.get(`${baseUrl}/api/v1/conversations/runs/${runId}/provenance`, {
      headers,
    });
    expect(provRes.ok()).toBe(true);
    const provBody = await provRes.json();
    expect(provBody.status).toBe('success');
    expect(provBody.provider).toBe('gemma-local');
    expect(provBody.evidence.length).toBeGreaterThan(0);

    // 8. Retain exact execution evidence artifact to disk
    const evidenceArtifact = {
      timestamp: new Date().toISOString(),
      testTarget: 'Installed Application (Keimenon.exe)',
      environment: {
        executablePath: isPackaged ? packagedExe : mainScript,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        apiPort,
      },
      agentRun: {
        runId,
        actorPrincipalId: agentPrincipalId,
        provider: messageBody.agentRunDetails.provider,
        model: messageBody.agentRunDetails.model,
        skillUsed: messageBody.agentRunDetails.skill_used,
        status: messageBody.agentRunDetails.status,
        durationMs: messageBody.agentRunDetails.duration_ms,
        evidenceUsed: messageBody.agentRunDetails.evidence_used,
      },
      assistantMessage: {
        id: messageBody.assistantMessage.id,
        content: assistantContent,
      },
      provenanceWorkspace: {
        evidenceCount: provBody.evidence.length,
        evidence: provBody.evidence,
        stats: provBody.stats,
      },
    };

    const evidenceOutputPath = path.resolve(
      __dirname,
      '../../../docs/release/installed-application-generation-evidence.json'
    );
    fs.mkdirSync(path.dirname(evidenceOutputPath), { recursive: true });
    fs.writeFileSync(evidenceOutputPath, JSON.stringify(evidenceArtifact, null, 2), 'utf8');
    console.log(`[InstalledE2E] ✅ Retained execution evidence saved to: ${evidenceOutputPath}`);

    expect(fs.existsSync(evidenceOutputPath)).toBe(true);
  } finally {
    await app.close();
  }
});
