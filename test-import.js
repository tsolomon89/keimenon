#!/usr/bin/env node

/**
 * Import Test Script with Timeout Monitoring
 *
 * Tests the import system with configurable file sizes and monitors:
 * - Upload progress and timeouts
 * - Job execution progress
 * - SSE event streaming
 * - Circuit breaker status
 * - Overall performance metrics
 *
 * Usage:
 *   node test-import.js [file-size]
 *
 * Examples:
 *   node test-import.js small    # 9.9MB file
 *   node test-import.js medium   # 136MB file
 *   node test-import.js large    # 191MB file
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { EventSource } = require('eventsource');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:4001';
const TEST_FILES = {
  tiny: 'ai_context/chat_data/test-samples/tiny.json',
  small: 'ai_context/chat_data/test-samples/small.json',
  medium: 'ai_context/chat_data/test-samples/medium.json',
  large: 'ai_context/chat_data/gpt_conversations.json',
  xlarge: 'ai_context/chat_data/claude_conversations.json',
};

// Test configuration
const TEST_USER = {
  email: 'import-test@test.com',
  password: 'Zm9$kL3#Qr2@Wv8!Nx6',
  name: 'Import Test User',
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Authentication
async function getAuthToken() {
  logSection('🔐 Authentication');

  try {
    // Try to login first
    log('Attempting login...', 'cyan');
    let response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      log('✅ Login successful', 'green');
      return data;
    }

    // If login fails, try to register
    log('Login failed, attempting registration...', 'yellow');
    response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_USER),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${error}`);
    }

    const data = await response.json();
    log('✅ Registration successful', 'green');
    return data;
  } catch (error) {
    log(`❌ Authentication failed: ${error.message}`, 'red');
    throw error;
  }
}

// Upload file and create job
async function uploadFile(filePath, token, accountId) {
  logSection('📤 File Upload');

  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);

  log(`File: ${fileName}`, 'cyan');
  log(`Size: ${formatBytes(stats.size)}`, 'cyan');
  log(`Path: ${filePath}`, 'cyan');

  const startTime = Date.now();

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), fileName);
    form.append('accountId', accountId);

    // Default import options
    const importOptions = {
      processingMode: 'automatic',
      extraction: {
        includeUser: true,
        includeAssistant: false,
      },
      duplicateDetection: {
        enabled: true,
        exactMatch: true,
        similarityThreshold: 0.85,
        requireReview: true,
        autoApproveExact: false,
      },
      codeSettings: {
        minLength: 50,
        deduplicate: true,
      },
      targetGroupCount: 25,
      minMessageLength: 400,
    };

    form.append('importOptions', JSON.stringify(importOptions));

    log('⏳ Uploading file...', 'yellow');

    const response = await fetch(`${API_BASE_URL}/api/v1/jobs/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    const uploadDuration = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed (${response.status}): ${error}`);
    }

    const result = await response.json();

    log(`✅ Upload completed in ${formatDuration(uploadDuration)}`, 'green');
    log(`Job ID: ${result.jobId}`, 'cyan');

    return result;
  } catch (error) {
    log(`❌ Upload failed: ${error.message}`, 'red');
    throw error;
  }
}

// Monitor job progress via SSE
async function monitorJobProgress(jobId, token, accountId) {
  logSection('📊 Monitoring Job Progress');

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let lastProgress = 0;
    let lastStage = '';
    let sseConnected = false;
    let heartbeatCount = 0;
    let updateCount = 0;

    // Also poll job status as backup
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) return;

        const job = await response.json();

        if (job.status === 'succeeded') {
          clearInterval(pollInterval);
          if (eventSource) eventSource.close();

          const duration = Date.now() - startTime;
          logSection('✅ Import Completed');
          log(`Duration: ${formatDuration(duration)}`, 'green');
          log(`Status: ${job.status}`, 'green');

          if (job.result) {
            log(`\nResults:`, 'cyan');
            log(`  Conversations: ${job.result.conversations || 0}`, 'cyan');
            log(`  Messages: ${job.result.messages || 0}`, 'cyan');
            log(`  Sources: ${job.result.sources || 0}`, 'cyan');
            log(`  Code Blocks: ${job.result.codeBlocks || 0}`, 'cyan');
            log(`  Duplicates for Review: ${job.result.duplicatesForReview || 0}`, 'cyan');
          }

          resolve(job);
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          if (eventSource) eventSource.close();

          const duration = Date.now() - startTime;
          logSection('❌ Import Failed');
          log(`Duration: ${formatDuration(duration)}`, 'red');
          log(`Error: ${job.error?.message || 'Unknown error'}`, 'red');

          if (job.error?.code === 'TIMEOUT') {
            log('\n⏱️  TIMEOUT DETECTED', 'yellow');
            log('This is expected behavior - the timeout system is working!', 'yellow');
          }

          reject(new Error(job.error?.message || 'Job failed'));
        } else if (job.status === 'canceled') {
          clearInterval(pollInterval);
          if (eventSource) eventSource.close();
          reject(new Error('Job was canceled'));
        }
      } catch (error) {
        // Ignore polling errors, SSE is primary
      }
    }, 2000);

    // Connect to SSE for real-time updates
    const eventSource = new EventSource(
      `${API_BASE_URL}/api/v1/stream/jobs?accountId=${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    eventSource.onopen = () => {
      sseConnected = true;
      log('📡 SSE connection established', 'green');
    };

    eventSource.addEventListener('heartbeat', (event) => {
      heartbeatCount++;
      if (heartbeatCount % 4 === 0) {
        log(`💓 Heartbeat (${heartbeatCount} received)`, 'blue');
      }
    });

    eventSource.addEventListener('job', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.jobId !== jobId) return;

        updateCount++;
        const elapsed = Date.now() - startTime;

        // Show progress updates
        if (data.progress) {
          const percent = data.progress.percent || 0;
          const stage = data.progress.message || data.status;

          if (percent !== lastProgress || stage !== lastStage) {
            const bar =
              '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
            log(`[${bar}] ${percent}% - ${stage} (${formatDuration(elapsed)})`, 'cyan');

            lastProgress = percent;
            lastStage = stage;
          }
        }
      } catch (error) {
        // Ignore parse errors
      }
    });

    eventSource.addEventListener('graph_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        log(
          `📈 Graph update: +${data.nodesAdded || 0} nodes, +${data.edgesAdded || 0} edges`,
          'magenta'
        );
      } catch (error) {
        // Ignore parse errors
      }
    });

    eventSource.onerror = (error) => {
      if (sseConnected) {
        log('⚠️  SSE connection error (will retry)', 'yellow');
      }
    };

    // Timeout after 30 minutes (UI timeout)
    setTimeout(() => {
      clearInterval(pollInterval);
      eventSource.close();
      reject(new Error('Test timeout after 30 minutes'));
    }, 1800000);
  });
}

// Check circuit breaker status
async function checkCircuitBreaker(token) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/debug/queue/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return;

    const status = await response.json();

    if (status.circuitOpen) {
      log('⚠️  Circuit breaker is OPEN', 'yellow');
      log(`   Dead letter queue: ${status.deadLetterQueue} items`, 'yellow');
    }
  } catch (error) {
    // Ignore errors
  }
}

// Main test function
async function runImportTest(fileSize = 'small') {
  const testFile = TEST_FILES[fileSize];

  if (!testFile) {
    log(`❌ Unknown file size: ${fileSize}`, 'red');
    log(`Available options: ${Object.keys(TEST_FILES).join(', ')}`, 'yellow');
    process.exit(1);
  }

  const filePath = path.resolve(testFile);

  if (!fs.existsSync(filePath)) {
    log(`❌ Test file not found: ${filePath}`, 'red');
    process.exit(1);
  }

  logSection(`🧪 Import Test - ${fileSize.toUpperCase()}`);

  const overallStart = Date.now();

  try {
    // Step 1: Authenticate
    const authData = await getAuthToken();
    const { token, accountId } = authData;

    // Step 2: Upload file and create job
    const uploadResult = await uploadFile(filePath, token, accountId);
    const { jobId } = uploadResult;

    // Step 3: Monitor job progress
    const job = await monitorJobProgress(jobId, token, accountId);

    // Step 4: Check circuit breaker
    await checkCircuitBreaker(token);

    // Final summary
    const totalDuration = Date.now() - overallStart;
    logSection('📋 Test Summary');
    log(`Total Duration: ${formatDuration(totalDuration)}`, 'green');
    log(`File: ${fileSize} (${formatBytes(fs.statSync(filePath).size)})`, 'cyan');
    log(`Status: SUCCESS`, 'green');
    log(`Job ID: ${jobId}`, 'cyan');

    process.exit(0);
  } catch (error) {
    const totalDuration = Date.now() - overallStart;

    logSection('❌ Test Failed');
    log(`Total Duration: ${formatDuration(totalDuration)}`, 'red');
    log(`Error: ${error.message}`, 'red');

    // Check if it's a timeout error
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      log('\n⏱️  This was a TIMEOUT error - the timeout system is working correctly!', 'yellow');
      log('You can increase the timeout by setting IMPORT_WORKER_TIMEOUT_MS higher.', 'yellow');
    }

    process.exit(1);
  }
}

// Parse command line arguments
const fileSize = process.argv[2] || 'small';

// Run the test
runImportTest(fileSize);
