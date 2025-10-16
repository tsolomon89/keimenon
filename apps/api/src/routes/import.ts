import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ImportService } from '../services/import';
import { ImportConfigSchema } from '@canvas-memory/parsers';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const upload = multer({ dest: 'uploads/' });

/**
 * POST /api/v1/import/chat
 * Import AI chat conversations from JSON/JSONL files
 */
router.post('/chat', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse config from request body
    const configData = req.body.config ? JSON.parse(req.body.config) : {};
    const config = ImportConfigSchema.parse(configData);

    // Read uploaded file
    const filePath = req.file.path;
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Parse JSON
    let data: unknown;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.jsonl') {
      // Parse JSONL (one JSON object per line)
      const lines = fileContent.split('\n').filter(line => line.trim());
      data = lines.map(line => JSON.parse(line));
    } else {
      // Parse regular JSON
      data = JSON.parse(fileContent);
    }

    // Import
    const importService = new ImportService();
    const result = await importService.importConversations(
      data,
      req.file.originalname,
      config
    );

    // Clean up uploaded file
    await fs.unlink(filePath);

    res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    res.status(500).json({
      error: 'Import failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/import/chat/batch
 * Import multiple chat files at once
 */
router.post('/chat/batch', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Parse config
    const configData = req.body.config ? JSON.parse(req.body.config) : {};
    const config = ImportConfigSchema.parse(configData);

    const importService = new ImportService();
    const results = [];

    for (const file of files) {
      try {
        const filePath = file.path;
        const fileContent = await fs.readFile(filePath, 'utf-8');

        // Parse JSON/JSONL
        let data: unknown;
        const ext = path.extname(file.originalname).toLowerCase();

        if (ext === '.jsonl') {
          const lines = fileContent.split('\n').filter(line => line.trim());
          data = lines.map(line => JSON.parse(line));
        } else {
          data = JSON.parse(fileContent);
        }

        // Import
        const result = await importService.importConversations(
          data,
          file.originalname,
          config
        );

        results.push({
          file: file.originalname,
          success: true,
          result,
        });

        // Clean up
        await fs.unlink(filePath);
      } catch (error: any) {
        results.push({
          file: file.originalname,
          success: false,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      results,
      summary: {
        total_files: files.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      },
    });
  } catch (error: any) {
    console.error('Batch import error:', error);
    res.status(500).json({
      error: 'Batch import failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/import/config/defaults
 * Get default import configuration
 */
router.get('/config/defaults', (_req: Request, res: Response) => {
  const defaults = ImportConfigSchema.parse({});
  res.json(defaults);
});

export default router;
