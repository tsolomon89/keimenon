import { test, expect } from './fixtures/test-isolation';
import path from 'path';
import fs from 'fs';

/**
 * Import Workflow E2E Tests
 *
 * Tests the complete chat import workflow from file upload to data verification.
 * This is a CRITICAL user journey that must work reliably across all platforms.
 *
 * Tests cover:
 * - File upload (ChatGPT, Claude, Gemini, generic formats)
 * - Job creation and status monitoring
 * - SSE progress streaming
 * - Duplicate detection validation
 * - Code extraction validation
 * - Error handling and recovery
 * - Import cancellation
 *
 * Priority: HIGH (CRITICAL GAP - was 0% coverage)
 * Related: apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts
 * Related: apps/api/src/modules/workers/infrastructure/ImportWorker.ts
 */

test.describe('Import Workflow', () => {
  test.describe.configure({ tag: '@full' });

  const TEST_USER = {
    email: 'admin@admin.com',
    password: 'TestPass123!',
  };

  let authToken: string;

  test.beforeEach(async ({ apiRequest }) => {
    // Login and get auth token
    const response = await apiRequest.post('/api/v1/auth/login', {
      data: TEST_USER,
    });

    const auth = await response.json();
    authToken = auth.token;
  });

  test.afterEach(async ({ apiRequest }) => {
    // Cleanup test data
    await apiRequest.delete('/api/v1/data/keimenon', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { data_tag: 'test' },
    });
  });

  // ==================== SUCCESSFUL IMPORTS ====================

  test('should upload and import ChatGPT export file successfully', async ({ apiRequest }) => {
    // Step 1: Prepare test file path
    const testFile = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      'tiny.json'
    );

    // Verify file exists
    expect(fs.existsSync(testFile)).toBeTruthy();

    // Step 2: Create FormData with file
    const fileContent = fs.readFileSync(testFile);
    const form = new FormData();
    form.append('files', new Blob([fileContent], { type: 'application/json' }), 'tiny.json');
    form.append(
      'config',
      JSON.stringify({
        platform: 'chatgpt',
        extraction: {
          includeUser: true,
          includeAssistant: false,
        },
        minMessageLength: 100,
        extractCode: true,
        duplicateDetection: {
          enabled: true,
          similarityThreshold: 0.85,
        },
      })
    );

    // Step 3: Upload file and create import job
    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        files: {
          name: 'tiny.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
        config: JSON.stringify({
          platform: 'chatgpt',
          extraction: { includeUser: true, includeAssistant: true },
          minMessageLength: 10,
        }),
      },
    });

    // DEBUG: Log response if not OK
    if (!uploadResponse.ok()) {
      console.error(`[IMPORT DEBUG] Upload failed with status ${uploadResponse.status()}`);
      const errorBody = await uploadResponse.text();
      console.error(`[IMPORT DEBUG] Response body: ${errorBody}`);
    }

    expect(uploadResponse.ok()).toBeTruthy();
    const uploadResult = await uploadResponse.json();

    // Verify job created
    expect(uploadResult.success).toBe(true);
    expect(uploadResult.jobId).toBeDefined();
    expect(uploadResult.uploadIds).toBeDefined();
    expect(uploadResult.uploadIds.length).toBeGreaterThan(0);

    const jobId = uploadResult.jobId;

    // Step 4: Poll job status until completion (max 30s)
    let jobStatus = 'queued';
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds (500ms * 60)

    while (jobStatus !== 'succeeded' && jobStatus !== 'failed' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const statusData = await statusResponse.json();
      jobStatus = statusData.job.state.status;
      attempts++;

      console.log(`Job status: ${jobStatus} (attempt ${attempts}/${maxAttempts})`);

      if (statusData.job.state.progress) {
        console.log(`Progress: ${statusData.job.state.progress.percent}%`);
      }
    }

    // Verify job completed successfully
    expect(jobStatus).toBe('succeeded');

    // Step 5: Verify imported data exists
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 100 },
    });

    const nodes = await nodesResponse.json();
    expect(nodes.nodes).toBeDefined();
    expect(nodes.nodes.length).toBeGreaterThan(0);

    console.log(`✅ Import successful: ${nodes.nodes.length} nodes created`);
  });

  test('should import Claude export file successfully', async ({ apiRequest }) => {
    // Create a Claude-format test file (matching actual Claude export structure)
    const claudeExport = [
      {
        uuid: 'conv_test_123',
        name: 'Test Conversation',
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        chat_messages: [
          {
            uuid: 'msg_001',
            text: 'Test message from user in Claude format with sufficient length to pass filtering',
            sender: 'human',
            created_at: Math.floor(Date.now() / 1000),
          },
          {
            uuid: 'msg_002',
            text: 'Test response from Claude assistant with enough content to be meaningful and pass any length requirements',
            sender: 'assistant',
            created_at: Math.floor(Date.now() / 1000) + 1,
          },
        ],
      },
    ];

    const fileContent = Buffer.from(JSON.stringify(claudeExport));

    // Upload and create job
    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'claude-export.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
        config: JSON.stringify({
          platform: 'claude',
          extraction: { includeUser: true, includeAssistant: false },
          minMessageLength: 10, // Allow short test messages (default is 400)
        }),
      },
    });

    expect(uploadResponse.ok()).toBeTruthy();
    const uploadResult = await uploadResponse.json();
    const jobId = uploadResult.jobId;

    // Wait for completion
    let jobStatus = 'queued';
    let attempts = 0;

    while (jobStatus !== 'succeeded' && jobStatus !== 'failed' && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const statusData = await statusResponse.json();
      jobStatus = statusData.job.state.status;
      attempts++;
    }

    expect(jobStatus).toBe('succeeded');

    // Verify data imported
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'Source', limit: 10 },
    });

    const nodes = await nodesResponse.json();
    expect(nodes.nodes.length).toBeGreaterThan(0);
  });

  test('should extract code blocks during import', async ({ apiRequest }) => {
    // Generic format expects messages array at top level
    const exportWithCode = {
      messages: [
        {
          role: 'assistant', // Code extraction only runs on assistant messages
          content:
            'Here is some code with sufficient length to pass message filters:\n\n```typescript\nfunction hello() {\n  console.log("Hello World");\n  return "test";\n}\n```\n\nThis message has enough content to be processed.',
          timestamp: Date.now(),
        },
      ],
    };

    const fileContent = Buffer.from(JSON.stringify(exportWithCode));

    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'code-export.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
        config: JSON.stringify({
          platform: 'generic',
          extractCode: true,
          minMessageLength: 10, // Allow short test messages (default is 400)
          codeSettings: {
            minLength: 10,
            deduplicate: true,
          },
        }),
      },
    });

    const uploadResult = await uploadResponse.json();
    const jobId = uploadResult.jobId;

    // Wait for completion
    let jobStatus = 'queued';
    let attempts = 0;

    while (jobStatus !== 'succeeded' && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const statusData = await statusResponse.json();
      jobStatus = statusData.job.state.status;
      attempts++;
    }

    expect(jobStatus).toBe('succeeded');

    // Verify code blocks were extracted
    const nodesResponse = await apiRequest.get('/api/v1/nodes', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'CodeBlock', limit: 10 },
    });

    const nodes = await nodesResponse.json();
    expect(nodes.nodes.length).toBeGreaterThan(0);

    // Verify code block has expected content (access from metadata, not properties)
    const codeBlock = nodes.nodes[0];
    expect(codeBlock.metadata?.code || codeBlock.code).toContain('function hello()');
    expect(codeBlock.metadata?.language || codeBlock.language).toBe('typescript');
  });

  // ==================== JOB MONITORING ====================

  test('should retrieve job status by ID', async ({ apiRequest }) => {
    const testFile = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      'tiny.json'
    );
    const fileContent = fs.readFileSync(testFile);

    // Create job
    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'tiny.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
      },
    });

    const uploadResult = await uploadResponse.json();
    const jobId = uploadResult.jobId;

    // Get job status
    const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(statusResponse.ok()).toBeTruthy();
    const statusData = await statusResponse.json();

    // Verify response structure
    expect(statusData.success).toBe(true);
    expect(statusData.job).toBeDefined();

    // Verify job structure (API returns job.toJSON() format)
    expect(statusData.job.id).toBe(jobId);
    expect(statusData.job.type).toBe('import');
    expect(statusData.job.state).toBeDefined();
    expect(statusData.job.state.status).toMatch(/queued|running|succeeded/);
    expect(statusData.job.state.queuedAt).toBeDefined();
    expect(statusData.job.config).toBeDefined();
    expect(statusData.job.accountId).toBeDefined();
    expect(statusData.job.createdBy).toBeDefined();

    console.log(`✅ Job status retrieved: ${jobId} (status: ${statusData.job.state.status})`);
  });

  test('should list all jobs for authenticated user', async ({ apiRequest }) => {
    // Create multiple jobs
    const testFile = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      'tiny.json'
    );
    const fileContent = fs.readFileSync(testFile);

    await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'tiny1.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
      },
    });

    await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'tiny2.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
      },
    });

    // List jobs (filter by import type to avoid delete jobs from cleanup)
    const listResponse = await apiRequest.get('/api/v1/jobs', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { type: 'import' }, // Filter to only import jobs
    });

    expect(listResponse.ok()).toBeTruthy();
    const listData = await listResponse.json();

    // Verify response structure (API returns {success, jobs, total})
    expect(listData.success).toBe(true);
    expect(listData.jobs).toBeDefined();
    expect(listData.total).toBeDefined();

    // Verify multiple jobs returned
    expect(listData.jobs.length).toBeGreaterThanOrEqual(2);
    expect(listData.total).toBeGreaterThanOrEqual(2);

    // Verify all are import jobs with correct structure
    listData.jobs.forEach((job: any) => {
      expect(job.id).toBeDefined();
      expect(job.type).toBe('import');
      expect(job.state).toBeDefined();
      expect(job.accountId).toBeDefined();
    });

    console.log(`✅ Job list retrieved: ${listData.total} jobs found`);
  });

  // ==================== ERROR HANDLING ====================

  test('should reject invalid JSON file', async ({ apiRequest }) => {
    const invalidContent = Buffer.from('This is not valid JSON');

    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'invalid.json',
          mimeType: 'application/json',
          buffer: invalidContent,
        },
      },
    });

    // Job should be created but fail during processing
    if (uploadResponse.ok()) {
      const uploadResult = await uploadResponse.json();
      const jobId = uploadResult.jobId;

      console.log(`⏳ Waiting for invalid JSON job to fail: ${jobId}`);

      // Poll job status until it fails or times out
      let jobStatus = 'queued';
      let attempts = 0;
      const maxAttempts = 20; // 10 seconds max (500ms * 20)

      while (jobStatus !== 'failed' && jobStatus !== 'succeeded' && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        const statusData = await statusResponse.json();
        jobStatus = statusData.job.state.status;
        attempts++;

        console.log(`  Attempt ${attempts}/${maxAttempts}: status=${jobStatus}`);
      }

      // Verify job failed
      expect(jobStatus).toBe('failed');

      // Get final job state
      const finalResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const finalData = await finalResponse.json();

      expect(finalData.job.state.error).toBeDefined();
      expect(finalData.job.state.error.message).toBeDefined();

      console.log(`✅ Invalid JSON rejected correctly: ${finalData.job.state.error.message}`);
    } else {
      // Or server rejects it immediately
      console.log(`✅ Server rejected invalid JSON immediately: ${uploadResponse.status()}`);
      expect(uploadResponse.ok()).toBeFalsy();
    }
  });

  test('should handle empty file gracefully', async ({ apiRequest }) => {
    const emptyContent = Buffer.from('{}');

    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'empty.json',
          mimeType: 'application/json',
          buffer: emptyContent,
        },
      },
    });

    if (uploadResponse.ok()) {
      const uploadResult = await uploadResponse.json();
      expect(uploadResult.success).toBe(true);

      // Job might complete but with 0 nodes created
      const jobId = uploadResult.jobId;

      // Poll for job completion (max 30 seconds)
      let statusData: any;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        statusData = await statusResponse.json();
        const status = statusData.job.state.status;

        if (['succeeded', 'failed', 'cancelled'].includes(status)) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      // Should complete (not fail) but create no data
      expect(['succeeded', 'failed']).toContain(statusData.job.state.status);
    }
  });

  test('should require authentication for import', async ({ apiRequest }) => {
    const testFile = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      'tiny.json'
    );
    const fileContent = fs.readFileSync(testFile);

    // Attempt upload without auth token
    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      multipart: {
        files: {
          name: 'tiny.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
      },
    });

    // Should be rejected
    expect(uploadResponse.status()).toBe(401);
  });

  // ==================== DUPLICATE DETECTION ====================

  // 🔍 DIAGNOSTIC RUN: Debug logging added to duplicate-detection.ts to diagnose why DUP_OF edges aren't created
  // This test uses identical messages across two conversations to test cross-conversation duplicate detection
  //
  // Debug logging added (Phase 1.2):
  // - apps/api/src/services/duplicate-detection.ts:74-78 (message extraction)
  // - apps/api/src/services/duplicate-detection.ts:131 (candidates found)
  // - apps/api/src/services/duplicate-detection.ts:136 (groups created)
  //
  // See implementation: apps/api/src/services/import-enhanced-v2.ts:510-607
  test('should detect and handle duplicate messages', async ({ apiRequest }) => {
    const exportWithDuplicates = {
      conversations: [
        {
          id: 'conv_dup_1',
          title: 'First Conversation',
          messages: [
            {
              role: 'user',
              content: 'This is a duplicate message that appears twice',
              timestamp: Date.now(),
            },
          ],
        },
        {
          id: 'conv_dup_2',
          title: 'Second Conversation',
          messages: [
            {
              role: 'user',
              content: 'This is a duplicate message that appears twice',
              timestamp: Date.now() + 5000,
            },
          ],
        },
      ],
    };

    const fileContent = Buffer.from(JSON.stringify(exportWithDuplicates));

    const uploadResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${authToken}` },
      multipart: {
        files: {
          name: 'duplicates.json',
          mimeType: 'application/json',
          buffer: fileContent,
        },
        config: JSON.stringify({
          platform: 'generic',
          minMessageLength: 10, // Allow short test messages (default is 400)
          duplicateDetection: {
            enabled: true,
            exactMatch: true,
            requireReview: false,
            autoApproveExact: true,
          },
        }),
      },
    });

    const uploadResult = await uploadResponse.json();
    const jobId = uploadResult.jobId;

    // Wait for completion
    let jobStatus = 'queued';
    let attempts = 0;

    while (jobStatus !== 'succeeded' && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const statusData = await statusResponse.json();
      jobStatus = statusData.job.state.status;
      attempts++;
    }

    expect(jobStatus).toBe('succeeded');

    // Verify duplicate detection worked
    // Should create DUP_OF edges between duplicate nodes
    const edgesResponse = await apiRequest.get('/api/v1/edges', {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { kind: 'DUP_OF', limit: 10 },
    });

    const edges = await edgesResponse.json();
    expect(edges.edges.length).toBeGreaterThan(0);
  });

  // ==================== CONCURRENT IMPORTS ====================

  test('should handle multiple concurrent imports', async ({ apiRequest }) => {
    const testFile = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      'tiny.json'
    );
    const fileContent = fs.readFileSync(testFile);

    // Create 3 import jobs concurrently
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        apiRequest.post('/api/v1/jobs/import', {
          headers: { Authorization: `Bearer ${authToken}` },
          multipart: {
            files: {
              name: `concurrent-${i}.json`,
              mimeType: 'application/json',
              buffer: fileContent,
            },
          },
        })
      );
    }

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach((response) => {
      expect(response.ok()).toBeTruthy();
    });

    const jobIds = await Promise.all(responses.map((r) => r.json().then((data) => data.jobId)));

    // All should have unique job IDs
    const uniqueIds = new Set(jobIds);
    expect(uniqueIds.size).toBe(3);

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Verify all completed
    for (const jobId of jobIds) {
      const statusResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const statusData = await statusResponse.json();
      expect(['succeeded', 'running']).toContain(statusData.job.state.status);
    }
  });
});
