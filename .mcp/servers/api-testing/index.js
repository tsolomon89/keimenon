#!/usr/bin/env node

/**
 * Canvas Memory OS - API Testing MCP Server
 *
 * Provides comprehensive tools for testing API endpoints with proper authentication,
 * multi-tenant testing, and CRUD operation validation.
 *
 * Tools:
 * - login: Authenticate and get JWT token
 * - test_endpoint: Make authenticated API calls
 * - test_crud: Test full CRUD lifecycle for a resource
 * - test_multi_tenant: Verify data isolation between accounts
 * - test_import: Test chat import pipeline
 * - test_permissions: Verify RBAC enforcement
 * - get_auth_status: Check current authentication state
 *
 * This server enables end-to-end testing of:
 * - Admin account operations
 * - Client account operations
 * - User management CRUD
 * - Data management CRUD (nodes, edges, sources)
 * - Import pipeline workflows
 * - Permission-based access control
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// API configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';
const API_VERSION = '/api/v1';

class APITestingMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'canvas-api-testing',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Authentication state
    this.authTokens = new Map(); // accountId -> { token, user, account }
    this.currentAuth = null;

    // Setup request handlers
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
          name: 'login',
          description:
            'Authenticate with email/password and optionally select account. Returns JWT token for subsequent requests.',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'User email address',
              },
              password: {
                type: 'string',
                description: 'User password',
              },
              account_id: {
                type: 'string',
                description: 'Optional account ID to select (if user has multiple accounts)',
              },
            },
            required: ['email', 'password'],
          },
        },
        {
          name: 'test_endpoint',
          description:
            'Make an authenticated API request to any endpoint. Supports GET, POST, PUT, DELETE methods.',
          inputSchema: {
            type: 'object',
            properties: {
              method: {
                type: 'string',
                description: 'HTTP method',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                default: 'GET',
              },
              path: {
                type: 'string',
                description: 'API path (e.g., "/nodes" or "/accounts")',
              },
              body: {
                type: 'object',
                description: 'Request body (for POST/PUT/PATCH)',
              },
              query: {
                type: 'object',
                description: 'Query parameters (e.g., { limit: 10, kind: "Source" })',
              },
              use_auth: {
                type: 'string',
                description: 'Account ID to use for auth (defaults to current)',
              },
              expect_status: {
                type: 'number',
                description: 'Expected status code (for validation)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'test_crud',
          description:
            'Test complete CRUD lifecycle for a resource type (Create, Read, Update, Delete)',
          inputSchema: {
            type: 'object',
            properties: {
              resource_type: {
                type: 'string',
                description: 'Resource type to test',
                enum: ['nodes', 'edges', 'users', 'accounts', 'boards', 'groups'],
              },
              test_data: {
                type: 'object',
                description: 'Test data for creation',
              },
              update_data: {
                type: 'object',
                description: 'Data for update operation',
              },
            },
            required: ['resource_type', 'test_data'],
          },
        },
        {
          name: 'test_multi_tenant',
          description:
            'Test data isolation between two accounts. Verifies account A cannot access account B data.',
          inputSchema: {
            type: 'object',
            properties: {
              account_a_email: {
                type: 'string',
                description: 'Email for first account',
              },
              account_a_password: {
                type: 'string',
                description: 'Password for first account',
              },
              account_b_email: {
                type: 'string',
                description: 'Email for second account',
              },
              account_b_password: {
                type: 'string',
                description: 'Password for second account',
              },
              test_resource: {
                type: 'string',
                description: 'Resource type to test isolation',
                enum: ['nodes', 'edges', 'boards', 'groups'],
                default: 'nodes',
              },
            },
            required: [
              'account_a_email',
              'account_a_password',
              'account_b_email',
              'account_b_password',
            ],
          },
        },
        {
          name: 'test_import',
          description: 'Test chat import pipeline with a sample file or inline data',
          inputSchema: {
            type: 'object',
            properties: {
              import_data: {
                type: 'object',
                description: 'Chat data to import (ChatGPT/Claude format)',
              },
              config: {
                type: 'object',
                description: 'Import configuration options',
                properties: {
                  deduplication: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean', default: true },
                      algorithm: {
                        type: 'string',
                        enum: ['jaccard', 'levenshtein', 'cosine'],
                        default: 'jaccard',
                      },
                      threshold: { type: 'number', default: 0.85 },
                    },
                  },
                  sources_mode: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean', default: false },
                    },
                  },
                  code_extraction: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean', default: true },
                    },
                  },
                },
              },
              verify_results: {
                type: 'boolean',
                description: 'Verify import results by querying created nodes',
                default: true,
              },
            },
            required: ['import_data'],
          },
        },
        {
          name: 'test_permissions',
          description:
            'Test RBAC enforcement by attempting operations at different permission levels',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'User email',
              },
              password: {
                type: 'string',
                description: 'User password',
              },
              test_operations: {
                type: 'array',
                description:
                  'Operations to test (e.g., ["create_node", "delete_user", "view_analytics"])',
                items: { type: 'string' },
              },
            },
            required: ['email', 'password'],
          },
        },
        {
          name: 'get_auth_status',
          description: 'Get current authentication status and available auth tokens',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'create_test_account',
          description: 'Create a test account with a user for testing purposes',
          inputSchema: {
            type: 'object',
            properties: {
              account_type: {
                type: 'string',
                enum: ['admin', 'client'],
                default: 'client',
                description: 'Type of account to create',
              },
              account_class: {
                type: 'string',
                enum: ['free', 'professional', 'business'],
                default: 'free',
                description: 'Account tier',
              },
              user_email: {
                type: 'string',
                description: 'Email for the test user',
              },
              user_password: {
                type: 'string',
                description: 'Password for the test user',
                default: 'test123456',
              },
              auto_login: {
                type: 'boolean',
                description: 'Automatically login after creation',
                default: true,
              },
            },
            required: ['user_email'],
          },
        },
        {
          name: 'cleanup_test_data',
          description: 'Clean up test data (nodes, edges, accounts) created during testing',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: {
                type: 'string',
                description: 'Account ID to clean up (optional - cleans current if omitted)',
              },
              data_tag: {
                type: 'string',
                description: 'Only delete data with this tag',
                enum: ['test', 'automated'],
                default: 'test',
              },
              delete_account: {
                type: 'boolean',
                description: 'Also delete the account itself',
                default: false,
              },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'login':
            return await this.login(args);
          case 'test_endpoint':
            return await this.testEndpoint(args);
          case 'test_crud':
            return await this.testCRUD(args);
          case 'test_multi_tenant':
            return await this.testMultiTenant(args);
          case 'test_import':
            return await this.testImport(args);
          case 'test_permissions':
            return await this.testPermissions(args);
          case 'get_auth_status':
            return await this.getAuthStatus(args);
          case 'create_test_account':
            return await this.createTestAccount(args);
          case 'cleanup_test_data':
            return await this.cleanupTestData(args);
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

  /**
   * Make HTTP request to API
   */
  async makeRequest(method, path, options = {}) {
    const { body, query, headers = {}, token } = options;

    // Build URL with query parameters
    let url = `${API_BASE_URL}${API_VERSION}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    // Build request options
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    // Add auth token if provided
    if (token) {
      fetchOptions.headers['Authorization'] = `Bearer ${token}`;
    } else if (this.currentAuth) {
      fetchOptions.headers['Authorization'] = `Bearer ${this.currentAuth.token}`;
    }

    // Add body for POST/PUT/PATCH
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Make request
    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: data,
    };
  }

  // Tool implementations

  async login(args) {
    const { email, password, account_id } = args;

    try {
      // Step 1: Login with email/password
      const response = await this.makeRequest('POST', '/auth/login', {
        body: { email, password },
      });

      if (!response.ok) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: 'Login failed',
                  status: response.status,
                  message: response.data,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const loginResult = response.data;

      // Step 2: Handle multi-account scenario
      if (loginResult.requiresAccountSelection) {
        if (!account_id) {
          // Return available accounts for selection
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    requiresAccountSelection: true,
                    availableAccounts: loginResult.availableAccounts,
                    message: 'User has multiple accounts. Please provide account_id parameter.',
                    tempToken: loginResult.tempToken,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Select account
        const selectResponse = await this.makeRequest('POST', '/auth/select-account', {
          body: { accountId: account_id },
          token: loginResult.tempToken,
        });

        if (!selectResponse.ok) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: 'Account selection failed',
                    status: selectResponse.status,
                    message: selectResponse.data,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Store auth for this account
        const authData = selectResponse.data;
        this.authTokens.set(authData.account.id, {
          token: authData.token,
          user: authData.user,
          account: authData.account,
          membership: authData.membership,
        });
        this.currentAuth = this.authTokens.get(authData.account.id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  user: authData.user,
                  account: authData.account,
                  membership: authData.membership,
                  token: authData.token,
                  message: 'Successfully logged in and selected account',
                },
                null,
                2
              ),
            },
          ],
        };
      } else {
        // Single account - direct login
        this.authTokens.set(loginResult.account.id, {
          token: loginResult.token,
          user: loginResult.user,
          account: loginResult.account,
          membership: loginResult.membership,
        });
        this.currentAuth = this.authTokens.get(loginResult.account.id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  user: loginResult.user,
                  account: loginResult.account,
                  membership: loginResult.membership,
                  token: loginResult.token,
                  message: 'Successfully logged in',
                },
                null,
                2
              ),
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
                stack: error.stack,
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

  async testEndpoint(args) {
    const { method = 'GET', path, body, query, use_auth, expect_status } = args;

    if (!this.currentAuth && !use_auth) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'Not authenticated. Please use the login tool first.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get auth token
    let token = this.currentAuth?.token;
    if (use_auth) {
      const auth = this.authTokens.get(use_auth);
      if (!auth) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: `No auth token found for account: ${use_auth}`,
                  availableAccounts: Array.from(this.authTokens.keys()),
                },
                null,
                2
              ),
            },
          ],
        };
      }
      token = auth.token;
    }

    const response = await this.makeRequest(method, path, {
      body,
      query,
      token,
    });

    // Validate expected status if provided
    const statusMatches = expect_status ? response.status === expect_status : true;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: response.ok && statusMatches,
              request: {
                method,
                path,
                body,
                query,
              },
              response: {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                data: response.data,
              },
              validation: expect_status
                ? {
                    expected: expect_status,
                    actual: response.status,
                    passed: statusMatches,
                  }
                : undefined,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async testCRUD(args) {
    const { resource_type, test_data, update_data } = args;

    if (!this.currentAuth) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'Not authenticated. Please use the login tool first.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const results = {
      resource_type,
      operations: {},
    };

    try {
      // CREATE
      console.error(`[CRUD Test] Creating ${resource_type}...`);
      const createResp = await this.makeRequest('POST', `/${resource_type}`, {
        body: test_data,
      });
      results.operations.create = {
        success: createResp.ok,
        status: createResp.status,
        data: createResp.data,
      };

      if (!createResp.ok) {
        throw new Error(`Create failed: ${JSON.stringify(createResp.data)}`);
      }

      const resourceId = createResp.data?.id || createResp.data?.[0]?.id;
      if (!resourceId) {
        throw new Error('No resource ID returned from create operation');
      }

      // READ
      console.error(`[CRUD Test] Reading ${resource_type}/${resourceId}...`);
      const readResp = await this.makeRequest('GET', `/${resource_type}/${resourceId}`);
      results.operations.read = {
        success: readResp.ok,
        status: readResp.status,
        data: readResp.data,
      };

      // UPDATE (if update_data provided)
      if (update_data) {
        console.error(`[CRUD Test] Updating ${resource_type}/${resourceId}...`);
        const updateResp = await this.makeRequest('PUT', `/${resource_type}/${resourceId}`, {
          body: update_data,
        });
        results.operations.update = {
          success: updateResp.ok,
          status: updateResp.status,
          data: updateResp.data,
        };
      }

      // DELETE
      console.error(`[CRUD Test] Deleting ${resource_type}/${resourceId}...`);
      const deleteResp = await this.makeRequest('DELETE', `/${resource_type}/${resourceId}`);
      results.operations.delete = {
        success: deleteResp.ok,
        status: deleteResp.status,
        data: deleteResp.data,
      };

      // VERIFY DELETE
      console.error(`[CRUD Test] Verifying delete...`);
      const verifyResp = await this.makeRequest('GET', `/${resource_type}/${resourceId}`);
      results.operations.verify_delete = {
        success: verifyResp.status === 404,
        status: verifyResp.status,
        expected: 404,
      };

      results.overall_success = Object.values(results.operations).every((op) => op.success);
    } catch (error) {
      results.error = error.message;
      results.overall_success = false;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async testMultiTenant(args) {
    const {
      account_a_email,
      account_a_password,
      account_b_email,
      account_b_password,
      test_resource = 'nodes',
    } = args;

    const results = {
      test: 'multi-tenant-isolation',
      resource: test_resource,
      phases: {},
    };

    try {
      // Phase 1: Login to account A
      console.error('[Multi-Tenant Test] Logging in to Account A...');
      const loginA = await this.login({
        email: account_a_email,
        password: account_a_password,
      });
      const authA = JSON.parse(loginA.content[0].text);
      if (!authA.success) {
        throw new Error('Failed to login to Account A');
      }
      const tokenA = authA.token;
      const accountAId = authA.account.id;

      // Phase 2: Create test resource in account A
      console.error('[Multi-Tenant Test] Creating resource in Account A...');
      const createA = await this.makeRequest('POST', `/${test_resource}`, {
        token: tokenA,
        body: {
          kind: 'Source',
          properties: {
            title: `Multi-Tenant Test Resource - Account A`,
            content: `Test data for account ${accountAId}`,
            data_tag: 'test',
          },
        },
      });
      results.phases.create_in_account_a = {
        success: createA.ok,
        status: createA.status,
        resourceId: createA.data?.id,
      };

      if (!createA.ok) {
        throw new Error('Failed to create resource in Account A');
      }

      const resourceAId = createA.data.id;

      // Phase 3: Login to account B
      console.error('[Multi-Tenant Test] Logging in to Account B...');
      const loginB = await this.login({
        email: account_b_email,
        password: account_b_password,
      });
      const authB = JSON.parse(loginB.content[0].text);
      if (!authB.success) {
        throw new Error('Failed to login to Account B');
      }
      const tokenB = authB.token;
      const accountBId = authB.account.id;

      // Phase 4: Attempt to access account A's resource from account B (should fail)
      console.error('[Multi-Tenant Test] Attempting cross-account access (should fail)...');
      const crossAccess = await this.makeRequest('GET', `/${test_resource}/${resourceAId}`, {
        token: tokenB,
      });
      results.phases.cross_account_access = {
        success: !crossAccess.ok && (crossAccess.status === 403 || crossAccess.status === 404),
        status: crossAccess.status,
        expected: '403 or 404',
        message: 'Account B should not be able to access Account A resources',
      };

      // Phase 5: List resources in account B (should not include account A's resource)
      console.error('[Multi-Tenant Test] Listing resources in Account B...');
      const listB = await this.makeRequest('GET', `/${test_resource}`, {
        token: tokenB,
        query: { limit: 1000 },
      });
      const resourcesB = Array.isArray(listB.data) ? listB.data : listB.data?.[test_resource] || [];
      const foundAResourceInB = resourcesB.some((r) => r.id === resourceAId);
      results.phases.list_isolation = {
        success: !foundAResourceInB,
        resourceCount: resourcesB.length,
        foundCrossAccountResource: foundAResourceInB,
        message: 'Account B list should not contain Account A resources',
      };

      // Phase 6: Cleanup - delete test resource from account A
      console.error('[Multi-Tenant Test] Cleaning up test resource...');
      const deleteA = await this.makeRequest('DELETE', `/${test_resource}/${resourceAId}`, {
        token: tokenA,
      });
      results.phases.cleanup = {
        success: deleteA.ok,
        status: deleteA.status,
      };

      // Overall result
      results.overall_success =
        results.phases.create_in_account_a.success &&
        results.phases.cross_account_access.success &&
        results.phases.list_isolation.success;

      results.message = results.overall_success
        ? 'Multi-tenant isolation verified successfully'
        : 'Multi-tenant isolation test failed';
    } catch (error) {
      results.error = error.message;
      results.overall_success = false;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async testImport(args) {
    const { import_data, config = {}, verify_results = true } = args;

    if (!this.currentAuth) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'Not authenticated. Please use the login tool first.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const results = {
      test: 'chat-import',
      phases: {},
    };

    try {
      // Phase 1: Initiate import
      console.error('[Import Test] Initiating chat import...');
      const importResp = await this.makeRequest('POST', '/import/enhanced', {
        body: {
          data: import_data,
          config: config,
        },
      });
      results.phases.import = {
        success: importResp.ok,
        status: importResp.status,
        data: importResp.data,
      };

      if (!importResp.ok) {
        throw new Error(`Import failed: ${JSON.stringify(importResp.data)}`);
      }

      const importStats = importResp.data;

      // Phase 2: Verify results if requested
      if (verify_results) {
        console.error('[Import Test] Verifying import results...');

        // Query for created ChatThreads
        const threadsResp = await this.makeRequest('GET', '/nodes', {
          query: { kind: 'ChatThread', limit: 100 },
        });
        const threads = Array.isArray(threadsResp.data)
          ? threadsResp.data
          : threadsResp.data?.nodes || [];

        // Query for created Messages
        const messagesResp = await this.makeRequest('GET', '/nodes', {
          query: { kind: 'Message', limit: 1000 },
        });
        const messages = Array.isArray(messagesResp.data)
          ? messagesResp.data
          : messagesResp.data?.nodes || [];

        results.phases.verification = {
          success: true,
          actual_threads: threads.length,
          actual_messages: messages.length,
          reported_threads: importStats.threads || 0,
          reported_messages: importStats.messages || 0,
          matches:
            threads.length >= (importStats.threads || 0) &&
            messages.length >= (importStats.messages || 0),
        };
      }

      results.overall_success =
        results.phases.import.success && (!verify_results || results.phases.verification.success);
    } catch (error) {
      results.error = error.message;
      results.overall_success = false;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async testPermissions(args) {
    const { email, password, test_operations = [] } = args;

    const results = {
      test: 'permissions',
      user: email,
      operations: {},
    };

    try {
      // Login
      const loginResp = await this.login({ email, password });
      const auth = JSON.parse(loginResp.content[0].text);
      if (!auth.success) {
        throw new Error('Login failed');
      }

      results.permission_level = auth.membership?.permission_level;
      results.role_rank = auth.membership?.role_rank;

      // Define operations and their required permission levels
      const operations = {
        view_nodes: { method: 'GET', path: '/nodes', requiredRank: 1 },
        create_node: {
          method: 'POST',
          path: '/nodes',
          body: { kind: 'Source', properties: {} },
          requiredRank: 2,
        },
        view_users: { method: 'GET', path: '/users', requiredRank: 3 },
        create_user: {
          method: 'POST',
          path: '/users',
          body: { email: 'test@example.com', password: 'test123' },
          requiredRank: 3,
        },
        view_analytics: { method: 'GET', path: '/analytics', requiredRank: 4 },
        delete_account: { method: 'DELETE', path: '/accounts/test', requiredRank: 4 },
      };

      // Test operations
      for (const [opName, opConfig] of Object.entries(operations)) {
        if (test_operations.length > 0 && !test_operations.includes(opName)) {
          continue;
        }

        const shouldSucceed = auth.membership.role_rank >= opConfig.requiredRank;
        const resp = await this.makeRequest(opConfig.method, opConfig.path, {
          body: opConfig.body,
        });

        results.operations[opName] = {
          required_rank: opConfig.requiredRank,
          user_rank: auth.membership.role_rank,
          should_succeed: shouldSucceed,
          actually_succeeded: resp.ok,
          status: resp.status,
          passed: shouldSucceed === resp.ok,
        };
      }

      results.overall_success = Object.values(results.operations).every((op) => op.passed);
    } catch (error) {
      results.error = error.message;
      results.overall_success = false;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async getAuthStatus() {
    const status = {
      authenticated: !!this.currentAuth,
      current_account: this.currentAuth
        ? {
            account_id: this.currentAuth.account.id,
            account_name: this.currentAuth.account.name,
            account_type: this.currentAuth.account.account_type,
            user_email: this.currentAuth.user.email,
            permission_level: this.currentAuth.membership?.permission_level,
          }
        : null,
      available_accounts: Array.from(this.authTokens.entries()).map(([accountId, auth]) => ({
        account_id: accountId,
        account_name: auth.account.name,
        account_type: auth.account.account_type,
        user_email: auth.user.email,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  async createTestAccount(args) {
    const {
      account_type = 'client',
      account_class = 'free',
      user_email,
      user_password = 'test123456',
      auto_login = true,
    } = args;

    const results = {
      test: 'create-test-account',
      phases: {},
    };

    try {
      // Phase 1: Create account
      console.error('[Test Account] Creating account...');
      const accountResp = await this.makeRequest('POST', '/accounts', {
        body: {
          account_type,
          account_class,
          name: `Test Account - ${user_email}`,
          email: user_email,
        },
      });
      results.phases.create_account = {
        success: accountResp.ok,
        status: accountResp.status,
        data: accountResp.data,
      };

      if (!accountResp.ok) {
        throw new Error(`Account creation failed: ${JSON.stringify(accountResp.data)}`);
      }

      const accountId = accountResp.data.id;

      // Phase 2: Create user
      console.error('[Test Account] Creating user...');
      const userResp = await this.makeRequest('POST', '/users', {
        body: {
          email: user_email,
          password: user_password,
          name: `Test User - ${user_email}`,
          account_id: accountId,
        },
      });
      results.phases.create_user = {
        success: userResp.ok,
        status: userResp.status,
        data: userResp.data,
      };

      if (!userResp.ok) {
        throw new Error(`User creation failed: ${JSON.stringify(userResp.data)}`);
      }

      // Phase 3: Auto-login if requested
      if (auto_login) {
        console.error('[Test Account] Logging in...');
        const loginResp = await this.login({
          email: user_email,
          password: user_password,
          account_id: accountId,
        });
        const auth = JSON.parse(loginResp.content[0].text);
        results.phases.auto_login = {
          success: auth.success,
          token: auth.token,
        };
      }

      results.overall_success = true;
      results.account_id = accountId;
      results.user_email = user_email;
    } catch (error) {
      results.error = error.message;
      results.overall_success = false;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async cleanupTestData(args) {
    const { account_id, data_tag = 'test', delete_account = false } = args;

    if (!this.currentAuth && !account_id) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: 'Not authenticated and no account_id provided',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const targetAccountId = account_id || this.currentAuth.account.id;

    const results = {
      test: 'cleanup',
      account_id: targetAccountId,
      data_tag,
      phases: {},
    };

    try {
      // Phase 1: Delete nodes with data_tag
      console.error('[Cleanup] Deleting test nodes...');
      const nodesResp = await this.makeRequest('DELETE', '/nodes', {
        query: { data_tag },
      });
      results.phases.delete_nodes = {
        success: nodesResp.ok,
        status: nodesResp.status,
        data: nodesResp.data,
      };

      // Phase 2: Delete edges with data_tag
      console.error('[Cleanup] Deleting test edges...');
      const edgesResp = await this.makeRequest('DELETE', '/edges', {
        query: { data_tag },
      });
      results.phases.delete_edges = {
        success: edgesResp.ok,
        status: edgesResp.status,
        data: edgesResp.data,
      };

      // Phase 3: Delete account if requested
      if (delete_account) {
        console.error('[Cleanup] Deleting account...');
        const accountResp = await this.makeRequest('DELETE', `/accounts/${targetAccountId}`);
        results.phases.delete_account = {
          success: accountResp.ok,
          status: accountResp.status,
        };

        // Clear auth for this account
        this.authTokens.delete(targetAccountId);
        if (this.currentAuth?.account.id === targetAccountId) {
          this.currentAuth = null;
        }
      }

      results.overall_success = true;
    } catch (error) {
      results.error = error.message;
      results.overall_success = false;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  async cleanup() {
    await this.server.close();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[API Testing MCP] Server running on stdio');
    console.error(`[API Testing MCP] API Base URL: ${API_BASE_URL}`);
  }
}

// Start server
const server = new APITestingMCPServer();
server.start().catch(console.error);
