import { test, expect } from './fixtures/test-isolation';

test.describe('Debug Jobs', () => {
  test('Create and Fetch Job', async ({ apiRequest }) => {
    console.log('[DebugTest] Starting Create and Fetch Job');

    // 1. Create Job
    const importData = {
      sourceType: 'csv',
      data: 'test,data\n1,2',
    };

    console.log('[DebugTest] POST /api/v1/jobs/import');
    const createResponse = await apiRequest.post('/api/v1/jobs/import', {
      multipart: {
        file: {
          name: 'test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('test,data\n1,2'),
        },
        sourceType: 'csv',
        params: JSON.stringify({ delimiter: ',' }),
      },
    });

    console.log(`[DebugTest] Create Status: ${createResponse.status()}`);
    const createData = await createResponse.json();
    console.log(`[DebugTest] Create Body:`, JSON.stringify(createData, null, 2));

    expect(createResponse.ok()).toBeTruthy();
    const jobId = createData.job.id;
    console.log(`[DebugTest] Job ID: ${jobId}`);

    // 2. Fetch Job
    console.log(`[DebugTest] GET /api/v1/jobs/${jobId}`);
    const getResponse = await apiRequest.get(`/api/v1/jobs/${jobId}`);
    
    console.log(`[DebugTest] Get Status: ${getResponse.status()}`);
    const getData = await getResponse.json();
    console.log(`[DebugTest] Get Body:`, JSON.stringify(getData, null, 2));

    expect(getResponse.ok()).toBeTruthy();
    expect(getData.job).toBeDefined();
    expect(getData.job.id).toBe(jobId);
  });
});
