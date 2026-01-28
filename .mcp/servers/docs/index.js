#!/usr/bin/env node

/**
 * Keimenon - Documentation MCP Server
 *
 * Provides tools for searching and navigating project documentation.
 * Enables AI assistants to find relevant docs, TODOs, and architecture info.
 *
 * Tools:
 * - search_docs: Full-text search across all markdown files
 * - find_related: Find related documentation by topic
 * - list_todos: Extract TODO/FIXME/HACK comments from code
 * - get_architecture_info: Query architecture decisions
 *
 * Resources:
 * - All markdown files in docs/, ai_context/
 * - README.md, CLAUDE.md
 * - Architecture diagrams
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project root (3 levels up from .mcp/servers/docs)
const PROJECT_ROOT = resolve(__dirname, '../../..');

class DocsMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'keimenon-docs',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Cache for documentation files
    this.docsCache = new Map();
    this.indexDocs();

    // Setup request handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Index all markdown files in the project
   */
  indexDocs() {
    const docDirs = [
      'docs',
      'ai_context',
      '.', // Root for README.md, CLAUDE.md
    ];

    let totalFiles = 0;

    for (const dir of docDirs) {
      const fullPath = join(PROJECT_ROOT, dir);
      if (!existsSync(fullPath)) continue;

      const files = this.walkDir(fullPath, '.md');
      for (const filePath of files) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const relativePath = relative(PROJECT_ROOT, filePath);
          this.docsCache.set(relativePath, {
            path: relativePath,
            fullPath: filePath,
            content: content,
            size: content.length,
            lines: content.split('\n').length,
          });
          totalFiles++;
        } catch (error) {
          console.error(`Failed to read ${filePath}:`, error.message);
        }
      }
    }

    console.error(`[Docs MCP] Indexed ${totalFiles} documentation files`);
  }

  /**
   * Recursively walk directory and find files with extension
   */
  walkDir(dir, ext) {
    const files = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        // Skip node_modules and hidden directories
        if (entry === 'node_modules' || entry.startsWith('.')) continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...this.walkDir(fullPath, ext));
        } else if (stat.isFile() && fullPath.endsWith(ext)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore permission errors
    }

    return files;
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_docs',
          description: 'Full-text search across all markdown documentation files',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (case-insensitive)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10, max: 50)',
                default: 10,
              },
              context_lines: {
                type: 'number',
                description: 'Number of lines of context to show around matches (default: 3)',
                default: 3,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'find_related',
          description: 'Find documentation files related to a topic or file',
          inputSchema: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description:
                  'Topic to find related docs for (e.g., "authentication", "database", "API")',
              },
              file_path: {
                type: 'string',
                description: 'File path to find related docs for (alternative to topic)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10)',
                default: 10,
              },
            },
          },
        },
        {
          name: 'list_todos',
          description: 'Extract TODO, FIXME, HACK, NOTE comments from codebase',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Type of comment to search for',
                enum: ['TODO', 'FIXME', 'HACK', 'NOTE', 'BUG', 'XXX', 'all'],
                default: 'all',
              },
              path: {
                type: 'string',
                description:
                  'Specific directory or file to search (optional - searches all if omitted)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 50, max: 200)',
                default: 50,
              },
            },
          },
        },
        {
          name: 'get_architecture_info',
          description: 'Get specific architecture information from documentation',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Architecture category to query',
                enum: ['overview', 'database', 'api', 'authentication', 'features', 'all'],
                default: 'overview',
              },
            },
          },
        },
        {
          name: 'read_doc',
          description: 'Read a specific documentation file by path',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'Relative path to the documentation file (e.g., "docs/architecture/OVERVIEW.md")',
              },
            },
            required: ['path'],
          },
        },
      ],
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [];

      // Add all cached docs as resources
      for (const [path, doc] of this.docsCache.entries()) {
        resources.push({
          uri: `keimenon-docs://${path}`,
          name: path,
          description: `Documentation file: ${path}`,
          mimeType: 'text/markdown',
        });
      }

      return { resources };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_docs':
            return await this.searchDocs(args);
          case 'find_related':
            return await this.findRelated(args);
          case 'list_todos':
            return await this.listTodos(args);
          case 'get_architecture_info':
            return await this.getArchitectureInfo(args);
          case 'read_doc':
            return await this.readDoc(args);
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
        if (!uri.startsWith('keimenon-docs://')) {
          throw new Error(`Invalid URI scheme: ${uri}`);
        }

        const path = uri.replace('keimenon-docs://', '');
        const doc = this.docsCache.get(path);

        if (!doc) {
          throw new Error(`Document not found: ${path}`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: doc.content,
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
  async searchDocs(args) {
    const { query, limit = 10, context_lines = 3 } = args;
    const maxLimit = Math.min(limit, 50);
    const results = [];

    const searchTerm = query.toLowerCase();

    for (const [path, doc] of this.docsCache.entries()) {
      const lines = doc.content.split('\n');
      const matches = [];

      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(searchTerm)) {
          const start = Math.max(0, index - context_lines);
          const end = Math.min(lines.length, index + context_lines + 1);
          const context = lines.slice(start, end).join('\n');

          matches.push({
            line_number: index + 1,
            line: line.trim(),
            context: context,
          });
        }
      });

      if (matches.length > 0) {
        results.push({
          file: path,
          match_count: matches.length,
          matches: matches.slice(0, 5), // First 5 matches per file
        });
      }
    }

    // Sort by match count (most relevant first)
    results.sort((a, b) => b.match_count - a.match_count);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query: query,
              total_files: results.length,
              results: results.slice(0, maxLimit),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async findRelated(args) {
    const { topic, file_path, limit = 10 } = args;

    if (!topic && !file_path) {
      throw new Error('Either topic or file_path must be provided');
    }

    const searchTerms = topic
      ? topic.toLowerCase().split(/\s+/)
      : file_path
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ' ')
          .split(/\s+/)
          .filter(Boolean);

    const results = [];

    for (const [path, doc] of this.docsCache.entries()) {
      if (file_path && path === file_path) continue; // Skip the file itself

      const content = doc.content.toLowerCase();
      const pathLower = path.toLowerCase();

      // Calculate relevance score
      let score = 0;
      for (const term of searchTerms) {
        if (pathLower.includes(term)) score += 3;
        const contentMatches = (content.match(new RegExp(term, 'g')) || []).length;
        score += contentMatches;
      }

      if (score > 0) {
        results.push({
          file: path,
          score: score,
          size: doc.size,
          lines: doc.lines,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              search_topic: topic || file_path,
              total_related: results.length,
              results: results.slice(0, limit),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async listTodos(args) {
    const { type = 'all', path = null, limit = 50 } = args;
    const maxLimit = Math.min(limit, 200);

    const patterns = {
      TODO: /\/\/\s*TODO:?\s*(.+)|#\s*TODO:?\s*(.+)/gi,
      FIXME: /\/\/\s*FIXME:?\s*(.+)|#\s*FIXME:?\s*(.+)/gi,
      HACK: /\/\/\s*HACK:?\s*(.+)|#\s*HACK:?\s*(.+)/gi,
      NOTE: /\/\/\s*NOTE:?\s*(.+)|#\s*NOTE:?\s*(.+)/gi,
      BUG: /\/\/\s*BUG:?\s*(.+)|#\s*BUG:?\s*(.+)/gi,
      XXX: /\/\/\s*XXX:?\s*(.+)|#\s*XXX:?\s*(.+)/gi,
    };

    const searchPatterns = type === 'all' ? Object.entries(patterns) : [[type, patterns[type]]];

    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
    const results = [];

    const searchPath = path ? join(PROJECT_ROOT, path) : PROJECT_ROOT;
    const files = this.walkDir(searchPath, '');

    for (const filePath of files) {
      // Only search code files
      if (!codeExtensions.some((ext) => filePath.endsWith(ext))) continue;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = relative(PROJECT_ROOT, filePath);

        for (const [commentType, pattern] of searchPatterns) {
          lines.forEach((line, index) => {
            const match = pattern.exec(line);
            if (match) {
              const comment = (match[1] || match[2] || '').trim();
              results.push({
                type: commentType,
                file: relativePath,
                line: index + 1,
                comment: comment,
                context: line.trim(),
              });
            }
            // Reset regex lastIndex
            pattern.lastIndex = 0;
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              type: type,
              search_path: path || 'entire project',
              total_found: results.length,
              results: results.slice(0, maxLimit),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async getArchitectureInfo(args) {
    const { category = 'overview' } = args;

    const archFiles = {
      overview: 'docs/architecture/OVERVIEW.md',
      database: 'docs/architecture/DATABASE.md',
      api: 'docs/architecture/API_DESIGN.md',
      authentication: 'docs/architecture/AUTHENTICATION.md',
      features: 'docs/features',
    };

    if (category === 'all') {
      const info = {};
      for (const [cat, path] of Object.entries(archFiles)) {
        if (cat === 'features') {
          // List all feature docs
          const featuresDir = join(PROJECT_ROOT, path);
          if (existsSync(featuresDir)) {
            const files = readdirSync(featuresDir).filter((f) => f.endsWith('.md'));
            info[cat] = files.map((f) => join(path, f));
          }
        } else {
          const doc = this.docsCache.get(path);
          if (doc) {
            info[cat] = {
              path: path,
              size: doc.size,
              lines: doc.lines,
              preview: doc.content.split('\n').slice(0, 10).join('\n'),
            };
          }
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }

    const filePath = archFiles[category];
    if (!filePath) {
      throw new Error(`Unknown category: ${category}`);
    }

    if (category === 'features') {
      const featuresDir = join(PROJECT_ROOT, filePath);
      if (!existsSync(featuresDir)) {
        throw new Error('Features directory not found');
      }
      const files = readdirSync(featuresDir).filter((f) => f.endsWith('.md'));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                category: 'features',
                files: files.map((f) => join(filePath, f)),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const doc = this.docsCache.get(filePath);
    if (!doc) {
      throw new Error(`Documentation not found: ${filePath}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: doc.content,
        },
      ],
    };
  }

  async readDoc(args) {
    const { path } = args;

    const doc = this.docsCache.get(path);
    if (!doc) {
      // Try to find similar paths
      const similar = [];
      for (const cachedPath of this.docsCache.keys()) {
        if (cachedPath.toLowerCase().includes(path.toLowerCase())) {
          similar.push(cachedPath);
        }
      }

      throw new Error(
        `Document not found: ${path}${similar.length > 0 ? `\n\nDid you mean:\n${similar.slice(0, 5).join('\n')}` : ''}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: doc.content,
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
    console.error('[Docs MCP] Server running on stdio');
  }
}

// Start server
const server = new DocsMCPServer();
server.start().catch(console.error);
