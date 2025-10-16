#!/usr/bin/env node

/**
 * wait-for.js
 * Wait for HTTP/TCP endpoints to become available
 * Supports health check validation with retry logic
 */

const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');

/**
 * Wait for an endpoint to become available
 * @param {string} endpoint - URL (http://...) or TCP address (host:port or bolt://...)
 * @param {object} options - Options
 * @param {number} options.timeout - Max wait time (ms, default 60000)
 * @param {number} options.interval - Check interval (ms, default 1000)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<boolean>} - True if available, throws on timeout
 */
async function waitFor(endpoint, options = {}) {
  const {
    timeout = 60000,
    interval = 1000,
    verbose = false,
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;

    try {
      if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
        await checkHttp(endpoint);
      } else {
        await checkTcp(endpoint);
      }

      if (verbose) {
        console.log(`✓ ${endpoint} is available`);
      }
      return true;
    } catch (error) {
      if (verbose && attempt % 5 === 0) {
        // Log every 5 attempts to avoid spam
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏳ Waiting for ${endpoint}... (${elapsed}s)`);
      }

      await sleep(interval);
    }
  }

  throw new Error(`Timeout waiting for ${endpoint} (${timeout}ms)`);
}

/**
 * Check HTTP/HTTPS endpoint
 */
function checkHttp(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: 2000 }, (res) => {
      // Accept any 2xx or 3xx status
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve();
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }

      // Consume response to free up memory
      res.resume();
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Check TCP endpoint
 * Supports formats: host:port, bolt://host:port, neo4j://host:port, neo4j+s://host:port
 */
function checkTcp(endpoint) {
  return new Promise((resolve, reject) => {
    // Parse endpoint
    let host, port;

    if (endpoint.startsWith('bolt://') || endpoint.startsWith('neo4j://') || endpoint.startsWith('neo4j+s://')) {
      const url = new URL(endpoint);
      host = url.hostname;
      port = parseInt(url.port) || 7687;
    } else {
      const parts = endpoint.split(':');
      host = parts[0];
      port = parseInt(parts[1]);

      if (!host || isNaN(port)) {
        reject(new Error('Invalid TCP endpoint format (expected host:port)'));
        return;
      }
    }

    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(2000);

    socket.once('connect', () => {
      resolved = true;
      socket.destroy();
      resolve();
    });

    socket.once('error', (error) => {
      socket.destroy();
      if (!resolved) {
        reject(error);
      }
    });

    socket.once('timeout', () => {
      socket.destroy();
      if (!resolved) {
        reject(new Error('Connection timeout'));
      }
    });

    socket.connect(port, host);
  });
}

/**
 * Wait for multiple endpoints in parallel
 * @param {string[]} endpoints - Array of endpoints
 * @param {object} options - Options
 * @returns {Promise<boolean>} - True if all available
 */
async function waitForAll(endpoints, options = {}) {
  const promises = endpoints.map(endpoint => waitFor(endpoint, options));
  await Promise.all(promises);
  return true;
}

/**
 * Wait for multiple endpoints in sequence
 * @param {string[]} endpoints - Array of endpoints in order
 * @param {object} options - Options
 * @returns {Promise<boolean>} - True if all available
 */
async function waitForSequence(endpoints, options = {}) {
  for (const endpoint of endpoints) {
    await waitFor(endpoint, options);
  }
  return true;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: node wait-for.js <endpoint> [options]');
    console.log('');
    console.log('Endpoints:');
    console.log('  http://localhost:3001/health          HTTP endpoint');
    console.log('  https://api.example.com               HTTPS endpoint');
    console.log('  localhost:3001                        TCP endpoint');
    console.log('  bolt://localhost:7687                 Neo4j local endpoint');
    console.log('  neo4j+s://xxx.databases.neo4j.io      Neo4j Aura endpoint');
    console.log('');
    console.log('Options:');
    console.log('  --timeout <ms>     Max wait time (default: 60000)');
    console.log('  --interval <ms>    Check interval (default: 1000)');
    console.log('  --verbose          Log progress');
    console.log('');
    console.log('Examples:');
    console.log('  node wait-for.js http://localhost:3001/health');
    console.log('  node wait-for.js bolt://localhost:7687 --timeout 30000');
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const endpoint = args[0];
  const options = {
    verbose: args.includes('--verbose'),
  };

  // Parse timeout
  const timeoutIndex = args.indexOf('--timeout');
  if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
    options.timeout = parseInt(args[timeoutIndex + 1]);
  }

  // Parse interval
  const intervalIndex = args.indexOf('--interval');
  if (intervalIndex !== -1 && args[intervalIndex + 1]) {
    options.interval = parseInt(args[intervalIndex + 1]);
  }

  waitFor(endpoint, options)
    .then(() => {
      console.log(`✓ ${endpoint} is ready`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`✗ ${endpoint} failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { waitFor, waitForAll, waitForSequence };
