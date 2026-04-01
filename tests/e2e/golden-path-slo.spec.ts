import { test, expect } from './fixtures/test-isolation';
import fs from 'node:fs';
import path from 'node:path';

type FixtureRunResult = {
  name: string;
  success: boolean;
  durationMs: number;
  status: string;
  error?: string;
};

type GoldenPathMetricsArtifact = {
  mode: 'pr' | 'nightly';
  generatedAt: string;
  fixtures: FixtureRunResult[];
  similarityApplyMs: number;
  stalledJobsOver180s: number;
  requiredScenarioFailures: number;
};

const TEST_USER = {
  email: 'admin@admin.com',
  password: 'TestPass123!',
};

const POLL_INTERVAL_MS = 1000;
const STALL_THRESHOLD_MS = 180000;

async function login(apiRequest: any): Promise<string> {
  const response = await apiRequest.post('/api/v1/auth/login', {
    data: TEST_USER,
  });
  if (!response.ok()) {
    throw new Error(`Login failed with status ${response.status()}`);
  }
  const body = await response.json();
  if (!body?.token) {
    throw new Error('Login response missing token');
  }
  return body.token as string;
}

async function createImportJob(
  apiRequest: any,
  authToken: string,
  filePath: string,
  fileName: string,
  config: Record<string, unknown>
): Promise<string> {
  const fileContent = fs.readFileSync(filePath);
  const response = await apiRequest.post('/api/v1/jobs/import', {
    headers: { Authorization: `Bearer ${authToken}` },
    multipart: {
      files: {
        name: fileName,
        mimeType: 'application/json',
        buffer: fileContent,
      },
      config: JSON.stringify(config),
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Import enqueue failed (${response.status()}): ${body}`);
  }

  const payload = await response.json();
  if (!payload?.jobId) {
    throw new Error('Import enqueue response missing jobId');
  }
  return payload.jobId as string;
}

async function waitForJobTerminal(
  apiRequest: any,
  authToken: string,
  jobId: string,
  maxWaitMs: number
): Promise<{ status: string; stalled: boolean }> {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressToken = '';

  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok()) {
      throw new Error(`Failed to fetch job status (${response.status()}) for ${jobId}`);
    }

    const payload = await response.json();
    const status = String(payload?.job?.state?.status || 'unknown');
    const progress = payload?.job?.state?.progress || {};
    const progressToken = `${status}:${String(progress.percent || 0)}:${String(progress.message || '')}`;

    if (progressToken !== lastProgressToken) {
      lastProgressAt = Date.now();
      lastProgressToken = progressToken;
    }

    if (Date.now() - lastProgressAt > STALL_THRESHOLD_MS) {
      return { status, stalled: true };
    }

    if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
      return { status, stalled: false };
    }
  }

  return { status: 'timeout', stalled: true };
}

async function verifyHierarchyVisible(apiRequest: any, authToken: string): Promise<boolean> {
  const kinds = ['AccountNode', 'Principal', 'Source', 'Group'];
  for (const kind of kinds) {
    const response = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind, limit: 1 },
    });
    if (!response.ok()) {
      return false;
    }
    const payload = await response.json();
    if (!Array.isArray(payload?.nodes) || payload.nodes.length === 0) {
      return false;
    }
  }
  return true;
}

test.describe('Golden Path SLO Artifact', () => {
  test.describe.configure({ mode: 'serial' });

  test('collects import/review timings for SLO evaluation', async ({ apiRequest }) => {
    const mode = (process.env.GOLDEN_SLO_MODE === 'nightly' ? 'nightly' : 'pr') as 'pr' | 'nightly';
    const authToken = await login(apiRequest);

    const fixtures: Array<{
      name: string;
      filePath: string;
      config: Record<string, unknown>;
      maxWaitMs: number;
    }> = [
      {
        name: 'tiny',
        filePath: path.join(
          process.cwd(),
          'tests',
          'test_data',
          'chat_data',
          'test-samples',
          'tiny.json'
        ),
        config: {
          platform: 'chatgpt',
          extraction: { includeUser: true, includeAssistant: true },
          minMessageLength: 10,
          duplicateDetection: { enabled: true, requireReview: true },
        },
        maxWaitMs: 8 * 60 * 1000,
      },
      {
        name: 'small',
        filePath: path.join(
          process.cwd(),
          'tests',
          'test_data',
          'chat_data',
          'test-samples',
          'small.json'
        ),
        config: {
          platform: 'chatgpt',
          extraction: { includeUser: true, includeAssistant: true },
          minMessageLength: 10,
          duplicateDetection: { enabled: true, requireReview: true },
        },
        maxWaitMs: 20 * 60 * 1000,
      },
    ];

    if (mode === 'nightly') {
      fixtures.push(
        {
          name: 'medium',
          filePath: path.join(
            process.cwd(),
            'tests',
            'test_data',
            'chat_data',
            'test-samples',
            'medium.json'
          ),
          config: {
            platform: 'chatgpt',
            extraction: { includeUser: true, includeAssistant: true },
            minMessageLength: 10,
            duplicateDetection: { enabled: true, requireReview: true },
          },
          maxWaitMs: 35 * 60 * 1000,
        },
        {
          name: 'real_gpt',
          filePath: path.join(
            process.cwd(),
            'tests',
            'test_data',
            'chat_data',
            'gpt_conversations.json'
          ),
          config: {
            platform: 'chatgpt',
            extraction: { includeUser: true, includeAssistant: true },
            minMessageLength: 10,
            duplicateDetection: { enabled: true, requireReview: true },
          },
          maxWaitMs: 50 * 60 * 1000,
        }
      );
    }

    const artifact: GoldenPathMetricsArtifact = {
      mode,
      generatedAt: new Date().toISOString(),
      fixtures: [],
      similarityApplyMs: 0,
      stalledJobsOver180s: 0,
      requiredScenarioFailures: 0,
    };

    for (const fixture of fixtures) {
      const startedAt = Date.now();
      try {
        const jobId = await createImportJob(
          apiRequest,
          authToken,
          fixture.filePath,
          path.basename(fixture.filePath),
          fixture.config
        );
        const terminal = await waitForJobTerminal(apiRequest, authToken, jobId, fixture.maxWaitMs);
        const durationMs = Date.now() - startedAt;
        if (terminal.stalled) {
          artifact.stalledJobsOver180s += 1;
        }
        if (terminal.status !== 'succeeded') {
          artifact.requiredScenarioFailures += 1;
          artifact.fixtures.push({
            name: fixture.name,
            success: false,
            durationMs,
            status: terminal.status,
            error: `terminal_status=${terminal.status}`,
          });
          continue;
        }

        const hierarchyVisible = await verifyHierarchyVisible(apiRequest, authToken);
        if (!hierarchyVisible) {
          artifact.requiredScenarioFailures += 1;
        }

        artifact.fixtures.push({
          name: fixture.name,
          success: hierarchyVisible,
          durationMs,
          status: hierarchyVisible ? 'succeeded' : 'hierarchy_missing',
          ...(hierarchyVisible ? {} : { error: 'Hierarchy invariant not visible via nodes API' }),
        });
      } catch (error: any) {
        artifact.requiredScenarioFailures += 1;
        artifact.fixtures.push({
          name: fixture.name,
          success: false,
          durationMs: Date.now() - startedAt,
          status: 'failed',
          error: error?.message || String(error),
        });
      }
    }

    try {
      const duplicateFixture = {
        conversations: [
          {
            id: 'dup_conv_1',
            title: 'Duplicate Fixture',
            messages: [
              {
                id: 'dup_msg_1',
                role: 'assistant',
                content:
                  'This is duplicate content for review apply timing. This sentence repeats exactly.',
                timestamp: Date.now(),
              },
              {
                id: 'dup_msg_2',
                role: 'assistant',
                content:
                  'This is duplicate content for review apply timing. This sentence repeats exactly.',
                timestamp: Date.now() + 1,
              },
            ],
          },
        ],
      };

      const duplicatePath = path.join(
        process.cwd(),
        'test-results',
        'slo',
        'duplicate-fixture.json'
      );
      fs.mkdirSync(path.dirname(duplicatePath), { recursive: true });
      fs.writeFileSync(duplicatePath, JSON.stringify(duplicateFixture), 'utf8');

      const dupJobId = await createImportJob(
        apiRequest,
        authToken,
        duplicatePath,
        'duplicate-fixture.json',
        {
          platform: 'generic',
          extraction: { includeUser: true, includeAssistant: true },
          minMessageLength: 1,
          duplicateDetection: { enabled: true, requireReview: true, exactMatch: true },
        }
      );

      const dupTerminal = await waitForJobTerminal(apiRequest, authToken, dupJobId, 8 * 60 * 1000);
      if (dupTerminal.stalled) {
        artifact.stalledJobsOver180s += 1;
      }
      if (dupTerminal.status !== 'succeeded') {
        artifact.requiredScenarioFailures += 1;
      } else {
        const statusResponse = await apiRequest.get(
          `/api/v1/jobs/${dupJobId}/duplicate-review/status`,
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        if (!statusResponse.ok()) {
          artifact.requiredScenarioFailures += 1;
        } else {
          const statusPayload = await statusResponse.json();
          const pendingCandidates = Number(statusPayload?.status?.pending_candidates ?? 0);

          if (pendingCandidates > 0) {
            const groupsResponse = await apiRequest.get(
              `/api/v1/jobs/${dupJobId}/duplicate-review/groups`,
              {
                headers: { Authorization: `Bearer ${authToken}` },
              }
            );
            if (!groupsResponse.ok()) {
              artifact.requiredScenarioFailures += 1;
            } else {
              const groupsPayload = await groupsResponse.json();
              const decisions: Array<{ duplicateId: string; action: string; timestamp: number }> =
                [];
              for (const group of groupsPayload?.groups || []) {
                for (const candidate of group?.candidates || []) {
                  decisions.push({
                    duplicateId: String(candidate.id),
                    action: 'keep-both',
                    timestamp: Date.now(),
                  });
                }
              }

              const applyStartedAt = Date.now();
              const applyResponse = await apiRequest.post(
                `/api/v1/jobs/${dupJobId}/duplicate-review/apply`,
                {
                  headers: { Authorization: `Bearer ${authToken}` },
                  data: { decisions },
                }
              );
              artifact.similarityApplyMs = Date.now() - applyStartedAt;
              if (!applyResponse.ok()) {
                artifact.requiredScenarioFailures += 1;
              }
            }
          }
        }
      }
    } catch (error) {
      artifact.requiredScenarioFailures += 1;
    }

    const outputPath = path.join(process.cwd(), 'test-results', 'slo', 'golden-path-metrics.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2), 'utf8');

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(artifact.fixtures.length).toBeGreaterThan(0);
  });
});
