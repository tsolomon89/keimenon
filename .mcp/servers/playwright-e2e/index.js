#!/usr/bin/env node

/**
 * Canvas Memory OS - Playwright E2E MCP Server
 *
 * Provides comprehensive tools for controlling and monitoring Playwright E2E tests.
 * This server enables Claude to:
 * - List and run tests with filters (grep, project, shard, tag)
 * - Start/stop the application under test
 * - Fetch test artifacts (reports, traces, videos, screenshots)
 * - Monitor test execution and retrieve results
 * - Access test correlation data via test IDs
 *
 * Tools:
 * - pw.listTests: List available tests with metadata
 * - pw.run: Execute Playwright tests with options
 * - pw.lastFailures: Get details of last failed tests
 * - app.start: Start web and API servers for testing
 * - app.stop: Stop running servers
 * - app.health: Check server health (cached 30s to reduce token usage)
 * - artifacts.list: List available test artifacts
 * - artifacts.read: Read artifact contents
 * - env.info: Get environment and version information
 *
 * Resources:
 * - playwright://reports/* - Test reports
 * - playwright://traces/* - Test traces
 * - playwright://videos/* - Test videos
 * - playwright://screenshots/* - Test screenshots
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../../..');

// Configuration
const WEB_PORT = 3000;
const API_PORT = 4001;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

class PlaywrightE2EMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'playwright-e2e',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Running processes
    this.processes = new Map(); // jobId -> { process, type, startTime, logs }
    this.runningServers = new Map(); // 'web' | 'api' -> process

    // Health check cache (reduces token usage)
    this.healthCache = { timestamp: 0, data: null };

    // Process state registry (tracks PIDs and health)
    this.processRegistry = {
      api: { pid: null, started_at: null, started_by: null, healthy: false },
      web: { pid: null, started_at: null, started_by: null, healthy: false },
    };

    // Setup handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'pw.listTests',
          description:
            'List all available Playwright tests with their metadata (file, project, tags)',
          inputSchema: {
            type: 'object',
            properties: {
              grep: {
                type: 'string',
                description: 'Filter tests by grep pattern (e.g., "login", "@smoke")',
              },
            },
          },
        },
        {
          name: 'pw.run',
          description:
            'Run Playwright tests. Returns incremental output and summary. Requires user approval.',
          inputSchema: {
            type: 'object',
            properties: {
              grep: {
                type: 'string',
                description: 'Filter tests by grep pattern',
              },
              project: {
                type: 'string',
                description: 'Browser project to run',
                enum: ['chromium', 'firefox', 'webkit'],
              },
              shard: {
                type: 'string',
                description: 'Shard specification (e.g., "1/3")',
              },
              retries: {
                type: 'number',
                description: 'Number of retries for failed tests',
                default: 0,
              },
              headed: {
                type: 'boolean',
                description: 'Run tests in headed mode',
                default: false,
              },
              tag: {
                type: 'string',
                description: 'Filter by tag (e.g., "@smoke", "@full")',
              },
            },
          },
        },
        {
          name: 'pw.lastFailures',
          description: 'Get details of the last test run failures with trace/screenshot paths',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'app.start',
          description: 'Start the web and API servers for testing. Requires user approval.',
          inputSchema: {
            type: 'object',
            properties: {
              env: {
                type: 'string',
                description: 'Environment to start',
                enum: ['local', 'ci'],
                default: 'local',
              },
            },
          },
        },
        {
          name: 'app.stop',
          description: 'Stop running web and API servers. Requires user approval.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'app.health',
          description: 'Check server health status (cached for 30 seconds to reduce token usage)',
          inputSchema: {
            type: 'object',
            properties: {
              force_refresh: {
                type: 'boolean',
                description: 'Force refresh cache (skip cached value)',
                default: false,
              },
            },
          },
        },
        {
          name: 'artifacts.list',
          description: 'List available test artifacts (reports, traces, videos, screenshots)',
          inputSchema: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                description: 'Type of artifacts to list',
                enum: ['report', 'trace', 'video', 'screenshot'],
              },
              limit: {
                type: 'number',
                description: 'Maximum number of artifacts to return',
                default: 20,
              },
            },
          },
        },
        {
          name: 'artifacts.read',
          description: 'Read artifact file contents (text or base64 for binary)',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Relative path to artifact file',
              },
              base64: {
                type: 'boolean',
                description: 'Return as base64 for binary files',
                default: false,
              },
              maxSize: {
                type: 'number',
                description: 'Maximum file size in bytes (default: 1MB)',
                default: 1048576,
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'env.info',
          description: 'Get environment information (node version, playwright version, etc.)',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'playwright://reports',
          name: 'Test Reports',
          description: 'HTML test reports from Playwright runs',
          mimeType: 'text/html',
        },
        {
          uri: 'playwright://traces',
          name: 'Test Traces',
          description: 'Playwright trace files for debugging',
          mimeType: 'application/zip',
        },
        {
          uri: 'playwright://artifacts',
          name: 'All Test Artifacts',
          description: 'All test artifacts (traces, videos, screenshots)',
          mimeType: 'application/json',
        },
      ],
    }));

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri.startsWith('playwright://')) {
        const resourceType = uri.replace('playwright://', '').split('/')[0];

        switch (resourceType) {
          case 'reports':
            return await this.readReportResource();
          case 'traces':
            return await this.readTracesResource();
          case 'artifacts':
            return await this.listAllArtifacts();
          default:
            throw new Error(`Unknown resource type: ${resourceType}`);
        }
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'pw.listTests':
            return await this.listTests(args);
          case 'pw.run':
            return await this.runTests(args);
          case 'pw.lastFailures':
            return await this.getLastFailures(args);
          case 'app.start':
            return await this.startApp(args);
          case 'app.stop':
            return await this.stopApp(args);
          case 'app.health':
            return await this.getHealth(args);
          case 'artifacts.list':
            return await this.listArtifacts(args);
          case 'artifacts.read':
            return await this.readArtifact(args);
          case 'env.info':
            return await this.getEnvInfo(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error.message,
                  stack: error.stack,
                  tool: name,
                  args: args,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  // Tool implementations

  async listTests(args) {
    const { grep } = args;

    try {
      const cmd = ['npx', 'playwright', 'test', '--list'];
      if (grep) {
        cmd.push('--grep', grep);
      }

      const output = await this.execCommand(cmd, REPO_ROOT);
      const lines = output.split('\n').filter((line) => line.trim());

      // Parse test list output
      const tests = [];
      for (const line of lines) {
        if (line.includes('.spec.ts')) {
          tests.push({
            file: line.trim(),
            // Extract project and tags from output if available
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: tests.length,
                tests: tests,
                grep: grep || null,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async runTests(args) {
    const { grep, project, shard, retries = 0, headed = false, tag } = args;

    try {
      const cmd = ['npx', 'playwright', 'test'];

      if (grep) cmd.push('--grep', grep);
      if (project) cmd.push('--project', project);
      if (shard) cmd.push('--shard', shard);
      if (retries > 0) cmd.push('--retries', retries.toString());
      if (headed) cmd.push('--headed');
      if (tag) cmd.push('--grep', tag);

      console.error(`[Playwright] Running: ${cmd.join(' ')}`);

      const startTime = Date.now();
      const output = await this.execCommand(cmd, REPO_ROOT, {
        BASE_URL: WEB_URL,
        API_BASE_URL: API_URL,
      });
      const duration = Date.now() - startTime;

      // Parse output for summary
      const lines = output.split('\n');
      const summary = this.parseTestSummary(lines);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: summary.failed === 0,
                duration: duration,
                summary: summary,
                output: output,
                artifactsPath: join(REPO_ROOT, 'test-results'),
                reportPath: join(REPO_ROOT, 'playwright-report'),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
                output: error.stdout || '',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async getLastFailures() {
    try {
      const resultsDir = join(REPO_ROOT, 'test-results');

      try {
        await stat(resultsDir);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  failures: [],
                  message: 'No test results found',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const failures = [];
      const testDirs = await readdir(resultsDir);

      for (const testDir of testDirs) {
        const testPath = join(resultsDir, testDir);
        const testStat = await stat(testPath);

        if (testStat.isDirectory()) {
          // Look for trace files
          const files = await readdir(testPath);
          const traceFile = files.find((f) => f.endsWith('.zip'));

          if (traceFile) {
            failures.push({
              test: testDir,
              tracePath: join(testPath, traceFile),
              relativeTracePath: join('test-results', testDir, traceFile),
            });
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: failures.length,
                failures: failures,
                viewCommand: 'npx playwright show-trace <tracePath>',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async startApp(args) {
    const { env = 'local' } = args;

    try {
      console.error('[App] Starting web and API servers...');

      // FAST PATH: Check process registry first (no HTTP calls)
      if (this.processRegistry.api.healthy && this.processRegistry.web.healthy) {
        // Verify processes still exist
        let apiAlive = false;
        let webAlive = false;

        try {
          if (this.processRegistry.api.pid) {
            process.kill(this.processRegistry.api.pid, 0); // Signal 0 = check if process exists
            apiAlive = true;
          }
        } catch {
          // Process doesn't exist
          this.processRegistry.api.healthy = false;
          this.processRegistry.api.pid = null;
        }

        try {
          if (this.processRegistry.web.pid) {
            process.kill(this.processRegistry.web.pid, 0);
            webAlive = true;
          }
        } catch {
          // Process doesn't exist
          this.processRegistry.web.healthy = false;
          this.processRegistry.web.pid = null;
        }

        if (apiAlive && webAlive) {
          console.error('[App] ✅ Servers already running (from registry, no health check needed)');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    cached: true,
                    servers: {
                      api: {
                        url: API_URL,
                        port: API_PORT,
                        running: true,
                        pid: this.processRegistry.api.pid,
                        started_at: this.processRegistry.api.started_at,
                        source: 'registry',
                      },
                      web: {
                        url: WEB_URL,
                        port: WEB_PORT,
                        running: true,
                        pid: this.processRegistry.web.pid,
                        started_at: this.processRegistry.web.started_at,
                        source: 'registry',
                      },
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      }

      // SLOW PATH: Verify via health check (cached if recent)
      console.error('[App] Registry check failed, performing health check...');
      const healthResult = await this.getHealth({ force_refresh: false });
      const health = JSON.parse(healthResult.content[0].text);

      // Start API if not running
      if (!health.api.running && !this.processRegistry.api.healthy) {
        console.error('[App] Starting API server...');
        const apiProc = await this.startServer(
          'api',
          'npm',
          ['run', 'dev'],
          join(REPO_ROOT, 'apps/api'),
          {
            PORT: API_PORT,
            NODE_ENV: env === 'ci' ? 'test' : 'development',
          }
        );

        this.runningServers.set('api', apiProc);

        // Update registry
        this.processRegistry.api = {
          pid: apiProc.pid,
          started_at: Date.now(),
          started_by: 'mcp-server',
          healthy: false, // Will be set to true after waitForServer succeeds
        };

        // Wait for API
        await this.waitForServer(`${API_URL}/health`, 'API', 60000);

        // Mark healthy in registry
        this.processRegistry.api.healthy = true;

        // Invalidate cache
        this.healthCache.timestamp = 0;
      } else {
        console.error('[App] API already running');
      }

      // Start Web if not running
      if (!health.web.running && !this.processRegistry.web.healthy) {
        console.error('[App] Starting Web server...');
        const webProc = await this.startServer(
          'web',
          'npm',
          ['run', 'dev'],
          join(REPO_ROOT, 'apps/web'),
          {
            PORT: WEB_PORT,
            NODE_ENV: env === 'ci' ? 'test' : 'development',
          }
        );

        this.runningServers.set('web', webProc);

        // Update registry
        this.processRegistry.web = {
          pid: webProc.pid,
          started_at: Date.now(),
          started_by: 'mcp-server',
          healthy: false,
        };

        // Wait for Web
        await this.waitForServer(WEB_URL, 'Web', 60000);

        // Mark healthy in registry
        this.processRegistry.web.healthy = true;

        // Invalidate cache
        this.healthCache.timestamp = 0;
      } else {
        console.error('[App] Web already running');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                servers: {
                  api: {
                    url: API_URL,
                    port: API_PORT,
                    running: true,
                    pid: this.processRegistry.api.pid,
                    started_at: this.processRegistry.api.started_at,
                  },
                  web: {
                    url: WEB_URL,
                    port: WEB_PORT,
                    running: true,
                    pid: this.processRegistry.web.pid,
                    started_at: this.processRegistry.web.started_at,
                  },
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async stopApp() {
    try {
      console.error('[App] Stopping servers...');

      for (const [name, proc] of this.runningServers.entries()) {
        console.error(`[App] Stopping ${name}...`);
        proc.kill();
      }

      this.runningServers.clear();

      // Clear process registry
      this.processRegistry.api = {
        pid: null,
        started_at: null,
        started_by: null,
        healthy: false,
      };
      this.processRegistry.web = {
        pid: null,
        started_at: null,
        started_by: null,
        healthy: false,
      };

      // Invalidate health cache
      this.healthCache.timestamp = 0;

      console.error('[App] ✅ All servers stopped and registry cleared');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'All servers stopped',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async listArtifacts(args) {
    const { kind, limit = 20 } = args;

    try {
      const artifacts = [];
      const resultsDir = join(REPO_ROOT, 'test-results');
      const reportDir = join(REPO_ROOT, 'playwright-report');

      // List test results
      try {
        const testDirs = await readdir(resultsDir);

        for (const testDir of testDirs.slice(0, limit)) {
          const testPath = join(resultsDir, testDir);
          const testStat = await stat(testPath);

          if (testStat.isDirectory()) {
            const files = await readdir(testPath);

            for (const file of files) {
              const filePath = join(testPath, file);
              const fileStat = await stat(filePath);

              let fileKind = 'unknown';
              if (file.endsWith('.zip')) fileKind = 'trace';
              else if (file.endsWith('.webm')) fileKind = 'video';
              else if (file.endsWith('.png')) fileKind = 'screenshot';

              if (!kind || fileKind === kind) {
                artifacts.push({
                  kind: fileKind,
                  path: join('test-results', testDir, file),
                  size: fileStat.size,
                  modified: fileStat.mtime,
                });
              }
            }
          }
        }
      } catch (error) {
        // Results directory might not exist
      }

      // List reports
      if (!kind || kind === 'report') {
        try {
          const reportStat = await stat(reportDir);
          artifacts.push({
            kind: 'report',
            path: 'playwright-report',
            size: reportStat.size,
            modified: reportStat.mtime,
          });
        } catch {
          // Report might not exist
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: artifacts.length,
                artifacts: artifacts,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async readArtifact(args) {
    const { path: artifactPath, base64 = false, maxSize = 1048576 } = args;

    try {
      const fullPath = join(REPO_ROOT, artifactPath);

      // Security: ensure path is within repo
      if (!fullPath.startsWith(REPO_ROOT)) {
        throw new Error('Invalid path: must be within repository');
      }

      const fileStat = await stat(fullPath);

      if (fileStat.size > maxSize) {
        throw new Error(`File too large: ${fileStat.size} bytes (max: ${maxSize})`);
      }

      const content = await readFile(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                path: artifactPath,
                size: fileStat.size,
                content: base64 ? content.toString('base64') : content.toString('utf-8'),
                encoding: base64 ? 'base64' : 'utf-8',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async getEnvInfo() {
    try {
      // Get versions
      const nodeVersion = process.version;

      // Get Playwright version
      const pwVersion = await this.execCommand(['npx', 'playwright', '--version'], REPO_ROOT);

      // Get git commit
      let gitCommit = 'unknown';
      try {
        gitCommit = (await this.execCommand(['git', 'rev-parse', 'HEAD'], REPO_ROOT)).trim();
      } catch {
        // Git might not be available
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                environment: {
                  node: nodeVersion,
                  playwright: pwVersion.trim(),
                  gitCommit: gitCommit,
                  platform: process.platform,
                  arch: process.arch,
                },
                urls: {
                  web: WEB_URL,
                  api: API_URL,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async getHealth(args = {}) {
    const { force_refresh = false } = args;

    try {
      const now = Date.now();
      const CACHE_TTL = 30000; // 30 seconds

      // Return cached result if valid
      if (!force_refresh && this.healthCache.data && now - this.healthCache.timestamp < CACHE_TTL) {
        console.error(
          '[Health] Returning cached result (age: ${(now - this.healthCache.timestamp) / 1000}s)'
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...this.healthCache.data,
                  cached: true,
                  cache_age_seconds: Math.floor((now - this.healthCache.timestamp) / 1000),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Refresh health check
      console.error('[Health] Performing fresh health check...');

      const apiRunning = await this.checkServer(`${API_URL}/health`);
      const webRunning = await this.checkServer(WEB_URL);
      const dbPath = join(
        process.env.HOME || process.env.USERPROFILE,
        '.canvas-memory',
        'canvas.db'
      );

      // Check database accessibility
      let dbAccessible = false;
      try {
        await stat(dbPath);
        dbAccessible = true;
      } catch {
        dbAccessible = false;
      }

      // Verify process registry accuracy
      if (this.processRegistry.api.healthy && !apiRunning) {
        console.error(
          '[Health] Warning: Process registry shows API healthy but health check failed'
        );
        this.processRegistry.api.healthy = false;
        this.processRegistry.api.pid = null;
      }

      if (this.processRegistry.web.healthy && !webRunning) {
        console.error(
          '[Health] Warning: Process registry shows Web healthy but health check failed'
        );
        this.processRegistry.web.healthy = false;
        this.processRegistry.web.pid = null;
      }

      const healthData = {
        success: true,
        timestamp: now,
        api: {
          running: apiRunning,
          healthy: apiRunning,
          url: API_URL,
          port: API_PORT,
          pid: this.processRegistry.api.pid,
          started_at: this.processRegistry.api.started_at,
        },
        web: {
          running: webRunning,
          healthy: webRunning,
          url: WEB_URL,
          port: WEB_PORT,
          pid: this.processRegistry.web.pid,
          started_at: this.processRegistry.web.started_at,
        },
        database: {
          accessible: dbAccessible,
          path: dbPath,
        },
      };

      // Update cache
      this.healthCache = {
        timestamp: now,
        data: healthData,
      };

      console.error(
        `[Health] API: ${apiRunning ? '✅' : '❌'}, Web: ${webRunning ? '✅' : '❌'}, DB: ${dbAccessible ? '✅' : '❌'}`
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...healthData,
                cached: false,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  // Resource implementations

  async readReportResource() {
    const reportPath = join(REPO_ROOT, 'playwright-report', 'index.html');

    try {
      const content = await readFile(reportPath, 'utf-8');
      return {
        contents: [
          {
            uri: 'playwright://reports',
            mimeType: 'text/html',
            text: content,
          },
        ],
      };
    } catch {
      return {
        contents: [
          {
            uri: 'playwright://reports',
            mimeType: 'text/plain',
            text: 'No report available. Run tests first.',
          },
        ],
      };
    }
  }

  async readTracesResource() {
    const tracesDir = join(REPO_ROOT, 'test-results');

    try {
      const artifacts = [];
      const testDirs = await readdir(tracesDir);

      for (const testDir of testDirs) {
        const testPath = join(tracesDir, testDir);
        const files = await readdir(testPath);
        const traceFile = files.find((f) => f.endsWith('.zip'));

        if (traceFile) {
          artifacts.push({
            test: testDir,
            path: join('test-results', testDir, traceFile),
          });
        }
      }

      return {
        contents: [
          {
            uri: 'playwright://traces',
            mimeType: 'application/json',
            text: JSON.stringify(artifacts, null, 2),
          },
        ],
      };
    } catch {
      return {
        contents: [
          {
            uri: 'playwright://traces',
            mimeType: 'application/json',
            text: JSON.stringify([], null, 2),
          },
        ],
      };
    }
  }

  async listAllArtifacts() {
    const result = await this.listArtifacts({ limit: 100 });
    const data = JSON.parse(result.content[0].text);

    return {
      contents: [
        {
          uri: 'playwright://artifacts',
          mimeType: 'application/json',
          text: JSON.stringify(data.artifacts, null, 2),
        },
      ],
    };
  }

  // Helper methods

  execCommand(cmd, cwd, env = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd,
        env: { ...process.env, ...env },
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          const error = new Error(`Command failed with code ${code}: ${stderr}`);
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });
    });
  }

  startServer(name, command, args, cwd, env = {}) {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: true,
        detached: false,
      });

      proc.stdout.on('data', (data) => {
        console.error(`[${name}] ${data.toString().trim()}`);
      });

      proc.stderr.on('data', (data) => {
        console.error(`[${name}] ${data.toString().trim()}`);
      });

      resolve(proc);
    });
  }

  checkServer(url) {
    return new Promise((resolve) => {
      http
        .get(url, (res) => {
          resolve(res.statusCode === 200);
        })
        .on('error', () => {
          resolve(false);
        });
    });
  }

  async waitForServer(url, name, timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const isReady = await this.checkServer(url);
      if (isReady) {
        console.error(`[App] ${name} is ready at ${url}`);
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`${name} failed to start within ${timeout / 1000}s`);
  }

  parseTestSummary(lines) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of lines) {
      if (line.includes('passed')) {
        const match = line.match(/(\d+) passed/);
        if (match) passed = parseInt(match[1]);
      }
      if (line.includes('failed')) {
        const match = line.match(/(\d+) failed/);
        if (match) failed = parseInt(match[1]);
      }
      if (line.includes('skipped')) {
        const match = line.match(/(\d+) skipped/);
        if (match) skipped = parseInt(match[1]);
      }
    }

    return { passed, failed, skipped, total: passed + failed + skipped };
  }

  async cleanup() {
    console.error('[MCP] Cleaning up...');

    // Stop all processes
    for (const [name, proc] of this.runningServers.entries()) {
      console.error(`[MCP] Stopping ${name}...`);
      proc.kill();
    }

    await this.server.close();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Playwright E2E MCP] Server running on stdio');
    console.error(`[Playwright E2E MCP] Repository root: ${REPO_ROOT}`);
  }
}

// Start server
const server = new PlaywrightE2EMCPServer();
server.start().catch(console.error);
