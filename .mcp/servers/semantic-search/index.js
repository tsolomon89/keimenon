#!/usr/bin/env node

/**
 * Keimenon — Semantic Search MCP Server (Read-Only)
 *
 * Exposes the deterministic BM25 index, traversal engine, and provenance model
 * to AI agents through Model Context Protocol.
 *
 * This server is a thin JSON-RPC → HTTP adapter. It does NOT access the database
 * directly. All queries go through the local Keimenon API which enforces:
 * - JWT auth + session binding
 * - account isolation
 * - topic visibility policy (suggested/promoted/rejected)
 * - sequester policy
 * - provenance preservation
 *
 * Tools (read-only):
 * 1. search_user_corpus     — BM25-ranked search over SourceSpan nodes
 * 2. explain_connection     — Why two sources are connected
 * 3. traverse_topic_graph   — Localized graph traversal
 * 4. build_context_pack     — Deterministic context pack for agent consumption
 * 5. preview_unified_doc    — Deterministic markdown preview (no graph write)
 *
 * Required env:
 *   KEIMENON_API_URL     — e.g. http://localhost:3001
 *   KEIMENON_MCP_TOKEN   — JWT Bearer token (obtain via login API or CLI)
 *
 * Optional env:
 *   KEIMENON_ACCOUNT_ID  — override account (validated server-side)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = (process.env.KEIMENON_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const MCP_TOKEN = process.env.KEIMENON_MCP_TOKEN || '';
const ACCOUNT_ID_OVERRIDE = process.env.KEIMENON_ACCOUNT_ID || '';

// Safety defaults (match AGENTS.md conservative policy)
const DEFAULTS = Object.freeze({
  searchLimit: 20,
  searchMaxLimit: 25,
  searchMinScore: 0.01,
  traversalMaxHops: 2,
  traversalMaxHopsLimit: 3,
  contextPackMaxChars: 12000,
  contextPackMaxCharsLimit: 200000,
  includeSuggestedTopics: false,
  includeSequestered: false,
});

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

/**
 * Make an authenticated HTTP request to the Keimenon API.
 * Returns { ok, status, data } where data is parsed JSON or error text.
 */
async function apiRequest(method, path, { query, body } = {}) {
  let url = `${API_URL}/api/v1${path}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params.set(k, String(v));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (MCP_TOKEN) {
    headers['Authorization'] = `Bearer ${MCP_TOKEN}`;
  }

  if (ACCOUNT_ID_OVERRIDE) {
    headers['X-Account-Id'] = ACCOUNT_ID_OVERRIDE;
  }

  const fetchOpts = { method, headers };
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOpts.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, fetchOpts);
    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        error: 'API connection failed',
        message: error.message,
        url,
        hint: 'Ensure the Keimenon API server is running and KEIMENON_API_URL is correct.',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'search_user_corpus',
    description:
      "BM25-ranked search over the user's local knowledge corpus. Returns ranked SourceSpan nodes with score components, matched terms, source IDs, and provenance. Uses the same deterministic inverted index as the human UI.",
    inputSchema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query string (1–500 chars)',
        },
        limit: {
          type: 'number',
          description: `Max results (default ${DEFAULTS.searchLimit}, max ${DEFAULTS.searchMaxLimit})`,
          default: DEFAULTS.searchLimit,
        },
        minScore: {
          type: 'number',
          description: 'Minimum BM25 score threshold (default 0.01)',
          default: DEFAULTS.searchMinScore,
        },
        explain: {
          type: 'boolean',
          description: 'Include BM25 score component breakdown (default true)',
          default: true,
        },
      },
      required: ['q'],
    },
  },
  {
    name: 'explain_connection',
    description:
      'Explain why two sources are semantically connected. Returns shared phrases, co-occurrence evidence, promoted topic paths, and provenance. Uses the same graph model as the human UI.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceA: {
          type: 'string',
          description: 'First source node ID',
        },
        sourceB: {
          type: 'string',
          description: 'Second source node ID',
        },
      },
      required: ['sourceA', 'sourceB'],
    },
  },
  {
    name: 'traverse_topic_graph',
    description:
      'Perform a localized graph traversal starting from specific nodes. Discovers related topics, sources, and phrases within the configured hop depth. Respects topic lifecycle (suggested topics hidden by default, rejected topics always excluded). Conservative defaults: maxHops=2, includeSuggestedTopics=false.',
    inputSchema: {
      type: 'object',
      properties: {
        rootNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Starting node IDs for traversal (1–100)',
          minItems: 1,
          maxItems: 100,
        },
        maxHops: {
          type: 'number',
          description: `Max traversal depth (default ${DEFAULTS.traversalMaxHops}, max ${DEFAULTS.traversalMaxHopsLimit})`,
          default: DEFAULTS.traversalMaxHops,
        },
        expansionStrategy: {
          type: 'string',
          description: 'How to expand from each node',
          enum: ['phrase', 'topic', 'source_overlap', 'bm25', 'provenance', 'mixed'],
          default: 'mixed',
        },
        includeSuggestedTopics: {
          type: 'boolean',
          description: 'Include topics with status=suggested (default false)',
          default: false,
        },
        includeSequestered: {
          type: 'boolean',
          description: 'Include sequestered nodes (default false)',
          default: false,
        },
        minEdgeWeight: {
          type: 'number',
          description: 'Minimum edge weight threshold (0–1, default 0)',
          default: 0,
        },
      },
      required: ['rootNodeIds'],
    },
  },
  {
    name: 'build_context_pack',
    description:
      'Build a deterministic ContextPack from a traversal. Returns ranked snippets/spans with provenance and budget info. The ContextPack is not persisted — it is a transient read artifact for agent consumption.',
    inputSchema: {
      type: 'object',
      properties: {
        rootNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Starting node IDs for context gathering (1–100)',
          minItems: 1,
          maxItems: 100,
        },
        maxHops: {
          type: 'number',
          description: `Max traversal depth (default ${DEFAULTS.traversalMaxHops}, max ${DEFAULTS.traversalMaxHopsLimit})`,
          default: DEFAULTS.traversalMaxHops,
        },
        maxChars: {
          type: 'number',
          description: `Max chars in context pack (default ${DEFAULTS.contextPackMaxChars}, max ${DEFAULTS.contextPackMaxCharsLimit})`,
          default: DEFAULTS.contextPackMaxChars,
        },
        includeSuggestedTopics: {
          type: 'boolean',
          description: 'Include topics with status=suggested (default false)',
          default: false,
        },
        includeSequestered: {
          type: 'boolean',
          description: 'Include sequestered nodes (default false)',
          default: false,
        },
        expansionStrategy: {
          type: 'string',
          description: 'How to expand from each node',
          enum: ['phrase', 'topic', 'source_overlap', 'bm25', 'provenance', 'mixed'],
          default: 'mixed',
        },
      },
      required: ['rootNodeIds'],
    },
  },
  {
    name: 'preview_unified_doc',
    description:
      'Generate a deterministic markdown preview from a traversal. Does NOT write to the graph — this is a read-only preview. The preview includes provenance links back to raw sources.',
    inputSchema: {
      type: 'object',
      properties: {
        rootNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Starting node IDs for document synthesis (1–100)',
          minItems: 1,
          maxItems: 100,
        },
        maxHops: {
          type: 'number',
          description: `Max traversal depth (default ${DEFAULTS.traversalMaxHops}, max ${DEFAULTS.traversalMaxHopsLimit})`,
          default: DEFAULTS.traversalMaxHops,
        },
        maxChars: {
          type: 'number',
          description: `Max chars in unified document (default ${DEFAULTS.contextPackMaxChars}, max ${DEFAULTS.contextPackMaxCharsLimit})`,
          default: DEFAULTS.contextPackMaxChars,
        },
        includeSuggestedTopics: {
          type: 'boolean',
          description: 'Include topics with status=suggested (default false)',
          default: false,
        },
      },
      required: ['rootNodeIds'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

async function handleSearchUserCorpus(args) {
  const q = args.q;
  if (!q || typeof q !== 'string' || q.length === 0) {
    return errorResult('Parameter "q" is required and must be a non-empty string.');
  }
  if (q.length > 500) {
    return errorResult('Parameter "q" must be at most 500 characters.');
  }

  const limit = clamp(args.limit ?? DEFAULTS.searchLimit, 1, DEFAULTS.searchMaxLimit);
  const minScore = clamp(args.minScore ?? DEFAULTS.searchMinScore, 0, 100);
  const explain = args.explain !== false; // default true

  const result = await apiRequest('GET', '/search/query', {
    query: { q, limit, minScore, explain },
  });

  if (!result.ok) {
    return apiErrorResult('search_user_corpus', result);
  }

  return successResult(result.data);
}

async function handleExplainConnection(args) {
  const { sourceA, sourceB } = args;
  if (!sourceA || !sourceB) {
    return errorResult('Parameters "sourceA" and "sourceB" are required.');
  }

  const result = await apiRequest('GET', '/search/explain-connection', {
    query: { sourceA, sourceB },
  });

  if (!result.ok) {
    return apiErrorResult('explain_connection', result);
  }

  return successResult(result.data);
}

async function handleTraverseTopicGraph(args) {
  const rootNodeIds = args.rootNodeIds;
  if (!Array.isArray(rootNodeIds) || rootNodeIds.length === 0) {
    return errorResult('Parameter "rootNodeIds" must be a non-empty array of strings.');
  }
  if (rootNodeIds.length > 100) {
    return errorResult('Parameter "rootNodeIds" must contain at most 100 entries.');
  }

  const plan = {
    rootNodeIds,
    maxHops: clamp(args.maxHops ?? DEFAULTS.traversalMaxHops, 0, DEFAULTS.traversalMaxHopsLimit),
    expansionStrategy: args.expansionStrategy || 'mixed',
    includeSuggestedTopics: args.includeSuggestedTopics ?? DEFAULTS.includeSuggestedTopics,
    includeSequestered: args.includeSequestered ?? DEFAULTS.includeSequestered,
    minEdgeWeight: clamp(args.minEdgeWeight ?? 0, 0, 1),
  };

  const result = await apiRequest('POST', '/spine/traverse', { body: { plan } });

  if (!result.ok) {
    return apiErrorResult('traverse_topic_graph', result);
  }

  return successResult(result.data);
}

async function handleBuildContextPack(args) {
  const rootNodeIds = args.rootNodeIds;
  if (!Array.isArray(rootNodeIds) || rootNodeIds.length === 0) {
    return errorResult('Parameter "rootNodeIds" must be a non-empty array of strings.');
  }
  if (rootNodeIds.length > 100) {
    return errorResult('Parameter "rootNodeIds" must contain at most 100 entries.');
  }

  const plan = {
    rootNodeIds,
    maxHops: clamp(args.maxHops ?? DEFAULTS.traversalMaxHops, 0, DEFAULTS.traversalMaxHopsLimit),
    maxChars: clamp(
      args.maxChars ?? DEFAULTS.contextPackMaxChars,
      256,
      DEFAULTS.contextPackMaxCharsLimit
    ),
    includeSuggestedTopics: args.includeSuggestedTopics ?? DEFAULTS.includeSuggestedTopics,
    includeSequestered: args.includeSequestered ?? DEFAULTS.includeSequestered,
    expansionStrategy: args.expansionStrategy || 'mixed',
    outputMode: 'context_pack',
  };

  const result = await apiRequest('POST', '/spine/context-pack', { body: { plan } });

  if (!result.ok) {
    return apiErrorResult('build_context_pack', result);
  }

  return successResult(result.data);
}

async function handlePreviewUnifiedDoc(args) {
  const rootNodeIds = args.rootNodeIds;
  if (!Array.isArray(rootNodeIds) || rootNodeIds.length === 0) {
    return errorResult('Parameter "rootNodeIds" must be a non-empty array of strings.');
  }
  if (rootNodeIds.length > 100) {
    return errorResult('Parameter "rootNodeIds" must contain at most 100 entries.');
  }

  const plan = {
    rootNodeIds,
    maxHops: clamp(args.maxHops ?? DEFAULTS.traversalMaxHops, 0, DEFAULTS.traversalMaxHopsLimit),
    maxChars: clamp(
      args.maxChars ?? DEFAULTS.contextPackMaxChars,
      256,
      DEFAULTS.contextPackMaxCharsLimit
    ),
    includeSuggestedTopics: args.includeSuggestedTopics ?? DEFAULTS.includeSuggestedTopics,
    outputMode: 'unified_doc',
    includeRawContent: 'snippets',
  };

  const result = await apiRequest('POST', '/spine/unified-doc', { body: { plan } });

  if (!result.ok) {
    return apiErrorResult('preview_unified_doc', result);
  }

  return successResult(result.data);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  if (typeof value !== 'number' || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function successResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    isError: true,
  };
}

function apiErrorResult(toolName, result) {
  const isAuthError = result.status === 401 || result.status === 403;
  const isConnectionError = result.status === 0;

  let diagnostic;
  if (isConnectionError) {
    diagnostic = {
      error: 'API connection failed',
      tool: toolName,
      apiUrl: API_URL,
      hint: 'Ensure the Keimenon API server is running and KEIMENON_API_URL is correct.',
      details: result.data,
    };
  } else if (isAuthError) {
    diagnostic = {
      error: 'Authentication failed',
      tool: toolName,
      status: result.status,
      hint: 'Ensure KEIMENON_MCP_TOKEN is a valid JWT token. Obtain one via the login API.',
      tokenConfigured: !!MCP_TOKEN,
      details: result.data,
    };
  } else {
    diagnostic = {
      error: `API returned ${result.status}`,
      tool: toolName,
      status: result.status,
      details: result.data,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(diagnostic, null, 2),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

class SemanticSearchMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'keimenon-semantic-search-read',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();

    this.server.onerror = (error) => console.error('[SemanticSearch MCP] Error:', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    // tools/list — return all 5 read-only tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // tools/call — dispatch to handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Validate token is configured before any API call
      if (!MCP_TOKEN) {
        return errorResult(
          'KEIMENON_MCP_TOKEN is not configured. ' +
            'Set this environment variable to a valid JWT token obtained from the Keimenon login API.'
        );
      }

      try {
        switch (name) {
          case 'search_user_corpus':
            return await handleSearchUserCorpus(args || {});
          case 'explain_connection':
            return await handleExplainConnection(args || {});
          case 'traverse_topic_graph':
            return await handleTraverseTopicGraph(args || {});
          case 'build_context_pack':
            return await handleBuildContextPack(args || {});
          case 'preview_unified_doc':
            return await handlePreviewUnifiedDoc(args || {});
          default:
            return errorResult(`Unknown tool: ${name}. This is a read-only server.`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Internal tool error',
                  tool: name,
                  message: error.message,
                  stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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

  async start() {
    // Startup diagnostics
    console.error('[SemanticSearch MCP] Read-only server starting');
    console.error(`[SemanticSearch MCP] API URL: ${API_URL}`);
    console.error(`[SemanticSearch MCP] Token configured: ${!!MCP_TOKEN}`);
    if (ACCOUNT_ID_OVERRIDE) {
      console.error(`[SemanticSearch MCP] Account override: ${ACCOUNT_ID_OVERRIDE}`);
    }
    console.error(`[SemanticSearch MCP] Tools: ${TOOLS.map((t) => t.name).join(', ')}`);
    console.error(
      `[SemanticSearch MCP] Safety defaults: maxHops=${DEFAULTS.traversalMaxHops}, limit=${DEFAULTS.searchMaxLimit}, includeSuggested=false`
    );

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[SemanticSearch MCP] Server running on stdio');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const server = new SemanticSearchMCPServer();
server.start().catch((error) => {
  console.error('[SemanticSearch MCP] Fatal startup error:', error);
  process.exit(1);
});
