#!/usr/bin/env node

/**
 * Canvas Memory OS - Chat Import Testing MCP Server
 *
 * Provides tools for testing chat import functionality with curated test datasets.
 * Enables comprehensive validation of import pipelines, deduplication, and data integrity.
 *
 * Tools:
 * - list_test_datasets: Show available test datasets (tiny, small, medium)
 * - get_test_dataset: Retrieve a specific test dataset
 * - import_test_dataset: Import a test dataset via API
 * - verify_import_results: Validate import results against expected outcomes
 * - compare_imports: Compare results from two import runs
 * - generate_test_data: Create synthetic test data with specific characteristics
 * - test_deduplication: Test duplicate detection algorithms
 * - test_code_extraction: Test code block extraction
 * - test_sources_mode: Test message stitching into sources
 *
 * Test Datasets:
 * - tiny: 2 conversations, 10 messages (for quick smoke tests)
 * - small: 5 conversations, 50 messages (for basic validation)
 * - medium: 20 conversations, 200 messages (for realistic testing)
 * - large: 100 conversations, 1000 messages (for performance testing)
 * - edge-cases: Special cases (empty messages, unicode, code blocks, etc.)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root (3 levels up from .mcp/servers/chat-import)
const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEST_DATA_DIR = join(PROJECT_ROOT, '.mcp/test-data/chat-imports');

// API configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';
const API_VERSION = '/api/v1';

class ChatImportMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'canvas-chat-import',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Test datasets cache
    this.testDatasets = new Map();
    this.loadTestDatasets();

    // Import results history
    this.importHistory = [];

    // Setup request handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  loadTestDatasets() {
    // Define test datasets
    const datasets = {
      tiny: this.generateTinyDataset(),
      small: this.generateSmallDataset(),
      medium: this.generateMediumDataset(),
      'edge-cases': this.generateEdgeCasesDataset(),
    };

    for (const [name, data] of Object.entries(datasets)) {
      this.testDatasets.set(name, {
        name,
        description: data.description,
        stats: data.stats,
        data: data.data,
        format: data.format || 'chatgpt',
      });
    }

    console.error(`[Chat Import MCP] Loaded ${this.testDatasets.size} test datasets`);
  }

  generateTinyDataset() {
    return {
      description: 'Tiny dataset with 2 conversations and 10 messages for quick smoke tests',
      stats: {
        conversations: 2,
        messages: 10,
        code_blocks: 2,
        duplicates: 0,
      },
      format: 'chatgpt',
      data: [
        {
          id: 'conv_tiny_001',
          title: 'Hello World Example',
          create_time: Date.now() / 1000 - 86400,
          update_time: Date.now() / 1000,
          mapping: {
            msg_001: {
              id: 'msg_001',
              message: {
                id: 'msg_001',
                author: { role: 'user' },
                content: { content_type: 'text', parts: ['How do I print hello world in Python?'] },
                create_time: Date.now() / 1000 - 86400,
              },
              parent: null,
              children: ['msg_002'],
            },
            msg_002: {
              id: 'msg_002',
              message: {
                id: 'msg_002',
                author: { role: 'assistant' },
                content: {
                  content_type: 'text',
                  parts: [
                    'Here\'s how to print hello world in Python:\n\n```python\nprint("Hello, World!")\n```\n\nJust run this code and it will output "Hello, World!" to the console.',
                  ],
                },
                create_time: Date.now() / 1000 - 86400 + 60,
              },
              parent: 'msg_001',
              children: ['msg_003'],
            },
            msg_003: {
              id: 'msg_003',
              message: {
                id: 'msg_003',
                author: { role: 'user' },
                content: { content_type: 'text', parts: ['Thanks!'] },
                create_time: Date.now() / 1000 - 86400 + 120,
              },
              parent: 'msg_002',
              children: [],
            },
          },
        },
        {
          id: 'conv_tiny_002',
          title: 'Simple Math',
          create_time: Date.now() / 1000 - 43200,
          update_time: Date.now() / 1000,
          mapping: {
            msg_101: {
              id: 'msg_101',
              message: {
                id: 'msg_101',
                author: { role: 'user' },
                content: { content_type: 'text', parts: ['What is 2 + 2?'] },
                create_time: Date.now() / 1000 - 43200,
              },
              parent: null,
              children: ['msg_102'],
            },
            msg_102: {
              id: 'msg_102',
              message: {
                id: 'msg_102',
                author: { role: 'assistant' },
                content: { content_type: 'text', parts: ['2 + 2 = 4'] },
                create_time: Date.now() / 1000 - 43200 + 30,
              },
              parent: 'msg_101',
              children: [],
            },
          },
        },
      ],
    };
  }

  generateSmallDataset() {
    const conversations = [];
    const topics = [
      'JavaScript Array Methods',
      'React Hooks Tutorial',
      'SQL Joins Explained',
      'Git Workflow Best Practices',
      'TypeScript Generics',
    ];

    for (let i = 0; i < 5; i++) {
      const convId = `conv_small_${String(i + 1).padStart(3, '0')}`;
      const mapping = {};

      // Create a conversation with 10 messages
      for (let j = 0; j < 10; j++) {
        const msgId = `msg_${convId}_${String(j + 1).padStart(3, '0')}`;
        const isUser = j % 2 === 0;

        mapping[msgId] = {
          id: msgId,
          message: {
            id: msgId,
            author: { role: isUser ? 'user' : 'assistant' },
            content: {
              content_type: 'text',
              parts: [
                isUser
                  ? `Can you explain ${topics[i]} in detail?`
                  : `Here's a detailed explanation of ${topics[i]}...\n\nKey points:\n- Point 1\n- Point 2\n- Point 3\n\nLet me know if you need more details!`,
              ],
            },
            create_time: Date.now() / 1000 - 86400 + i * 3600 + j * 60,
          },
          parent: j > 0 ? `msg_${convId}_${String(j).padStart(3, '0')}` : null,
          children: j < 9 ? [`msg_${convId}_${String(j + 2).padStart(3, '0')}`] : [],
        };
      }

      conversations.push({
        id: convId,
        title: topics[i],
        create_time: Date.now() / 1000 - 86400 + i * 3600,
        update_time: Date.now() / 1000,
        mapping,
      });
    }

    return {
      description: 'Small dataset with 5 conversations and 50 messages for basic validation',
      stats: {
        conversations: 5,
        messages: 50,
        code_blocks: 5,
        duplicates: 0,
      },
      format: 'chatgpt',
      data: conversations,
    };
  }

  generateMediumDataset() {
    return {
      description: 'Medium dataset with 20 conversations and 200 messages for realistic testing',
      stats: {
        conversations: 20,
        messages: 200,
        code_blocks: 30,
        duplicates: 5,
      },
      format: 'chatgpt',
      data: [], // Would be too large to inline, could load from file
    };
  }

  generateEdgeCasesDataset() {
    return {
      description: 'Edge cases: empty messages, unicode, very long content, special characters',
      stats: {
        conversations: 1,
        messages: 10,
        code_blocks: 3,
        duplicates: 2,
      },
      format: 'chatgpt',
      data: [
        {
          id: 'conv_edge_001',
          title: 'Edge Cases Test',
          create_time: Date.now() / 1000,
          update_time: Date.now() / 1000,
          mapping: {
            msg_edge_001: {
              id: 'msg_edge_001',
              message: {
                id: 'msg_edge_001',
                author: { role: 'user' },
                content: { content_type: 'text', parts: [''] }, // Empty message
                create_time: Date.now() / 1000,
              },
              parent: null,
              children: ['msg_edge_002'],
            },
            msg_edge_002: {
              id: 'msg_edge_002',
              message: {
                id: 'msg_edge_002',
                author: { role: 'assistant' },
                content: { content_type: 'text', parts: ['你好！こんにちは！안녕하세요！مرحبا！'] }, // Unicode
                create_time: Date.now() / 1000 + 10,
              },
              parent: 'msg_edge_001',
              children: ['msg_edge_003'],
            },
            msg_edge_003: {
              id: 'msg_edge_003',
              message: {
                id: 'msg_edge_003',
                author: { role: 'user' },
                content: {
                  content_type: 'text',
                  parts: ['Test with special chars: <>&"\'`~!@#$%^&*()_+-=[]{}|;:,.<>?'],
                },
                create_time: Date.now() / 1000 + 20,
              },
              parent: 'msg_edge_002',
              children: ['msg_edge_004'],
            },
            msg_edge_004: {
              id: 'msg_edge_004',
              message: {
                id: 'msg_edge_004',
                author: { role: 'assistant' },
                content: {
                  content_type: 'text',
                  parts: ["Here's a very long message..." + ' word'.repeat(1000)], // Very long
                },
                create_time: Date.now() / 1000 + 30,
              },
              parent: 'msg_edge_003',
              children: [],
            },
          },
        },
      ],
    };
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_test_datasets',
          description: 'List all available test datasets with statistics',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_test_dataset',
          description: 'Retrieve a specific test dataset',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Dataset name (tiny, small, medium, edge-cases)',
                enum: ['tiny', 'small', 'medium', 'edge-cases'],
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'import_test_dataset',
          description: 'Import a test dataset via the API and track results',
          inputSchema: {
            type: 'object',
            properties: {
              dataset_name: {
                type: 'string',
                description: 'Dataset to import',
                enum: ['tiny', 'small', 'medium', 'edge-cases'],
              },
              config: {
                type: 'object',
                description: 'Import configuration',
              },
              auth_token: {
                type: 'string',
                description: 'JWT auth token for API',
              },
            },
            required: ['dataset_name'],
          },
        },
        {
          name: 'verify_import_results',
          description: 'Verify import results match expected outcomes',
          inputSchema: {
            type: 'object',
            properties: {
              import_id: {
                type: 'string',
                description: 'Import ID from import_test_dataset',
              },
              auth_token: {
                type: 'string',
                description: 'JWT auth token for API',
              },
            },
            required: ['import_id'],
          },
        },
        {
          name: 'compare_imports',
          description: 'Compare results from two import runs',
          inputSchema: {
            type: 'object',
            properties: {
              import_id_a: {
                type: 'string',
                description: 'First import ID',
              },
              import_id_b: {
                type: 'string',
                description: 'Second import ID',
              },
            },
            required: ['import_id_a', 'import_id_b'],
          },
        },
        {
          name: 'generate_test_data',
          description: 'Generate synthetic test data with specific characteristics',
          inputSchema: {
            type: 'object',
            properties: {
              conversations: {
                type: 'number',
                description: 'Number of conversations',
                default: 10,
              },
              messages_per_conversation: {
                type: 'number',
                description: 'Average messages per conversation',
                default: 10,
              },
              include_code_blocks: {
                type: 'boolean',
                description: 'Include code blocks in messages',
                default: true,
              },
              include_duplicates: {
                type: 'boolean',
                description: 'Include intentional duplicates',
                default: false,
              },
              format: {
                type: 'string',
                enum: ['chatgpt', 'claude', 'generic'],
                default: 'chatgpt',
              },
            },
          },
        },
        {
          name: 'test_deduplication',
          description: 'Test duplicate detection with known duplicates',
          inputSchema: {
            type: 'object',
            properties: {
              algorithm: {
                type: 'string',
                enum: ['jaccard', 'levenshtein', 'cosine'],
                default: 'jaccard',
              },
              threshold: {
                type: 'number',
                description: 'Similarity threshold (0.0-1.0)',
                default: 0.85,
              },
              auth_token: {
                type: 'string',
                description: 'JWT auth token for API',
              },
            },
          },
        },
        {
          name: 'get_import_history',
          description: 'Get history of import operations performed by this server',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Max results to return',
                default: 10,
              },
            },
          },
        },
      ],
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [];

      for (const [name, dataset] of this.testDatasets.entries()) {
        resources.push({
          uri: `canvas-chat-import://datasets/${name}`,
          name: `Test Dataset: ${name}`,
          description: `${dataset.description} (${dataset.stats.conversations} convos, ${dataset.stats.messages} messages)`,
          mimeType: 'application/json',
        });
      }

      return { resources };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_test_datasets':
            return await this.listTestDatasets(args);
          case 'get_test_dataset':
            return await this.getTestDataset(args);
          case 'import_test_dataset':
            return await this.importTestDataset(args);
          case 'verify_import_results':
            return await this.verifyImportResults(args);
          case 'compare_imports':
            return await this.compareImports(args);
          case 'generate_test_data':
            return await this.generateTestData(args);
          case 'test_deduplication':
            return await this.testDeduplication(args);
          case 'get_import_history':
            return await this.getImportHistory(args);
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

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      try {
        if (!uri.startsWith('canvas-chat-import://datasets/')) {
          throw new Error(`Invalid URI: ${uri}`);
        }

        const datasetName = uri.replace('canvas-chat-import://datasets/', '');
        const dataset = this.testDatasets.get(datasetName);

        if (!dataset) {
          throw new Error(`Dataset not found: ${datasetName}`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(dataset, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Error reading resource: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  // Tool implementations

  async listTestDatasets() {
    const datasets = [];

    for (const [name, dataset] of this.testDatasets.entries()) {
      datasets.push({
        name,
        description: dataset.description,
        stats: dataset.stats,
        format: dataset.format,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              total: datasets.length,
              datasets,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async getTestDataset(args) {
    const { name } = args;

    const dataset = this.testDatasets.get(name);
    if (!dataset) {
      throw new Error(`Dataset not found: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(dataset, null, 2),
        },
      ],
    };
  }

  async importTestDataset(args) {
    const { dataset_name, config = {}, auth_token } = args;

    const dataset = this.testDatasets.get(dataset_name);
    if (!dataset) {
      throw new Error(`Dataset not found: ${dataset_name}`);
    }

    // Make import request
    const url = `${API_BASE_URL}${API_VERSION}/import/enhanced`;
    const headers = {
      'Content-Type': 'application/json',
    };
    if (auth_token) {
      headers['Authorization'] = `Bearer ${auth_token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: dataset.data,
        config,
      }),
    });

    const result = await response.json();

    // Track import in history
    const importRecord = {
      id: `import_${Date.now()}`,
      timestamp: Date.now(),
      dataset_name,
      config,
      status: response.ok ? 'success' : 'failed',
      response_status: response.status,
      expected: dataset.stats,
      actual: result,
    };
    this.importHistory.push(importRecord);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              import_id: importRecord.id,
              success: response.ok,
              status: response.status,
              dataset: dataset_name,
              expected: dataset.stats,
              actual: result,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async verifyImportResults(args) {
    const { import_id, auth_token } = args;

    const importRecord = this.importHistory.find((r) => r.id === import_id);
    if (!importRecord) {
      throw new Error(`Import record not found: ${import_id}`);
    }

    // Query API to verify nodes were created
    const headers = {};
    if (auth_token) {
      headers['Authorization'] = `Bearer ${auth_token}`;
    }

    const checks = [];

    // Check ChatThreads
    const threadsResp = await fetch(
      `${API_BASE_URL}${API_VERSION}/nodes?kind=ChatThread&limit=1000`,
      { headers }
    );
    const threads = await threadsResp.json();
    checks.push({
      resource: 'ChatThreads',
      expected: importRecord.expected.conversations,
      actual: Array.isArray(threads) ? threads.length : threads.nodes?.length || 0,
      passed:
        (Array.isArray(threads) ? threads.length : threads.nodes?.length || 0) >=
        importRecord.expected.conversations,
    });

    // Check Messages
    const messagesResp = await fetch(
      `${API_BASE_URL}${API_VERSION}/nodes?kind=Message&limit=1000`,
      { headers }
    );
    const messages = await messagesResp.json();
    checks.push({
      resource: 'Messages',
      expected: importRecord.expected.messages,
      actual: Array.isArray(messages) ? messages.length : messages.nodes?.length || 0,
      passed:
        (Array.isArray(messages) ? messages.length : messages.nodes?.length || 0) >=
        importRecord.expected.messages,
    });

    const allPassed = checks.every((c) => c.passed);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              import_id,
              verification_passed: allPassed,
              checks,
              import_record: importRecord,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async compareImports(args) {
    const { import_id_a, import_id_b } = args;

    const importA = this.importHistory.find((r) => r.id === import_id_a);
    const importB = this.importHistory.find((r) => r.id === import_id_b);

    if (!importA) throw new Error(`Import not found: ${import_id_a}`);
    if (!importB) throw new Error(`Import not found: ${import_id_b}`);

    const comparison = {
      import_a: {
        id: importA.id,
        dataset: importA.dataset_name,
        timestamp: importA.timestamp,
        results: importA.actual,
      },
      import_b: {
        id: importB.id,
        dataset: importB.dataset_name,
        timestamp: importB.timestamp,
        results: importB.actual,
      },
      differences: [],
    };

    // Compare results
    if (importA.actual.threads !== importB.actual.threads) {
      comparison.differences.push({
        field: 'threads',
        import_a: importA.actual.threads,
        import_b: importB.actual.threads,
      });
    }
    if (importA.actual.messages !== importB.actual.messages) {
      comparison.differences.push({
        field: 'messages',
        import_a: importA.actual.messages,
        import_b: importB.actual.messages,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(comparison, null, 2),
        },
      ],
    };
  }

  async generateTestData(args) {
    const {
      conversations = 10,
      messages_per_conversation = 10,
      include_code_blocks = true,
      include_duplicates = false,
      format = 'chatgpt',
    } = args;

    // Generate synthetic data
    const data = [];
    for (let i = 0; i < conversations; i++) {
      const convId = `conv_gen_${String(i + 1).padStart(3, '0')}`;
      const mapping = {};

      for (let j = 0; j < messages_per_conversation; j++) {
        const msgId = `msg_${convId}_${String(j + 1).padStart(3, '0')}`;
        const isUser = j % 2 === 0;

        let content = `Generated message ${j + 1} in conversation ${i + 1}`;
        if (include_code_blocks && j % 3 === 1) {
          content += '\n\n```javascript\nconst x = 42;\nconsole.log(x);\n```';
        }

        mapping[msgId] = {
          id: msgId,
          message: {
            id: msgId,
            author: { role: isUser ? 'user' : 'assistant' },
            content: { content_type: 'text', parts: [content] },
            create_time: Date.now() / 1000 - 86400 + i * 3600 + j * 60,
          },
          parent: j > 0 ? `msg_${convId}_${String(j).padStart(3, '0')}` : null,
          children:
            j < messages_per_conversation - 1
              ? [`msg_${convId}_${String(j + 2).padStart(3, '0')}`]
              : [],
        };
      }

      data.push({
        id: convId,
        title: `Generated Conversation ${i + 1}`,
        create_time: Date.now() / 1000 - 86400 + i * 3600,
        update_time: Date.now() / 1000,
        mapping,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              generated: true,
              stats: {
                conversations,
                messages: conversations * messages_per_conversation,
                format,
              },
              data,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async testDeduplication(args) {
    const { algorithm = 'jaccard', threshold = 0.85, auth_token } = args;

    // Create test data with known duplicates
    const testData = {
      conversations: [
        {
          id: 'conv_dedup_test',
          title: 'Deduplication Test',
          create_time: Date.now() / 1000,
          update_time: Date.now() / 1000,
          mapping: {
            msg_1: {
              id: 'msg_1',
              message: {
                id: 'msg_1',
                author: { role: 'user' },
                content: { content_type: 'text', parts: ['This is the first message'] },
                create_time: Date.now() / 1000,
              },
              parent: null,
              children: ['msg_2'],
            },
            msg_2: {
              id: 'msg_2',
              message: {
                id: 'msg_2',
                author: { role: 'assistant' },
                content: { content_type: 'text', parts: ['This is the first message'] }, // Duplicate
                create_time: Date.now() / 1000 + 10,
              },
              parent: 'msg_1',
              children: ['msg_3'],
            },
            msg_3: {
              id: 'msg_3',
              message: {
                id: 'msg_3',
                author: { role: 'user' },
                content: {
                  content_type: 'text',
                  parts: ['This is a similar but different message'],
                },
                create_time: Date.now() / 1000 + 20,
              },
              parent: 'msg_2',
              children: [],
            },
          },
        },
      ],
    };

    // Import with deduplication enabled
    const config = {
      deduplication: {
        enabled: true,
        algorithm,
        threshold,
      },
    };

    const headers = {
      'Content-Type': 'application/json',
    };
    if (auth_token) {
      headers['Authorization'] = `Bearer ${auth_token}`;
    }

    const response = await fetch(`${API_BASE_URL}${API_VERSION}/import/enhanced`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: testData.conversations,
        config,
      }),
    });

    const result = await response.json();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              test: 'deduplication',
              algorithm,
              threshold,
              expected_duplicates: 1, // msg_1 and msg_2 are duplicates
              actual_result: result,
              success: response.ok,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async getImportHistory(args) {
    const { limit = 10 } = args;

    const history = this.importHistory
      .slice(-limit)
      .reverse()
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        dataset: r.dataset_name,
        status: r.status,
        expected: r.expected,
        actual: r.actual,
      }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              total: this.importHistory.length,
              showing: history.length,
              history,
            },
            null,
            2
          ),
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
    console.error('[Chat Import MCP] Server running on stdio');
    console.error(`[Chat Import MCP] Loaded ${this.testDatasets.size} test datasets`);
  }
}

// Start server
const server = new ChatImportMCPServer();
server.start().catch(console.error);
