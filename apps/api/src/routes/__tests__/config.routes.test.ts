import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import configRoutes from '../config';

describe('Config Routes - Canonical Import Defaults', () => {
  const originalConfigPath = process.env.CONFIG_PATH;
  let app: express.Application;
  let testDir: string;
  let testConfigPath: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'keimenon-config-route-tests', randomUUID());
    await fs.mkdir(testDir, { recursive: true });
    testConfigPath = path.join(testDir, 'config.json');
    process.env.CONFIG_PATH = testConfigPath;

    app = express();
    app.use(express.json());
    app.use('/api/v1/config', configRoutes);
  });

  afterEach(async () => {
    if (originalConfigPath) {
      process.env.CONFIG_PATH = originalConfigPath;
    } else {
      delete process.env.CONFIG_PATH;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns canonical import defaults when config file does not exist', async () => {
    const response = await request(app).get('/api/v1/config/import').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.importConfig.processingMode).toBe('automatic');
    expect(response.body.importConfig.branches).toBe('merged');
    expect(response.body.importConfig.codeSettings.sourceHandling).toBe('extract_and_remove');
    expect(response.body.importConfig.grouping).toBeUndefined();
  });

  it('migrates legacy defaults to canonical shape and rewrites config file', async () => {
    const legacyConfig = {
      version: '1.0',
      storageMode: 'local',
      database: {
        local: {
          path: path.join(testDir, 'legacy.db'),
          autoBackup: true,
          verbose: false,
        },
      },
      documentStore: {
        path: testDir,
        enableDeduplication: true,
      },
      defaults: {
        grouping: {
          mode: 'manual',
          auto: {
            targetGroupCount: 15,
            createCatchAll: true,
            minGroupSize: 2,
            algorithm: 'tfidf',
          },
          manual: [{ name: 'Legacy Group', keywords: ['alpha', 'beta'] }],
        },
        sources: {
          scope: 'message',
          roleFilter: {
            user: true,
            ai: true,
            separate: true,
          },
          minLengthUser: 120,
          minLengthAI: 300,
          bundling: {
            enabled: false,
            method: 'keyword',
            similarityThreshold: 0.75,
          },
        },
        code: {
          extract: true,
          removeFromSource: false,
          createEdges: true,
          minLength: 64,
          deduplicate: true,
        },
        duplicates: {
          enabled: true,
          level: 'both',
          detectExact: true,
          detectNear: true,
          nearThreshold: 0.77,
          detectSemantic: false,
          semanticThreshold: 0.9,
          createReviewFolders: false,
          autoMergeSuggestions: false,
        },
        privacy: {
          storageMode: 'local',
          allowExternalAPIs: false,
          apiKey: null,
        },
      },
    };

    await fs.writeFile(testConfigPath, JSON.stringify(legacyConfig, null, 2), 'utf-8');

    const response = await request(app).get('/api/v1/config/import').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.importConfig.processingMode).toBe('manual');
    expect(response.body.importConfig.branches).toBe('separate');
    expect(response.body.importConfig.minMessageLength).toBe(120);
    expect(response.body.importConfig.codeSettings.sourceHandling).toBe('keep_inline');
    expect(response.body.importConfig.duplicateDetection.requireReview).toBe(false);
    expect(response.body.importConfig.groups).toHaveLength(1);
    expect(response.body.importConfig.grouping).toBeUndefined();

    const persisted = JSON.parse(await fs.readFile(testConfigPath, 'utf-8'));
    expect(persisted.defaults.processingMode).toBe('manual');
    expect(persisted.defaults.branches).toBe('separate');
    expect(persisted.defaults.codeSettings.sourceHandling).toBe('keep_inline');
    expect(persisted.defaults.grouping).toBeUndefined();
  });

  it('persists canonical defaults via PUT /api/v1/config/import', async () => {
    const updatePayload = {
      extraction: { includeUser: true, includeAssistant: true },
      minMessageLength: 16,
      processingMode: 'hybrid',
      branches: 'separate',
      groups: [{ id: 'grp_one', name: 'One', keywords: ['k1'] }],
      extractCode: true,
      codeSettings: {
        minLength: 42,
        languages: ['ts'],
        groupBy: 'language',
        deduplicate: true,
        sourceHandling: 'extract_and_remove',
      },
      duplicateDetection: {
        enabled: true,
        exactMatch: true,
        similarityThreshold: 0.91,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 5,
        lengthRatioTolerance: 0.2,
        ignoreWhitespace: true,
        ignoreCase: false,
        ignoreTimestamp: true,
        requireReview: true,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      },
    };

    const putResponse = await request(app)
      .put('/api/v1/config/import')
      .send(updatePayload)
      .expect(200);
    expect(putResponse.body.success).toBe(true);
    expect(putResponse.body.importConfig.processingMode).toBe('hybrid');
    expect(putResponse.body.importConfig.branches).toBe('separate');

    const getResponse = await request(app).get('/api/v1/config/import').expect(200);
    expect(getResponse.body.importConfig.processingMode).toBe('hybrid');
    expect(getResponse.body.importConfig.groups).toHaveLength(1);

    const persisted = JSON.parse(await fs.readFile(testConfigPath, 'utf-8'));
    expect(persisted.defaults.processingMode).toBe('hybrid');
    expect(persisted.defaults.branches).toBe('separate');
    expect(persisted.defaults.grouping).toBeUndefined();
  });

  it('canonicalizes legacy defaults via PUT /api/v1/config', async () => {
    const response = await request(app)
      .put('/api/v1/config')
      .send({
        defaults: {
          grouping: {
            mode: 'auto',
            manual: [],
          },
          sources: {
            roleFilter: {
              user: true,
              ai: false,
              separate: false,
            },
            minLengthUser: 64,
            minLengthAI: 256,
          },
          code: {
            extract: true,
            removeFromSource: true,
            minLength: 80,
            deduplicate: true,
          },
          duplicates: {
            enabled: true,
            detectExact: true,
            nearThreshold: 0.88,
            createReviewFolders: true,
          },
        },
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.config.defaults.processingMode).toBe('automatic');
    expect(response.body.config.defaults.branches).toBe('merged');
    expect(response.body.config.defaults.extraction.includeAssistant).toBe(false);
    expect(response.body.config.defaults.minMessageLength).toBe(64);
    expect(response.body.config.defaults.grouping).toBeUndefined();

    const persisted = JSON.parse(await fs.readFile(testConfigPath, 'utf-8'));
    expect(persisted.defaults.processingMode).toBe('automatic');
    expect(persisted.defaults.branches).toBe('merged');
    expect(persisted.defaults.codeSettings.sourceHandling).toBe('extract_and_remove');
    expect(persisted.defaults.grouping).toBeUndefined();
    expect(persisted.defaults.sources).toBeUndefined();
  });
});
