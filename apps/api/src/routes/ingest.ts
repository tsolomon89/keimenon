import { Router, Request, Response } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { getStorageService } from '../services/storage';
import { generateFingerprint, generateNodeId } from '../services/fingerprint';
import { AutogroupService } from '../services/autogroup';
import { SourceNodeSchema } from '@keimenon/types';
import { getDbClient } from '../utils/get-db-client';

const router = Router();

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

// Configure multer for file uploads
const upload = multer({
  dest: 'storage/temp',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB default
    files: 10, // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allowed MIME types for Free tier
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'image/png',
      'image/jpeg',
      'application/json',
      'text/csv',
    ];

    const mimeType = file.mimetype;
    if (allowedTypes.includes(mimeType)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${mimeType} not allowed`));
    }
  },
});

/**
 * POST /api/v1/ingest/files
 * Upload files and create Source nodes (requires senior permission)
 */
router.post('/files', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    // Apply auth if available
    if (requireAuth && requirePermission) {
      await new Promise<void>((resolve, reject) => {
        requireAuth(authService)(req, res, (err: any) => {
          if (err) reject(err);
          else {
            requirePermission('senior')(req, res, (err2: any) => {
              if (err2) reject(err2);
              else resolve();
            });
          }
        });
      });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const boardId = req.body.board_id || 'default_board';
    const workspaceId = req.body.workspace_id || 'default_workspace';

    const storage = getStorageService();
    const autogroup = new AutogroupService();
    const db = await getDbClient(req);
    const sources = [];

    // Process each file
    for (const file of files) {
      // Generate fingerprint
      const content = await require('fs/promises').readFile(file.path);
      const fingerprint = generateFingerprint(content);

      // Store file
      const { relativePath } = await storage.storeFile(file, fingerprint);

      // Create Source node
      const sourceId = generateNodeId('src', fingerprint);
      const source = SourceNodeSchema.parse({
        id: sourceId,
        kind: 'Source',
        fingerprint,
        mime_type: file.mimetype,
        size_bytes: file.size,
        file_path: relativePath,
        title: file.originalname,
        board_id: boardId,
        created_at: Date.now(),
        updated_at: Date.now(),
        provenance: {
          origin: 'upload',
          retrieved_at: Date.now(),
          attested: false,
        },
      });

      // Add account_id and created_by if auth is enabled
      if (req.user) {
        (source as any).account_id = req.user.accountId;
        (source as any).created_by = req.user.userId;
      }

      // Save to database
      await db.createNode(source);

      sources.push(source);
    }

    // Generate autogroup suggestions
    const groupSuggestions = autogroup.suggestGroups(sources);

    // Create groups in database
    const createdGroups = [];
    for (const suggestion of groupSuggestions) {
      const groupNode: any = {
        id: suggestion.groupId,
        kind: 'Group',
        name: suggestion.name,
        purpose: suggestion.reason,
        member_count: suggestion.members.length,
        board_id: boardId,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      // Add account_id and created_by if auth is enabled
      if (req.user) {
        groupNode.account_id = req.user.accountId;
        groupNode.created_by = req.user.userId;
      }

      await db.createNode(groupNode);

      // Create CONTAINS edges
      for (const memberId of suggestion.members) {
        const edge: any = {
          id: `edge_${nanoid(12)}`,
          kind: 'CONTAINS',
          from: suggestion.groupId,
          to: memberId,
          created_at: Date.now(),
        };

        // Add account_id and created_by if auth is enabled
        if (req.user) {
          edge.account_id = req.user.accountId;
          edge.created_by = req.user.userId;
        }

        await db.createEdge(edge);
      }

      createdGroups.push({
        id: suggestion.groupId,
        name: suggestion.name,
        memberCount: suggestion.members.length,
      });
    }

    // Detect duplicates
    const duplicates = autogroup.detectDuplicates(sources);

    return res.json({
      success: true,
      sources,
      groups: createdGroups,
      groupSuggestions,
      duplicates,
      stats: {
        uploaded: sources.length,
        groups: createdGroups.length,
        duplicates: duplicates.length,
      },
    });
  } catch (error: any) {
    console.error('Ingest error:', error);
    return res.status(500).json({
      error: 'Failed to ingest files',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/ingest/url
 * Ingest content from URL
 */
router.post('/url', async (req: Request, res: Response) => {
  try {
    const { url, board_id } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // TODO: Implement URL content fetching
    // Related: apps/api/src/services/url-fetcher.ts (needs creation)
    // See: docs/features/URL_INGEST.md (needs creation)

    // TODO: Generate fingerprint from fetched content
    // Related: apps/api/src/services/fingerprint.ts (generateFingerprint)

    // TODO: Create Source node with provenance tracking
    // Related: apps/api/src/routes/nodes.ts (createNode logic)
    // See: packages/db/src/sqlite/schema.sql (Source node schema)

    return res.json({
      success: true,
      message: 'URL ingest not yet implemented',
      url,
    });
  } catch (error: any) {
    console.error('URL ingest error:', error);
    return res.status(500).json({
      error: 'Failed to ingest URL',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/ingest/status
 * Get ingest queue status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const storage = getStorageService();
    const stats = await storage.getUsageStats();

    return res.json({
      storage: {
        totalFiles: stats.totalFiles,
        totalSizeBytes: stats.totalSizeBytes,
        totalSizeMB: (stats.totalSizeBytes / 1024 / 1024).toFixed(2),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to get status',
      message: error.message,
    });
  }
});

export default router;
