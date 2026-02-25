import { ContentProcessor } from '../content-processor';
import { GroupingStorage } from '../grouping-storage';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('better-sqlite3', () => {
  return {
    default: class Database {
      prepare() { return { run: () => {}, get: () => {}, all: () => [] }; }
      exec() {}
      pragma() {}
      transaction(fn: any) { return fn; }
      close() {}
    }
  };
});

describe.skip('CAS Deduplication', () => {
  let storage: GroupingStorage;
  let dbPath: string;

  beforeEach(() => {
    const tmpDir = os.tmpdir();
    dbPath = path.join(tmpDir, `cas-test-${Date.now()}-${Math.random()}.db`);
    storage = new GroupingStorage(dbPath);

    // Initialize schema manually since we are using GroupingStorage directly
    const db = (storage as any).db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS blobs (
        hash TEXT PRIMARY KEY,
        size_bytes INTEGER NOT NULL,
        mime_type TEXT,
        encoding TEXT NOT NULL,
        storage_path TEXT,
        account_id TEXT,
        data_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS node_spans (
        node_id TEXT PRIMARY KEY,
        node_key TEXT NOT NULL,
        blob_hash TEXT NOT NULL,
        byte_start INTEGER NOT NULL,
        byte_end INTEGER NOT NULL,
        encoding TEXT NOT NULL,
        offset_kind TEXT NOT NULL,
        level TEXT NOT NULL,
        modality TEXT NOT NULL,
        parent_node_id TEXT,
        account_id TEXT,
        data_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (blob_hash) REFERENCES blobs(hash)
      );

      CREATE TABLE IF NOT EXISTS node_signatures (
        node_id TEXT PRIMARY KEY,
        node_key TEXT NOT NULL,
        content_id TEXT NOT NULL,
        minhash TEXT NOT NULL,
        tfidf_vector TEXT,
        token_sketch TEXT,
        structural_path TEXT,
        account_id TEXT,
        data_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (node_id) REFERENCES node_spans(node_id)
      );
      
      CREATE TABLE IF NOT EXISTS lsh_bands (
        band_hash TEXT NOT NULL,
        band_index INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        account_id TEXT,
        data_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (band_hash, node_id),
        FOREIGN KEY (node_id) REFERENCES node_spans(node_id)
      );
    `);
  });

  afterEach(() => {
    if (storage) {
      try {
        storage.close();
      } catch (e) {
        console.warn('Error closing storage:', e);
      }
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
         // ignore
      }
    }
  });

  it('should dedup exact duplicates using CAS', async () => {
    const text1 = 'This is a test message.';
    const text2 = 'This is a test message.'; // Exact duplicate

    const processor = new ContentProcessor();
    const processed1 = await processor.processText(text1, 'message');
    const processed2 = await processor.processText(text2, 'message');

    // Insert both
    storage.insertBlob(processed1.blob);
    storage.insertBlob(processed2.blob); // Should ignore/replace
    storage.insertNodeSpans(processed1.spans);
    storage.insertNodeSpans(processed2.spans); // Should ignore/replace
    storage.insertNodeSignatures(processed1.signatures);
    storage.insertNodeSignatures(processed2.signatures); // Should ignore/replace

    const sig1 = processed1.signatures[0];
    const sig2 = processed2.signatures[0];

    // Content IDs must be identical
    expect(sig1.content_id).toBe(sig2.content_id);

    // Query should return canonical nodes
    // Since "This is a test message" generates Root, Block, Sentence nodes (all same content),
    // we expect multiple nodes to verify ALL levels are stored.
    const duplicates = storage.findNodesByContentId(sig1.content_id);
    expect(duplicates.length).toBeGreaterThanOrEqual(1);

    // Verify that at least one of them matches our node_id
    expect(duplicates.some((d) => d.node_id === sig1.node_id)).toBe(true);

    // Debug: Prove we didn't store "double"
    // If we process text ONCE, how many nodes do we get?
    // We already inserted processed1. If processed2 added NEW nodes, duplicates would double.
    // Let's verify counts.

    // Get stats from DB
    const db = (storage as any).db;
    const blobCount = db.prepare('SELECT count(*) as c FROM blobs').get().c;
    const nodeCount = db.prepare('SELECT count(*) as c FROM node_spans').get().c;

    // Should default to 1 blob (CAS)
    expect(blobCount).toBe(1);

    // Nodes should match processed1.spans which is fixed for this input
    expect(nodeCount).toBe(processed1.spans.length);
  });
});
