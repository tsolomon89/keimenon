#!/usr/bin/env node

/**
 * Keimenon - Database MCP Server
 *
 * Provides tools for querying and inspecting the local SQLite database.
 * This server enables AI assistants to interact with the database safely.
 *
 * Tools:
 * - query_nodes: Search nodes by type, account, date range
 * - query_edges: Find edges by kind, direction
 * - inspect_schema: View table schemas and indexes
 * - get_stats: Database statistics and health metrics
 * - seed_test_data: Create test data for development
 *
 * Resources:
 * - schema: Current database schema
 * - migrations: Migration history
 * - health: Database health metrics
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';

// Database path (default to user's home directory)
const DB_PATH = process.env.SQLITE_PATH || resolve(homedir(), '.keimenon', 'keimenon.db');

class DatabaseMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'keimenon-database',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Initialize database connection
    this.db = null;
    this.initDatabase();

    // Setup request handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  initDatabase() {
    try {
      if (!existsSync(DB_PATH)) {
        console.error(`Database not found at: ${DB_PATH}`);
        console.error(
          'Please ensure the API server has been started at least once to initialize the database.'
        );
        process.exit(1);
      }

      this.db = new Database(DB_PATH, { readonly: true });
      console.error(`[Database MCP] Connected to database at: ${DB_PATH}`);
    } catch (error) {
      console.error(`[Database MCP] Failed to connect to database:`, error);
      process.exit(1);
    }
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'query_nodes',
          description:
            'Query nodes from the database with filters (kind, account_id, date range, limit)',
          inputSchema: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                description: 'Node kind to filter',
                enum: [
                  'UploadItem',
                  'Chat',
                  'MessageRef',
                  'Source',
                  'Group',
                  'CodeBlock',
                  'Folder',
                  'ChatThread',
                  'Message',
                  'ObjectiveClaim',
                  'UnifiedDoc',
                  'Constellation',
                  'UserNode',
                  'AccountNode',
                  'Board',
                ],
              },
              account_id: {
                type: 'string',
                description: 'Filter by account ID',
              },
              created_after: {
                type: 'number',
                description: 'Unix timestamp (ms) - only nodes created after this time',
              },
              created_before: {
                type: 'number',
                description: 'Unix timestamp (ms) - only nodes created before this time',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 50, max: 1000)',
                default: 50,
              },
              data_tag: {
                type: 'string',
                description: 'Filter by data tag (test, real, automated, manual)',
                enum: ['test', 'real', 'automated', 'manual'],
              },
            },
          },
        },
        {
          name: 'query_edges',
          description: 'Query edges from the database with filters (kind, from/to node, limit)',
          inputSchema: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                description: 'Edge kind to filter',
                enum: [
                  'CONTAINS',
                  'DERIVES_FROM',
                  'EXTRACTED_FROM',
                  'SIMILAR_TO',
                  'SEQUESTERS',
                  'HAS_MESSAGE',
                  'COMPILED_FROM',
                  'STITCHED_FROM',
                  'IN_SCOPE_FOR',
                  'EQUIVALENT_TO',
                  'DUP_OF',
                  'SUPPORTS',
                  'REFUTES',
                  'VERIFIED_BY',
                  'ASSOCIATED_WITH_USER',
                  'PROMOTES_TO_GROUP',
                  'FOLDS_INTO_FOLDER',
                  'IN_GROUP',
                  'AFFINITY',
                  'DISCOURSE',
                ],
              },
              from_id: {
                type: 'string',
                description: 'Filter by source node ID',
              },
              to_id: {
                type: 'string',
                description: 'Filter by target node ID',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 50, max: 1000)',
                default: 50,
              },
            },
          },
        },
        {
          name: 'inspect_schema',
          description: 'View database schema including tables, columns, indexes, and foreign keys',
          inputSchema: {
            type: 'object',
            properties: {
              table_name: {
                type: 'string',
                description: 'Specific table to inspect (optional - returns all tables if omitted)',
              },
            },
          },
        },
        {
          name: 'get_stats',
          description:
            'Get database statistics including node counts by type, edge counts, storage size',
          inputSchema: {
            type: 'object',
            properties: {
              detailed: {
                type: 'boolean',
                description: 'Include detailed statistics per account',
                default: false,
              },
            },
          },
        },
        {
          name: 'search_content',
          description: 'Full-text search across node content using FTS5',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (supports FTS5 syntax)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 20, max: 100)',
                default: 20,
              },
            },
            required: ['query'],
          },
        },
      ],
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'keimenon-db://schema',
          name: 'Database Schema',
          description: 'Current SQLite database schema with all tables and indexes',
          mimeType: 'text/plain',
        },
        {
          uri: 'keimenon-db://health',
          name: 'Database Health',
          description: 'Database health metrics and connection status',
          mimeType: 'application/json',
        },
        {
          uri: 'keimenon-db://stats',
          name: 'Database Statistics',
          description: 'Node and edge counts, storage size',
          mimeType: 'application/json',
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'query_nodes':
            return await this.queryNodes(args);
          case 'query_edges':
            return await this.queryEdges(args);
          case 'inspect_schema':
            return await this.inspectSchema(args);
          case 'get_stats':
            return await this.getStats(args);
          case 'search_content':
            return await this.searchContent(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`,
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
        switch (uri) {
          case 'keimenon-db://schema':
            return await this.readSchema();
          case 'keimenon-db://health':
            return await this.readHealth();
          case 'keimenon-db://stats':
            return await this.readStats();
          default:
            throw new Error(`Unknown resource: ${uri}`);
        }
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
  async queryNodes(args) {
    const { kind, account_id, created_after, created_before, limit = 50, data_tag } = args;
    const maxLimit = Math.min(limit, 1000);

    let query =
      'SELECT id, kind, properties, account_id, created_by, created_at, updated_at, data_tag FROM nodes WHERE 1=1';
    const params = [];

    if (kind) {
      query += ' AND kind = ?';
      params.push(kind);
    }
    if (account_id) {
      query += ' AND account_id = ?';
      params.push(account_id);
    }
    if (created_after) {
      query += ' AND created_at >= ?';
      params.push(created_after);
    }
    if (created_before) {
      query += ' AND created_at <= ?';
      params.push(created_before);
    }
    if (data_tag) {
      query += ' AND data_tag = ?';
      params.push(data_tag);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(maxLimit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    // Parse JSON properties
    const nodes = rows.map((row) => ({
      ...row,
      properties: JSON.parse(row.properties),
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: nodes.length,
              nodes: nodes,
              query_params: {
                kind,
                account_id,
                created_after,
                created_before,
                limit: maxLimit,
                data_tag,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async queryEdges(args) {
    const { kind, from_id, to_id, limit = 50 } = args;
    const maxLimit = Math.min(limit, 1000);

    let query = 'SELECT id, kind, from_id, to_id, properties, created_at FROM edges WHERE 1=1';
    const params = [];

    if (kind) {
      query += ' AND kind = ?';
      params.push(kind);
    }
    if (from_id) {
      query += ' AND from_id = ?';
      params.push(from_id);
    }
    if (to_id) {
      query += ' AND to_id = ?';
      params.push(to_id);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(maxLimit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    // Parse JSON properties (may be null)
    const edges = rows.map((row) => ({
      ...row,
      properties: row.properties ? JSON.parse(row.properties) : null,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: edges.length,
              edges: edges,
              query_params: { kind, from_id, to_id, limit: maxLimit },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async inspectSchema(args) {
    const { table_name } = args;

    if (table_name) {
      // Get schema for specific table
      const tableInfo = this.db.pragma(`table_info(${table_name})`);
      const indexes = this.db.pragma(`index_list(${table_name})`);
      const foreignKeys = this.db.pragma(`foreign_key_list(${table_name})`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                table: table_name,
                columns: tableInfo,
                indexes: indexes,
                foreign_keys: foreignKeys,
              },
              null,
              2
            ),
          },
        ],
      };
    } else {
      // Get all tables
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all();

      const schema = {};
      for (const { name } of tables) {
        schema[name] = {
          columns: this.db.pragma(`table_info(${name})`),
          indexes: this.db.pragma(`index_list(${name})`),
          foreign_keys: this.db.pragma(`foreign_key_list(${name})`),
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    }
  }

  async getStats(args) {
    const { detailed = false } = args;

    // Basic stats
    const nodesByKind = this.db
      .prepare('SELECT kind, COUNT(*) as count FROM nodes GROUP BY kind')
      .all();
    const edgesByKind = this.db
      .prepare('SELECT kind, COUNT(*) as count FROM edges GROUP BY kind')
      .all();
    const totalNodes = this.db.prepare('SELECT COUNT(*) as count FROM nodes').get();
    const totalEdges = this.db.prepare('SELECT COUNT(*) as count FROM edges').get();

    // Account stats (if detailed)
    let accountStats = null;
    if (detailed) {
      accountStats = this.db
        .prepare(
          `
        SELECT
          a.id,
          a.name,
          a.account_class,
          a.account_type,
          COUNT(DISTINCT n.id) as node_count,
          COUNT(DISTINCT ua.user_id) as user_count
        FROM accounts a
        LEFT JOIN nodes n ON n.account_id = a.id
        LEFT JOIN user_accounts ua ON ua.account_id = a.id
        GROUP BY a.id
      `
        )
        .all();
    }

    const stats = {
      total_nodes: totalNodes.count,
      total_edges: totalEdges.count,
      nodes_by_kind: Object.fromEntries(nodesByKind.map((row) => [row.kind, row.count])),
      edges_by_kind: Object.fromEntries(edgesByKind.map((row) => [row.kind, row.count])),
    };

    if (detailed && accountStats) {
      stats.accounts = accountStats;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  async searchContent(args) {
    const { query, limit = 20 } = args;
    const maxLimit = Math.min(limit, 100);

    try {
      // Check if FTS table exists
      const ftsExists = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'")
        .get();

      if (!ftsExists) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Full-text search table (nodes_fts) not found. FTS5 may not be enabled.',
                  suggestion: 'Check database migrations and ensure FTS5 is configured.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const stmt = this.db.prepare(`
        SELECT n.id, n.kind, n.properties, n.created_at, rank
        FROM nodes_fts fts
        JOIN nodes n ON fts.id = n.id
        WHERE nodes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const rows = stmt.all(query, maxLimit);

      const results = rows.map((row) => ({
        ...row,
        properties: JSON.parse(row.properties),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                count: results.length,
                query: query,
                results: results,
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
                error: error.message,
                query: query,
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

  // Resource readers
  async readSchema() {
    const schema = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();

    return {
      contents: [
        {
          uri: 'keimenon-db://schema',
          mimeType: 'text/plain',
          text: schema.map((row) => row.sql).join('\n\n'),
        },
      ],
    };
  }

  async readHealth() {
    const health = {
      status: 'healthy',
      database_path: DB_PATH,
      readable: true,
      writable: false, // Read-only mode
      connection: 'active',
      wal_mode: this.db.pragma('journal_mode', { simple: true }),
      page_count: this.db.pragma('page_count', { simple: true }),
      page_size: this.db.pragma('page_size', { simple: true }),
      integrity_check: this.db.pragma('integrity_check', { simple: true }),
    };

    return {
      contents: [
        {
          uri: 'keimenon-db://health',
          mimeType: 'application/json',
          text: JSON.stringify(health, null, 2),
        },
      ],
    };
  }

  async readStats() {
    const stats = await this.getStats({ detailed: true });
    return {
      contents: [
        {
          uri: 'keimenon-db://stats',
          mimeType: 'application/json',
          text: stats.content[0].text,
        },
      ],
    };
  }

  async cleanup() {
    if (this.db) {
      this.db.close();
      console.error('[Database MCP] Database connection closed');
    }
    await this.server.close();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Database MCP] Server running on stdio');
  }
}

// Start server
const server = new DatabaseMCPServer();
server.start().catch(console.error);
