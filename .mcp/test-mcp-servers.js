#!/usr/bin/env node

/**
 * Test script for MCP servers
 * Tests each server by spawning it and sending a request
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const servers = [
  {
    name: 'keimenon-database',
    path: resolve(__dirname, 'servers/database/index.js'),
    env: {
      SQLITE_PATH: resolve(process.env.HOME || process.env.USERPROFILE, '.keimenon', 'keimenon.db'),
    },
    testRequest: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    },
  },
  {
    name: 'keimenon-docs',
    path: resolve(__dirname, 'servers/docs/index.js'),
    env: {},
    testRequest: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    },
  },
  {
    name: 'keimenon-api-testing',
    path: resolve(__dirname, 'servers/api-testing/index.js'),
    env: {
      API_BASE_URL: 'http://localhost:4001',
    },
    testRequest: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    },
  },
  {
    name: 'keimenon-chat-import',
    path: resolve(__dirname, 'servers/chat-import/index.js'),
    env: {
      API_BASE_URL: 'http://localhost:4001',
    },
    testRequest: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    },
  },
];

async function testServer(server) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${server.name}`);
    console.log(`Path: ${server.path}`);
    console.log(`${'='.repeat(60)}\n`);

    const child = spawn('node', [server.path], {
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let hasResponse = false;
    const timeout = setTimeout(() => {
      if (!hasResponse) {
        child.kill();
        reject(new Error(`Timeout waiting for response from ${server.name}`));
      }
    }, 5000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      try {
        const response = JSON.parse(data.toString());
        hasResponse = true;
        clearTimeout(timeout);
        child.kill();
        resolve({
          server: server.name,
          status: 'SUCCESS',
          response: response,
          stderr: stderr,
        });
      } catch (e) {
        // Not JSON yet, wait for more data
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject({
        server: server.name,
        status: 'ERROR',
        error: error.message,
        stderr: stderr,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (!hasResponse) {
        reject({
          server: server.name,
          status: 'FAILED',
          code: code,
          stderr: stderr,
          stdout: stdout,
        });
      }
    });

    // Send test request
    setTimeout(() => {
      child.stdin.write(JSON.stringify(server.testRequest) + '\n');
    }, 1000);
  });
}

async function runTests() {
  console.log('\n🧪 Testing Keimenon MCP Servers\n');

  const results = [];

  for (const server of servers) {
    try {
      const result = await testServer(server);
      results.push(result);

      console.log(`✅ ${result.server}: SUCCESS`);
      if (result.stderr) {
        console.log(`   Logs: ${result.stderr.split('\n')[0]}`);
      }
      if (result.response?.result?.tools) {
        console.log(`   Tools: ${result.response.result.tools.length} tools available`);
        result.response.result.tools.forEach((tool) => {
          console.log(`      - ${tool.name}: ${tool.description.substring(0, 60)}...`);
        });
      }
    } catch (error) {
      results.push(error);
      console.log(`❌ ${error.server}: ${error.status}`);
      if (error.error) console.log(`   Error: ${error.error}`);
      if (error.stderr) console.log(`   Stderr: ${error.stderr}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const successful = results.filter((r) => r.status === 'SUCCESS').length;
  const failed = results.length - successful;

  console.log(`Total Servers: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
