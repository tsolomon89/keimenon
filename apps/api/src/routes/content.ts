import { Router, Request, Response } from 'express';
import { getLocalDocumentStore } from '../services/local-document-store';

const router = Router();
const localStore = getLocalDocumentStore();

// Auth middleware will be added by server.ts when authService is available
let authService: any = null;
let requireAuth: any = null;
let requirePermission: any = null;
let isolateByAccount: any = null;

// Export function to set auth dependencies
export function setAuthDependencies(
  service: any,
  authMiddleware: any,
  permissionMiddleware: any,
  isolationMiddleware: any
) {
  authService = service;
  requireAuth = authMiddleware;
  requirePermission = permissionMiddleware;
  isolateByAccount = isolationMiddleware;
}

// Helper to get database client
function getDbClient() {
  if (!global.dbClient) {
    throw new Error('Database not initialized');
  }
  return global.dbClient;
}

/**
 * GET /api/v1/content/message/:id
 * Get full message content from local storage (with account isolation)
 */
router.get('/message/:id', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            isolateByAccount(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const { id } = req.params;

    // Get message node from database to find storage location
    const db = getDbClient();
    const message = await db.getNode(id);

    if (!message || message.kind !== 'Message') {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const messageAccountId = (message as any).account_id;

      // Admin accounts can access all messages
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own messages
        if (messageAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    const contentLocation = message.content_location;

    if (!contentLocation) {
      // Fallback: content might be stored in Neo4j (old data)
      if (message.content) {
        return res.json({
          id,
          content: message.content,
          source: 'neo4j',
        });
      }
      return res.status(404).json({ error: 'Content location not found' });
    }

    // Parse storage location and read from local filesystem
    const storagePath = localStore.parseStorageLocation(contentLocation);
    if (!storagePath) {
      return res.status(500).json({ error: 'Invalid storage location format' });
    }

    const content = await localStore.getContentByPath(storagePath);
    if (!content) {
      return res.status(404).json({ error: 'Content file not found on disk' });
    }

    res.json({
      id,
      content,
      source: 'local',
      role: message.role,
      timestamp: message.timestamp,
      char_count: message.char_count,
    });
  } catch (error: any) {
    console.error('Get message content error:', error);
    res.status(500).json({
      error: 'Failed to retrieve message content',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/content/source/:id
 * Get full source document content from local storage (with account isolation)
 */
router.get('/source/:id', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            isolateByAccount(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const { id } = req.params;

    // Get source node from database
    const db = getDbClient();
    const source = await db.getNode(id);

    if (!source || source.kind !== 'Source') {
      return res.status(404).json({ error: 'Source not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const sourceAccountId = (source as any).account_id;

      // Admin accounts can access all sources
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own sources
        if (sourceAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    const contentLocation = source.content_location;

    if (!contentLocation) {
      return res.status(404).json({ error: 'Content location not found' });
    }

    const storagePath = localStore.parseStorageLocation(contentLocation);
    if (!storagePath) {
      return res.status(500).json({ error: 'Invalid storage location format' });
    }

    const content = await localStore.getContentByPath(storagePath);
    if (!content) {
      return res.status(404).json({ error: 'Content file not found on disk' });
    }

    res.json({
      id,
      title: source.title,
      content,
      source: 'local',
      mime_type: source.mime_type,
      size_bytes: source.size_bytes,
    });
  } catch (error: any) {
    console.error('Get source content error:', error);
    res.status(500).json({
      error: 'Failed to retrieve source content',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/content/code/:id
 * Get full code block content from local storage (with account isolation)
 */
router.get('/code/:id', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            isolateByAccount(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const { id } = req.params;

    const db = getDbClient();
    const codeBlock = await db.getNode(id);

    if (!codeBlock || codeBlock.kind !== 'CodeBlock') {
      return res.status(404).json({ error: 'Code block not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const codeAccountId = (codeBlock as any).account_id;

      // Admin accounts can access all code blocks
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own code blocks
        if (codeAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    const contentLocation = codeBlock.content_location;

    if (!contentLocation) {
      // Fallback for old data
      if (codeBlock.code) {
        return res.json({
          id,
          code: codeBlock.code,
          language: codeBlock.language,
          source: 'neo4j',
        });
      }
      return res.status(404).json({ error: 'Content location not found' });
    }

    const storagePath = localStore.parseStorageLocation(contentLocation);
    if (!storagePath) {
      return res.status(500).json({ error: 'Invalid storage location format' });
    }

    const code = await localStore.getContentByPath(storagePath);
    if (!code) {
      return res.status(404).json({ error: 'Code file not found on disk' });
    }

    res.json({
      id,
      code,
      language: codeBlock.language,
      source: 'local',
      line_count: codeBlock.line_count,
      char_count: codeBlock.char_count,
    });
  } catch (error: any) {
    console.error('Get code content error:', error);
    res.status(500).json({
      error: 'Failed to retrieve code content',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/content/conversation/:id
 * Get full conversation export from local storage (with account isolation)
 */
router.get('/conversation/:id', async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && isolateByAccount) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            isolateByAccount(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const { id } = req.params;

    // Check if conversation exists in database
    const db = getDbClient();
    const thread = await db.getNode(id);

    if (!thread || thread.kind !== 'ChatThread') {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check account ownership if auth is enabled
    if (req.user) {
      const threadAccountId = (thread as any).account_id;

      // Admin accounts can access all conversations
      if (req.user.accountType !== 'admin') {
        // Client accounts can only access their own conversations
        if (threadAccountId !== req.user.accountId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    // Try to load from local storage
    const conversationData = await localStore.getContent(id, 'conversation');

    if (conversationData) {
      const parsed = JSON.parse(conversationData);
      return res.json({
        id,
        source: 'local',
        conversation: parsed,
      });
    }

    // Fallback: reconstruct from database messages
    // Get CONTAINS edges from thread to messages
    const edges = db.getNodeEdges
      ? await db.getNodeEdges(id, 'outgoing')
      : [];

    const messageEdges = edges.filter((e: any) => e.kind === 'CONTAINS');

    // Get message nodes
    const messages = [];
    for (const edge of messageEdges) {
      const message = await db.getNode(edge.to);
      if (message && message.kind === 'Message') {
        messages.push({
          role: message.role,
          content: message.content || '[Content stored locally]',
          timestamp: message.timestamp,
          index: edge.metadata?.rank || 0,
        });
      }
    }

    // Sort by index
    messages.sort((a, b) => a.index - b.index);

    res.json({
      id,
      source: 'database',
      conversation: {
        id: thread.id,
        title: thread.title,
        messages,
        created_at: thread.created_at,
      },
    });
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/content/stats
 * Get local storage statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await localStore.getStats();
    const db = getDbClient();

    // Get database stats
    let dbStats = {};
    if (db.getStats) {
      dbStats = await db.getStats();
    } else {
      // Fallback: count by querying
      const storageMode = process.env.STORAGE_MODE || 'local';

      if (storageMode === 'local') {
        const totalResult = await db.execute('SELECT COUNT(*) as count FROM nodes');
        const messagesResult = await db.execute("SELECT COUNT(*) as count FROM nodes WHERE kind = 'Message'");
        const sourcesResult = await db.execute("SELECT COUNT(*) as count FROM nodes WHERE kind = 'Source'");
        const codeResult = await db.execute("SELECT COUNT(*) as count FROM nodes WHERE kind = 'CodeBlock'");
        const edgesResult = await db.execute('SELECT COUNT(*) as count FROM edges');

        dbStats = {
          total_nodes: totalResult.records[0].count,
          message_nodes: messagesResult.records[0].count,
          source_nodes: sourcesResult.records[0].count,
          code_block_nodes: codeResult.records[0].count,
          total_edges: edgesResult.records[0].count,
        };
      } else {
        // Neo4j fallback
        const nodeResult = await db.execute(`
          MATCH (n:Node)
          RETURN count(n) as total,
                 count(CASE WHEN n:Message THEN 1 END) as messages,
                 count(CASE WHEN n:Source THEN 1 END) as sources,
                 count(CASE WHEN n:CodeBlock THEN 1 END) as code_blocks
        `);

        const nodeCounts = nodeResult.records[0];
        dbStats = {
          total_nodes: nodeCounts.get('total').toNumber(),
          message_nodes: nodeCounts.get('messages').toNumber(),
          source_nodes: nodeCounts.get('sources').toNumber(),
          code_block_nodes: nodeCounts.get('code_blocks').toNumber(),
        };
      }
    }

    res.json({
      local_storage: {
        ...stats,
        path: process.env.LOCAL_DOCS_PATH || '~/.canvas-memory',
      },
      database: dbStats,
      storage_model: 'local-first',
      storage_mode: process.env.STORAGE_MODE || 'local',
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve stats',
      message: error.message,
    });
  }
});

export default router;
