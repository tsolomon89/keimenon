/**
 * Direct integration test for duplicate detection in import pipeline
 * Tests that DUP_OF edges are created when duplicate messages are imported
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { getDbClient } from '../utils/get-db-client';
import { EnhancedImportServiceV2, ImportConversation } from '../services/import-enhanced-v2';
import { ImportConfiguration } from '@canvas-memory/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Duplicate Detection Integration', () => {
  const testDbPath = path.join(__dirname, '../../.test-dbs/duplicate-detection-test.db');
  let dbClient: any;

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
    } catch {}

    // Create test database
    const mockReq = { testDbPath } as any;
    dbClient = await getDbClient(mockReq);

    // Create test account
    await dbClient.execute(
      `INSERT INTO accounts (id, name, account_type, account_class, created_at, updated_at)
       VALUES ('acc_test', 'Test Account', 'client', 'free', ?, ?)`,
      [Date.now(), Date.now()]
    );

    // Create test user
    await dbClient.execute(
      `INSERT INTO users (id, email, password_hash, permission_level, created_at, updated_at)
       VALUES ('user_test', 'test@test.com', 'hash', 'admin', ?, ?)`,
      [Date.now(), Date.now()]
    );

    // Create user-account link
    await dbClient.execute(
      `INSERT INTO user_accounts (user_id, account_id, permission_level, created_at)
       VALUES ('user_test', 'acc_test', 'admin', ?)`,
      [Date.now()]
    );
  });

  afterEach(async () => {
    // Clean up
    if (dbClient) {
      await dbClient.close();
    }
    try {
      await fs.unlink(testDbPath);
    } catch {}
  });

  it('should create DUP_OF edges for duplicate messages across conversations', async () => {
    const importService = new EnhancedImportServiceV2(dbClient);

    // Create conversations with duplicate messages
    const conversations: ImportConversation[] = [
      {
        id: 'conv_1',
        title: 'First Conversation',
        platform: 'generic',
        messages: [
          {
            id: 'msg_1_1',
            role: 'user',
            content: 'This is a duplicate message that appears twice',
            timestamp: Date.now(),
            conversationId: 'conv_1',
            index: 0,
            hash: 'hash1',
          },
        ],
        created_at: Date.now(),
      },
      {
        id: 'conv_2',
        title: 'Second Conversation',
        platform: 'generic',
        messages: [
          {
            id: 'msg_2_1',
            role: 'user',
            content: 'This is a duplicate message that appears twice',
            timestamp: Date.now() + 5000,
            conversationId: 'conv_2',
            index: 0,
            hash: 'hash2',
          },
        ],
        created_at: Date.now(),
      },
    ];

    const config: ImportConfiguration = {
      sources: {
        scope: 'message',
        roleFilter: { user: true, ai: false, separate: false },
        minLengthUser: 10,
        minLengthAI: 10,
        bundling: { enabled: false, method: 'keyword', similarityThreshold: 0.75 },
      },
      grouping: {
        mode: 'auto',
        auto: {
          targetGroupCount: 1,
          createCatchAll: true,
          minGroupSize: 1,
          algorithm: 'tfidf',
        },
        manual: [],
      },
      code: {
        extract: false,
        removeFromSource: true,
        createEdges: true,
        minLength: 50,
        deduplicate: true,
      },
      duplicates: {
        enabled: true,
        level: 'both', // Enable cross-conversation detection
        detectExact: true,
        detectNear: true,
        nearThreshold: 0.85,
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
    };

    // Run import
    const result = await importService.import(conversations, 'test_upload_hash', config, {
      accountId: 'acc_test',
      userId: 'user_test',
    });

    console.log('Import result:', {
      conversations: result.conversations,
      messages: result.messages,
      duplicatesForReview: result.duplicatesForReview,
    });

    // Query for DUP_OF edges
    const edgesResult = await dbClient.execute(
      `SELECT * FROM edges WHERE account_id = 'acc_test' AND kind = 'DUP_OF'`
    );

    console.log('DUP_OF edges found:', edgesResult.records.length);
    console.log('Edges:', edgesResult.records);

    // Should have at least 1 DUP_OF edge
    assert.ok(
      edgesResult.records.length > 0,
      `Expected at least 1 DUP_OF edge, but got ${edgesResult.records.length}`
    );
  }, 30000);

  it('should not create DUP_OF edges when duplicates are disabled', async () => {
    const importService = new EnhancedImportServiceV2(dbClient);

    const conversations: ImportConversation[] = [
      {
        id: 'conv_1',
        title: 'First Conversation',
        platform: 'generic',
        messages: [
          {
            id: 'msg_1_1',
            role: 'user',
            content: 'This is a duplicate message',
            timestamp: Date.now(),
            conversationId: 'conv_1',
            index: 0,
            hash: 'hash1',
          },
        ],
        created_at: Date.now(),
      },
      {
        id: 'conv_2',
        title: 'Second Conversation',
        platform: 'generic',
        messages: [
          {
            id: 'msg_2_1',
            role: 'user',
            content: 'This is a duplicate message',
            timestamp: Date.now() + 5000,
            conversationId: 'conv_2',
            index: 0,
            hash: 'hash2',
          },
        ],
        created_at: Date.now(),
      },
    ];

    const config: ImportConfiguration = {
      sources: {
        scope: 'message',
        roleFilter: { user: true, ai: false, separate: false },
        minLengthUser: 10,
        minLengthAI: 10,
        bundling: { enabled: false, method: 'keyword', similarityThreshold: 0.75 },
      },
      grouping: {
        mode: 'auto',
        auto: {
          targetGroupCount: 1,
          createCatchAll: true,
          minGroupSize: 1,
          algorithm: 'tfidf',
        },
        manual: [],
      },
      code: {
        extract: false,
        removeFromSource: true,
        createEdges: true,
        minLength: 50,
        deduplicate: true,
      },
      duplicates: {
        enabled: false, // Disable duplicate detection
        level: 'both',
        detectExact: true,
        detectNear: true,
        nearThreshold: 0.85,
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
    };

    // Run import
    await importService.import(conversations, 'test_upload_hash_2', config, {
      accountId: 'acc_test',
      userId: 'user_test',
    });

    // Query for DUP_OF edges
    const edgesResult = await dbClient.execute(
      `SELECT * FROM edges WHERE account_id = 'acc_test' AND kind = 'DUP_OF'`
    );

    // Should have 0 DUP_OF edges when disabled
    assert.strictEqual(
      edgesResult.records.length,
      0,
      `Expected 0 DUP_OF edges when disabled, but got ${edgesResult.records.length}`
    );
  }, 30000);
});
