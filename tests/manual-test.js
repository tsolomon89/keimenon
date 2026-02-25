
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function run() {
  const API_URL = 'http://localhost:4001/api/v1';
  
  // Ensure DB path exists
  const testDbsDir = path.join(process.cwd(), '.test-dbs');
  if (!fs.existsSync(testDbsDir)) {
      fs.mkdirSync(testDbsDir, { recursive: true });
  }
  
  // Copy template to manual-test.db so we have a valid DB
  const templatePath = path.join(testDbsDir, 'snapshot-template.db');
  const dbPath = path.join(testDbsDir, 'manual-test.db');
  const jobsTemplatePath = path.join(testDbsDir, 'snapshot-template-jobs.db');
  const jobsDbPath = path.join(testDbsDir, 'manual-test-jobs.db');

  if (fs.existsSync(templatePath)) {
      console.log('Copying template DB...');
      fs.copyFileSync(templatePath, dbPath);
  } else {
      console.warn('Template DB not found. Test might fail if DB logic requires init.');
  }

  if (fs.existsSync(jobsTemplatePath)) {
      console.log('Copying jobs template DB...');
      fs.copyFileSync(jobsTemplatePath, jobsDbPath);
  }

  // Login
  console.log('Logging in...');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@admin.com', password: 'TestPass123!' })
  });
  
  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text());
    return;
  }
  
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Logged in. Token:', token.substring(0, 20) + '...');

  // Create Job
  const formData = new FormData();
  formData.append('file', Buffer.from('test,data\n1,2'), { filename: 'test.csv', contentType: 'text/csv' });
  formData.append('sourceType', 'csv');
  
  console.log('Creating job...');
  const createRes = await fetch(`${API_URL}/jobs/import`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Test-DB-Path': path.join(process.cwd(), '.test-dbs', 'manual-test.db').replace(/\\/g, '/')
    },
    body: formData
  });

  if (!createRes.ok) {
    console.error('Create failed:', await createRes.text());
    return;
  }

  const createData = await createRes.json();
  const jobId = createData.jobId;
  console.log('Job created:', jobId);

  // Fetch Job
  console.log('Fetching job...');
  const getRes = await fetch(`${API_URL}/jobs/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Test-DB-Path': '.test-dbs/manual-test.db'
    }
  });

  if (!getRes.ok) {
    console.error('Fetch failed:', await getRes.text());
    return;
  }

  const getData = await getRes.json();
  console.log('Job fetched:', JSON.stringify(getData, null, 2));
  
  if (getData.job && getData.job.id === jobId) {
      console.log('SUCCESS: Job found correctly.');
  } else {
      console.log('FAILURE: Job not found or mismatch.');
  }

  // Delete Job
  console.log('Deleting job...');
    const deleteRes = await fetch(`${API_URL}/jobs/${jobId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Test-DB-Path': '.test-dbs/manual-test.db'
    }
  });
  
  if (!deleteRes.ok) {
      console.error('Delete failed:', await deleteRes.text());
  } else {
      console.log('Delete success.');
  }
}

run().catch(console.error);
