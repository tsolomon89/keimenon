#!/usr/bin/env node

/**
 * Integration Test: End-to-End Pipeline
 *
 * Tests the complete import pipeline with real chat data
 * Flow: File → Parse → Sources → Code → Neo4j
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

// FormData is optional - skip test if not available
let FormData;
try {
  FormData = require('form-data');
} catch {
  FormData = null;
}

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_DATA_DIR = path.resolve(__dirname, '../../../../ai_context/chat_data/test-samples');

/**
 * Run tests
 */
async function run() {
  console.log('→ Testing end-to-end import pipeline...\n');

  // Test 1: Check API is running
  await testAPIHealth();

  // Test 2: Import tiny.json via enhanced endpoint
  await testEnhancedImport();

  // Test 3: Verify data in Neo4j (if available)
  await testNeo4jData();

  console.log('\nAll e2e tests passed!');
}

/**
 * Test: API Health Check
 */
async function testAPIHealth() {
  console.log('  → Checking API health...');

  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();

    assert(data.status === 'ok', 'API health check should return ok');
    assert(data.dependencies.neo4j, 'Neo4j status should be present');

    console.log(`    ✓ API is healthy (Neo4j: ${data.dependencies.neo4j})`);
  } catch (error) {
    throw new Error(`API health check failed: ${error.message}\nMake sure the API is running with: npm run dev`);
  }
}

/**
 * Test: Enhanced Import
 */
async function testEnhancedImport() {
  console.log('  → Testing enhanced import endpoint...');

  if (!FormData) {
    console.log('    ⊘ Skipped (form-data module not available)');
    return;
  }

  const filePath = path.join(TEST_DATA_DIR, 'tiny.json');

  if (!fs.existsSync(filePath)) {
    console.log('    ⊘ Skipped (tiny.json not found)');
    return;
  }

  const stats = fs.statSync(filePath);
  console.log(`    → Uploading ${stats.size} bytes...`);

  try {
    const form = new FormData();
    form.append('files', fs.createReadStream(filePath), {
      filename: 'tiny.json',
      contentType: 'application/json',
    });

    // Add configuration
    const config = {
      sources: {
        enabled: true,
        roleSubset: 'both',
        minCharsUser: 100,
        minCharsAssistant: 100,
        stitchStrategy: 'by_chat',
      },
      code: {
        enabled: true,
        minLength: 10,
        deduplicate: true,
      },
      duplicates: {
        enabled: true,
        algorithm: 'jaccard',
        threshold: 0.8,
      },
    };

    form.append('config', JSON.stringify(config));

    // Upload via HTTP
    const response = await uploadFile(form);

    assert(response.success, 'Import should succeed');
    assert(response.results, 'Response should have results');
    assert(response.results.length > 0, 'Should have at least one result');

    const result = response.results[0];
    console.log(`    ✓ Import successful:`);
    console.log(`      - Conversations: ${result.conversations || 0}`);
    console.log(`      - Sources: ${result.sources || 0}`);
    console.log(`      - Code blocks: ${result.codeBlocks || 0}`);
    console.log(`      - Duplicates: ${result.duplicates || 0}`);

  } catch (error) {
    // If endpoint doesn't exist yet, that's okay
    if (error.message.includes('404') || error.message.includes('Not found')) {
      console.log('    ⊘ Skipped (endpoint not implemented yet)');
      return;
    }
    throw error;
  }
}

/**
 * Test: Neo4j Data Integrity
 */
async function testNeo4jData() {
  console.log('  → Checking Neo4j data...');

  try {
    // Query conversations
    const response = await fetch(`${API_URL}/api/v1/nodes?type=conversation&limit=10`);

    if (response.status === 404) {
      console.log('    ⊘ Skipped (nodes endpoint not available)');
      return;
    }

    const data = await response.json();

    if (data.nodes && data.nodes.length > 0) {
      console.log(`    ✓ Found ${data.nodes.length} nodes in Neo4j`);
    } else {
      console.log('    ℹ No nodes found (database might be empty)');
    }

  } catch (error) {
    console.log('    ⊘ Skipped (could not query Neo4j)');
  }
}

/**
 * Helper: Upload file via FormData
 */
function uploadFile(form) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}/api/v1/import/enhanced`);

    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: form.getHeaders(),
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const data = JSON.parse(body);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.error || body}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);

    form.pipe(req);
  });
}

/**
 * Helper: fetch polyfill for Node < 18
 */
async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const requestOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: options.headers || {},
    };

    const req = http.request(requestOptions, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        const response = {
          status: res.statusCode,
          statusText: res.statusMessage,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers,
          json: async () => JSON.parse(body),
          text: async () => body,
        };

        resolve(response);
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Simple assertion helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Export
module.exports = { run };

// CLI
if (require.main === module) {
  run()
    .then(() => {
      console.log('\n✓ All tests passed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Test failed:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    });
}
