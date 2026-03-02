import { Router, Request, Response } from 'express';
/* eslint-disable @typescript-eslint/no-explicit-any */
import multer from 'multer';
import { nanoid } from 'nanoid';
import { getStorageService } from '../services/storage';
import { generateFingerprint, generateNodeId, canonicalizeUrl } from '../services/fingerprint';
import { AutogroupService } from '../services/autogroup';
import { SourceNodeSchema } from '@keimenon/types';
import { getDbClient } from '../utils/get-db-client';
import { getURLFetcherService, URLFetchError } from '../services/url-fetcher';
import { getContentExtractorService } from '../services/content-extractor';
import { getLocalDocumentStore } from '../services/local-document-store';

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
router.post('/files', upload.array('files', 10) as any, async (req: Request, res: Response) => {
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

      // Create Source node with full World Model provenance
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
        // World Model V5: Full provenance tracking (WHO/HOW/FROM/VERIFIED)
        provenance: {
          origin_principal_id: req.user?.userId || 'anonymous', // WHO: User who uploaded
          origin_type: 'user_upload', // HOW: Direct file upload
          origin_ref: fingerprint, // FROM: File fingerprint
          trust_state: 'ugc', // VERIFIED: User-generated content
          original_url: undefined, // N/A for file uploads
          retrieved_at: Date.now(),
          // Legacy fields for backward compatibility
          origin: 'upload',
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
 * Ingest content from URL with SSRF prevention
 *
 * Request body:
 *   - url: string (required) - The URL to fetch content from
 *   - board_id: string (optional) - Board to associate the source with
 *
 * Security:
 *   - SSRF prevention: blocks private/internal IP ranges
 *   - Size limit: 10MB max content
 *   - Timeout: 30 seconds
 *   - Protocol whitelist: http/https only
 */
router.post('/url', async (req: Request, res: Response) => {
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

    const { url, board_id } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const boardId = board_id || 'default_board';
    const db = await getDbClient(req);
    const urlFetcher = getURLFetcherService();
    const contentExtractor = getContentExtractorService();
    const documentStore = getLocalDocumentStore();

    // Initialize document store if needed
    await documentStore.initialize().catch(() => {
      // Ignore if already initialized
    });

    // Validate URL for SSRF prevention
    const validation = await urlFetcher.validateUrl(url);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'URL validation failed',
        reason: validation.reason,
      });
    }

    const canonicalUrl = validation.canonicalUrl || canonicalizeUrl(url);

    // Security fix: Require valid accountId, don't fall back to 'default'
    // This prevents unauthenticated requests from accessing/creating data
    const accountId = req.user?.accountId;
    if (!accountId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'A valid account context is required to ingest URLs',
      });
    }

    // Fetch content with SSRF protection
    let fetchResult;
    try {
      fetchResult = await urlFetcher.fetch(url);
    } catch (error) {
      if (error instanceof URLFetchError) {
        return res.status(400).json({
          error: 'Failed to fetch URL',
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    // Extract readable content
    const extractedContent = contentExtractor.extract(fetchResult.html, fetchResult.finalUrl);

    // Generate fingerprint from extracted text content
    const fingerprint = generateFingerprint(extractedContent.textContent);

    // Check for duplicate content by fingerprint (within account scope)
    const existingByFingerprint = await db.findNodeByContentHash(fingerprint, accountId);
    if (existingByFingerprint) {
      return res.json({
        success: true,
        duplicate: true,
        duplicateOf: existingByFingerprint.id,
        message: 'Content with same fingerprint already exists',
        source: existingByFingerprint,
        metadata: {
          url: canonicalUrl,
          canonicalUrl,
          title: extractedContent.title,
          fetchedAt: fetchResult.fetchedAt,
          contentSize: fetchResult.contentLength,
          fingerprint,
        },
      });
    }

    // Generate Source node ID
    const sourceId = generateNodeId('src', fingerprint);

    // Store content as markdown
    const markdownContent = contentExtractor.toMarkdown(extractedContent, fetchResult.finalUrl);
    const storageMetadata = await documentStore.saveSource(sourceId, markdownContent);

    // Create Source node with World Model V5 provenance
    const source = SourceNodeSchema.parse({
      id: sourceId,
      kind: 'Source',
      url: canonicalUrl,
      fingerprint,
      mime_type: 'text/html',
      size_bytes: fetchResult.contentLength,
      title: extractedContent.title,
      content_location: documentStore.getStorageLocation(storageMetadata),
      board_id: boardId,
      source_role: 'imported',
      created_at: Date.now(),
      updated_at: Date.now(),
      // World Model V5: Full provenance tracking (WHO/HOW/FROM/VERIFIED)
      provenance: {
        origin_principal_id: req.user?.userId || 'anonymous', // WHO: User who fetched
        origin_type: 'agent_import', // HOW: URL fetch
        origin_ref: canonicalUrl, // FROM: Source URL
        trust_state: 'external_claim', // VERIFIED: External, unverified
        original_url: canonicalUrl,
        retrieved_at: fetchResult.fetchedAt,
        capture_hash: fingerprint,
        // Legacy fields for backward compatibility
        origin: 'url_fetch',
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

    return res.json({
      success: true,
      duplicate: false,
      source,
      metadata: {
        url,
        canonicalUrl,
        finalUrl: fetchResult.finalUrl,
        title: extractedContent.title,
        author: extractedContent.author,
        publishedDate: extractedContent.publishedDate,
        siteName: extractedContent.siteName,
        fetchedAt: fetchResult.fetchedAt,
        contentSize: fetchResult.contentLength,
        fingerprint,
        wordCount: extractedContent.wordCount,
        charCount: extractedContent.charCount,
        codeBlockCount: extractedContent.codeBlocks.length,
        imageCount: extractedContent.imageUrls.length,
      },
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
