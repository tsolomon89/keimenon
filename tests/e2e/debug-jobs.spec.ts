import { test, expect } from './fixtures/test-isolation';
import fs from 'fs';
import path from 'path';

test.describe('Debug Jobs', () => {
  test('Create and Fetch Job', async ({ apiRequest }) => {
    console.log('[DebugTest] Starting Create and Fetch Job');

    // 1. Login
    const loginResponse = await apiRequest.post('/api/v1/auth/login', {
      data: { email: 'admin@admin.com', password: 'TestPass123!' },
    });
    expect(loginResponse.ok()).toBeTruthy();

    const loginPayload = await loginResponse.json();
    const token = loginPayload?.token;
    expect(token).toBeTruthy();

    // 2. Create import job using the standardized contract
    const fixturePath = path.join(
      process.cwd(),
      'tests',
      'test_data',
      'chat_data',
      'test-samples',
      'tiny.json'
    );
    const fixtureBuffer = fs.readFileSync(fixturePath);

    console.log('[DebugTest] POST /api/v1/jobs/import');
    const createResponse = await apiRequest.post('/api/v1/jobs/import', {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        files: {
          name: 'debug-tiny.json',
          mimeType: 'application/json',
          buffer: fixtureBuffer,
        },
        config: JSON.stringify({
          platform: 'chatgpt',
          extractCode: true,
          duplicateDetection: { enabled: true },
          data_tag: 'test',
        }),
      },
    });

    console.log(`[DebugTest] Create Status: ${createResponse.status()}`);
    const createData = await createResponse.json();
    console.log(`[DebugTest] Create Body:`, JSON.stringify(createData, null, 2));

    expect(createResponse.ok()).toBeTruthy();
    const jobId = createData?.jobId || createData?.job?.id || createData?.job_id;
    expect(jobId).toBeTruthy();
    console.log(`[DebugTest] Job ID: ${jobId}`);

    // 3. Fetch Job
    console.log(`[DebugTest] GET /api/v1/jobs/${jobId}`);
    const getResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`[DebugTest] Get Status: ${getResponse.status()}`);
    const getData = await getResponse.json();
    console.log(`[DebugTest] Get Body:`, JSON.stringify(getData, null, 2));

    expect(getResponse.ok()).toBeTruthy();
    expect(getData.job).toBeDefined();
    expect(getData.job.id).toBe(jobId);
  });
});
