#!/usr/bin/env node

/**
 * wait-for.js
 * Wait for HTTP or TCP endpoints to become available.
 */

const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');

async function waitFor(endpoint, options = {}) {
  const { timeout = 60000, interval = 1000, verbose = false } = options;

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
        console.log(`OK ${endpoint} is available`);
      }
      return true;
    } catch {
      if (verbose && attempt % 5 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`WAIT ${endpoint}... (${elapsed}s)`);
      }

      await sleep(interval);
    }
  }

  throw new Error(`Timeout waiting for ${endpoint} (${timeout}ms)`);
}

function checkHttp(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: 2000 }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve();
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
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
 * Supports formats: host:port or tcp://host:port
 */
function checkTcp(endpoint) {
  return new Promise((resolve, reject) => {
    let host;
    let port;

    if (endpoint.startsWith('tcp://')) {
      const url = new URL(endpoint);
      host = url.hostname;
      port = parseInt(url.port, 10);
    } else {
      const parts = endpoint.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10);
    }

    if (!host || Number.isNaN(port)) {
      reject(new Error('Invalid TCP endpoint format (expected host:port or tcp://host:port)'));
      return;
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
      if (!resolved) reject(error);
    });

    socket.once('timeout', () => {
      socket.destroy();
      if (!resolved) reject(new Error('Connection timeout'));
    });

    socket.connect(port, host);
  });
}

async function waitForAll(endpoints, options = {}) {
  const promises = endpoints.map((endpoint) => waitFor(endpoint, options));
  await Promise.all(promises);
  return true;
}

async function waitForSequence(endpoints, options = {}) {
  for (const endpoint of endpoints) {
    await waitFor(endpoint, options);
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: node wait-for.js <endpoint> [options]');
    console.log('');
    console.log('Endpoints:');
    console.log('  http://localhost:4001/health          HTTP endpoint');
    console.log('  https://api.example.com               HTTPS endpoint');
    console.log('  localhost:4001                        TCP endpoint');
    console.log('  tcp://localhost:4001                  TCP endpoint (URI format)');
    console.log('');
    console.log('Options:');
    console.log('  --timeout <ms>     Max wait time (default: 60000)');
    console.log('  --interval <ms>    Check interval (default: 1000)');
    console.log('  --verbose          Log progress');
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const endpoint = args[0];
  const options = { verbose: args.includes('--verbose') };

  const timeoutIndex = args.indexOf('--timeout');
  if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
    options.timeout = parseInt(args[timeoutIndex + 1], 10);
  }

  const intervalIndex = args.indexOf('--interval');
  if (intervalIndex !== -1 && args[intervalIndex + 1]) {
    options.interval = parseInt(args[intervalIndex + 1], 10);
  }

  waitFor(endpoint, options)
    .then(() => {
      console.log(`OK ${endpoint} is ready`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`FAIL ${endpoint}: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { waitFor, waitForAll, waitForSequence };
