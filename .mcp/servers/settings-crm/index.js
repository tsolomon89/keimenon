#!/usr/bin/env node

/**
 * Keimenon - Settings & CRM MCP Server
 *
 * Provides tools for managing settings, users, accounts, and CRM features.
 * Supports the new settings consolidation and user management features.
 *
 * Tools:
 * - list_users: List all users with filtering
 * - get_user_details: Get detailed information about a user
 * - list_accounts: List all accounts with stats
 * - get_account_details: Get detailed account information
 * - query_user_account_memberships: Query user-account relationships
 * - get_settings: Get settings by category or all settings
 * - search_settings: Search settings by key or value
 *
 * Resources:
 * - Users list with accounts
 * - Account hierarchy
 * - Settings registry
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
import { existsSync } from 'fs';

const DB_PATH = process.env.SQLITE_PATH || resolve(homedir(), '.keimenon', 'keimenon.db');

class SettingsCRMMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'keimenon-settings-crm',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.db = null;
    this.initDatabase();
    this.setupHandlers();

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
        process.exit(1);
      }

      this.db = new Database(DB_PATH, { readonly: true });
      console.error(`[Settings CRM MCP] Connected to database at: ${DB_PATH}`);
    } catch (error) {
      console.error(`[Settings CRM MCP] Failed to connect:`, error);
      process.exit(1);
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_users',
          description: 'List all users with optional filtering by account, status, or role',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: {
                type: 'string',
                description: 'Filter by account ID',
              },
              permission_level: {
                type: 'string',
                description: 'Filter by permission level',
                enum: ['super_admin', 'admin', 'senior', 'junior', 'viewer'],
              },
              limit: {
                type: 'number',
                description: 'Maximum results (default: 50)',
                default: 50,
              },
            },
          },
        },
        {
          name: 'get_user_details',
          description:
            'Get detailed information about a specific user including accounts and permissions',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: {
                type: 'string',
                description: 'User ID or email',
              },
            },
            required: ['user_id'],
          },
        },
        {
          name: 'list_accounts',
          description: 'List all accounts with statistics (node counts, user counts)',
          inputSchema: {
            type: 'object',
            properties: {
              account_class: {
                type: 'string',
                description: 'Filter by account class',
                enum: ['free', 'professional', 'business'],
              },
              account_type: {
                type: 'string',
                description: 'Filter by account type',
                enum: ['admin', 'client'],
              },
              include_stats: {
                type: 'boolean',
                description: 'Include statistics (node/user counts)',
                default: true,
              },
            },
          },
        },
        {
          name: 'get_account_details',
          description: 'Get detailed account information including members and nodes',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: {
                type: 'string',
                description: 'Account ID',
              },
            },
            required: ['account_id'],
          },
        },
        {
          name: 'query_user_account_memberships',
          description:
            'Query user-account relationships via graph nodes (UserNode <-> AccountNode)',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: {
                type: 'string',
                description: 'Filter by user ID',
              },
              account_id: {
                type: 'string',
                description: 'Filter by account ID',
              },
            },
          },
        },
        {
          name: 'get_settings',
          description: 'Get settings from the graph (if settings are stored as nodes)',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Settings category to filter by',
              },
            },
          },
        },
        {
          name: 'search_settings',
          description: 'Search settings by key or value pattern',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for settings key or value',
              },
            },
            required: ['query'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'keimenon-crm://users',
          name: 'Users Directory',
          description: 'List of all users with account memberships',
          mimeType: 'application/json',
        },
        {
          uri: 'keimenon-crm://accounts',
          name: 'Accounts Directory',
          description: 'List of all accounts with statistics',
          mimeType: 'application/json',
        },
        {
          uri: 'keimenon-crm://user-account-graph',
          name: 'User-Account Graph',
          description: 'Graph representation of user-account memberships',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_users':
            return await this.listUsers(args);
          case 'get_user_details':
            return await this.getUserDetails(args);
          case 'list_accounts':
            return await this.listAccounts(args);
          case 'get_account_details':
            return await this.getAccountDetails(args);
          case 'query_user_account_memberships':
            return await this.queryUserAccountMemberships(args);
          case 'get_settings':
            return await this.getSettings(args);
          case 'search_settings':
            return await this.searchSettings(args);
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

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      try {
        switch (uri) {
          case 'keimenon-crm://users':
            return await this.readUsersResource();
          case 'keimenon-crm://accounts':
            return await this.readAccountsResource();
          case 'keimenon-crm://user-account-graph':
            return await this.readUserAccountGraph();
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

  async listUsers(args) {
    const { account_id, permission_level, limit = 50 } = args;

    let query = `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.permission_level,
        u.account_id,
        u.created_at,
        u.last_login,
        a.name as account_name,
        a.account_class,
        a.account_type
      FROM users u
      LEFT JOIN accounts a ON u.account_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (account_id) {
      query += ' AND u.account_id = ?';
      params.push(account_id);
    }
    if (permission_level) {
      query += ' AND u.permission_level = ?';
      params.push(permission_level);
    }

    query += ' ORDER BY u.created_at DESC LIMIT ?';
    params.push(Math.min(limit, 100));

    const users = this.db.prepare(query).all(...params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: users.length,
              users: users,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async getUserDetails(args) {
    const { user_id } = args;

    // Try by ID or email
    const user = this.db
      .prepare(
        `
      SELECT
        u.*,
        a.name as account_name,
        a.account_class,
        a.account_type
      FROM users u
      LEFT JOIN accounts a ON u.account_id = a.id
      WHERE u.id = ? OR u.email = ?
    `
      )
      .get(user_id, user_id);

    if (!user) {
      throw new Error(`User not found: ${user_id}`);
    }

    // Get user's graph node if exists
    const userNode = this.db
      .prepare(
        `
      SELECT * FROM nodes WHERE kind = 'UserNode' AND json_extract(properties, '$.email') = ?
    `
      )
      .get(user.email);

    // Get account memberships via graph
    let memberships = [];
    if (userNode) {
      memberships = this.db
        .prepare(
          `
        SELECT
          e.id as edge_id,
          e.kind as edge_kind,
          e.properties as edge_properties,
          n.id as account_node_id,
          n.properties as account_node_properties
        FROM edges e
        JOIN nodes n ON e.to_id = n.id
        WHERE e.from_id = ? AND n.kind = 'AccountNode'
      `
        )
        .all(userNode.id);

      memberships = memberships.map((m) => ({
        ...m,
        edge_properties: m.edge_properties ? JSON.parse(m.edge_properties) : null,
        account_node_properties: JSON.parse(m.account_node_properties),
      }));
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              user: user,
              user_node: userNode
                ? { ...userNode, properties: JSON.parse(userNode.properties) }
                : null,
              memberships: memberships,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async listAccounts(args) {
    const { account_class, account_type, include_stats = true } = args;

    let query = 'SELECT * FROM accounts WHERE 1=1';
    const params = [];

    if (account_class) {
      query += ' AND account_class = ?';
      params.push(account_class);
    }
    if (account_type) {
      query += ' AND account_type = ?';
      params.push(account_type);
    }

    const accounts = this.db.prepare(query).all(...params);

    if (include_stats) {
      for (const account of accounts) {
        const stats = this.db
          .prepare(
            `
          SELECT
            (SELECT COUNT(*) FROM users WHERE account_id = ?) as user_count,
            (SELECT COUNT(*) FROM nodes WHERE account_id = ?) as node_count,
            (SELECT COUNT(*) FROM edges WHERE account_id = ?) as edge_count
        `
          )
          .get(account.id, account.id, account.id);

        account.stats = stats;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: accounts.length,
              accounts: accounts,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async getAccountDetails(args) {
    const { account_id } = args;

    const account = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account) {
      throw new Error(`Account not found: ${account_id}`);
    }

    // Get users
    const users = this.db
      .prepare('SELECT id, email, full_name, permission_level FROM users WHERE account_id = ?')
      .all(account_id);

    // Get AccountNode if exists
    const accountNode = this.db
      .prepare(
        `
      SELECT * FROM nodes WHERE kind = 'AccountNode' AND json_extract(properties, '$.sql_account_id') = ?
    `
      )
      .get(account_id);

    // Get stats
    const stats = this.db
      .prepare(
        `
      SELECT
        (SELECT COUNT(*) FROM nodes WHERE account_id = ?) as node_count,
        (SELECT COUNT(*) FROM edges WHERE account_id = ?) as edge_count,
        (SELECT COUNT(DISTINCT kind) FROM nodes WHERE account_id = ?) as node_types
    `
      )
      .get(account_id, account_id, account_id);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              account: account,
              account_node: accountNode
                ? { ...accountNode, properties: JSON.parse(accountNode.properties) }
                : null,
              users: users,
              stats: stats,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async queryUserAccountMemberships(args) {
    const { user_id, account_id } = args;

    let query = `
      SELECT
        e.id as edge_id,
        e.kind as edge_kind,
        e.properties as edge_properties,
        e.created_at as membership_created_at,
        user_node.id as user_node_id,
        user_node.properties as user_properties,
        acct_node.id as account_node_id,
        acct_node.properties as account_properties
      FROM edges e
      JOIN nodes user_node ON e.from_id = user_node.id
      JOIN nodes acct_node ON e.to_id = acct_node.id
      WHERE user_node.kind = 'UserNode'
        AND acct_node.kind = 'AccountNode'
        AND e.kind = 'ASSOCIATED_WITH_USER'
    `;
    const params = [];

    if (user_id) {
      query += ' AND user_node.id = ?';
      params.push(user_id);
    }
    if (account_id) {
      query += ' AND acct_node.id = ?';
      params.push(account_id);
    }

    const memberships = this.db.prepare(query).all(...params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: memberships.length,
              memberships: memberships.map((m) => ({
                ...m,
                user_properties: JSON.parse(m.user_properties),
                account_properties: JSON.parse(m.account_properties),
                edge_properties: m.edge_properties ? JSON.parse(m.edge_properties) : null,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async getSettings(args) {
    const { category } = args;

    // TODO: Implement when settings are stored in graph
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Settings retrieval from graph not yet implemented',
              category: category,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async searchSettings(args) {
    const { query } = args;

    // TODO: Implement when settings are stored in graph
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Settings search not yet implemented',
              query: query,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async readUsersResource() {
    const users = this.db
      .prepare(
        `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.permission_level,
        a.name as account_name
      FROM users u
      LEFT JOIN accounts a ON u.account_id = a.id
      ORDER BY u.created_at DESC
    `
      )
      .all();

    return {
      contents: [
        {
          uri: 'keimenon-crm://users',
          mimeType: 'application/json',
          text: JSON.stringify({ users }, null, 2),
        },
      ],
    };
  }

  async readAccountsResource() {
    const accounts = this.db.prepare('SELECT * FROM accounts').all();

    return {
      contents: [
        {
          uri: 'keimenon-crm://accounts',
          mimeType: 'application/json',
          text: JSON.stringify({ accounts }, null, 2),
        },
      ],
    };
  }

  async readUserAccountGraph() {
    const userNodes = this.db.prepare(`SELECT * FROM nodes WHERE kind = 'UserNode'`).all();
    const accountNodes = this.db.prepare(`SELECT * FROM nodes WHERE kind = 'AccountNode'`).all();
    const edges = this.db
      .prepare(
        `
      SELECT e.* FROM edges e
      JOIN nodes n1 ON e.from_id = n1.id
      JOIN nodes n2 ON e.to_id = n2.id
      WHERE n1.kind = 'UserNode' AND n2.kind = 'AccountNode'
    `
      )
      .all();

    return {
      contents: [
        {
          uri: 'keimenon-crm://user-account-graph',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              nodes: {
                users: userNodes.map((n) => ({ ...n, properties: JSON.parse(n.properties) })),
                accounts: accountNodes.map((n) => ({ ...n, properties: JSON.parse(n.properties) })),
              },
              edges: edges.map((e) => ({
                ...e,
                properties: e.properties ? JSON.parse(e.properties) : null,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async cleanup() {
    if (this.db) {
      this.db.close();
    }
    await this.server.close();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Settings CRM MCP] Server running on stdio');
  }
}

const server = new SettingsCRMMCPServer();
server.start().catch(console.error);
