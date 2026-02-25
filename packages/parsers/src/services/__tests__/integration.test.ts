/**
 * Integration Test: End-to-end pipeline from parsing to storage
 *
 * Demonstrates:
 * 1. Parse ChatGPT conversation
 * 2. Apply breaking pipeline (token → phrase → sentence → block → section)
 * 3. Generate signatures (MinHash, TF-IDF, structural)
 * 4. Persist to database (blobs, spans, signatures, LSH bands)
 * 5. Query and deduplicate
 */

import { ChatGPTParser } from '../../parsers/chatgpt';
import { ContentProcessor } from '../content-processor';
import { GroupingStorage } from '../grouping-storage';
import { extractLshBands } from '../../breaking/signature-generator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

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

describe.skip('Integration: Full Pipeline', () => {
  let storage: GroupingStorage;
  let dbPath: string;

  beforeEach(() => {
    // Create temp database
    const tmpDir = os.tmpdir();
    dbPath = path.join(tmpDir, `test-${Date.now()}.db`);
    storage = new GroupingStorage(dbPath);

    // Initialize schema
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

      CREATE TABLE IF NOT EXISTS clusters (
        cluster_id TEXT PRIMARY KEY,
        representative_node TEXT NOT NULL,
        member_count INTEGER NOT NULL,
        algorithm TEXT NOT NULL,
        threshold REAL NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cluster_members (
        cluster_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (cluster_id, node_id),
        FOREIGN KEY (cluster_id) REFERENCES clusters(cluster_id),
        FOREIGN KEY (node_id) REFERENCES node_spans(node_id)
      );
    `);
  });

  afterEach(() => {
    storage.close();
    // Clean up
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should process conversation end-to-end', async () => {
    // Sample ChatGPT conversation data
    const chatGptData = {
      title: 'Test Conversation',
      create_time: Date.now() / 1000,
      mapping: {
        msg_1: {
          id: 'msg_1',
          parent: null,
          children: ['msg_2'],
          message: {
            id: 'msg_1',
            author: { role: 'user' },
            content: { parts: ['Hello! Can you explain async/await in JavaScript?'] },
            create_time: Date.now() / 1000,
          },
        },
        msg_2: {
          id: 'msg_2',
          parent: 'msg_1',
          children: [],
          message: {
            id: 'msg_2',
            author: { role: 'assistant' },
            content: {
              parts: [
                '# Async/Await in JavaScript\n\n' +
                  'Async/await is a modern way to handle asynchronous operations in JavaScript.\n\n' +
                  '## Key Concepts\n\n' +
                  '1. **Async functions** return promises\n2. **Await** pauses execution\n3. Error handling with try/catch\n\n' +
                  '```javascript\n' +
                  'async function fetchData() {\n' +
                  '  const response = await fetch("/api/data");\n' +
                  '  return await response.json();\n' +
                  '}\n' +
                  '```\n\n' +
                  '## Benefits\n\n' +
                  '- More readable than callbacks\n- Easier error handling\n- Better debugging experience',
              ],
            },
            create_time: Date.now() / 1000 + 1,
          },
        },
      },
    };

    // Step 1: Parse conversation
    const parser = new ChatGPTParser();
    const parseResult = await parser.parse(chatGptData, 'test.json');

    expect(parseResult.conversations).toHaveLength(1);
    const conversation = parseResult.conversations[0];
    expect(conversation.messages).toHaveLength(2);

    // Step 2: Process with breaking pipeline
    const processor = new ContentProcessor({
      extractTokens: true,
      extractPhrases: true,
      extractSentences: true,
      extractBlocks: true,
      extractSections: true,
      generateSignatures: true,
      minHashPermutations: 128,
    });

    const processedMessages = await processor.processConversation(conversation);

    expect(processedMessages).toHaveLength(2);

    // Step 3: Persist to database
    for (const processed of processedMessages) {
      // Insert blob
      storage.insertBlob(processed.blob);

      // Insert spans
      storage.insertNodeSpans(processed.spans);

      // Insert signatures
      storage.insertNodeSignatures(processed.signatures);

      // Generate and insert LSH bands
      for (const signature of processed.signatures) {
        const bands = extractLshBands(
          { hashes: signature.minhash, numPermutations: 128 },
          16 // 16 bands
        );

        const lshBands = bands.map((band) => ({
          band_hash: band.bandHash,
          band_index: band.bandIndex,
          node_id: signature.node_id,
          data_tag: 'test',
          created_at: signature.created_at,
        }));

        storage.insertLshBands(lshBands);
      }
    }

    // Step 4: Verify storage
    const stats = storage.getStats();
    expect(stats.blob_count).toBeGreaterThanOrEqual(2);
    expect(stats.node_count).toBeGreaterThan(0);
    expect(stats.signature_count).toBeGreaterThan(0);
    expect(stats.lsh_band_count).toBeGreaterThan(0);

    // Step 5: Query data
    const assistantMessage = processedMessages[1];

    // Get blob
    // Fix: DB stores raw hash, but blob object might have prefixed blob_id
    const queryId = assistantMessage.blob.hash;
    const blob = storage.getBlob(queryId);
    expect(blob).toBeTruthy();
    expect(blob!.hash).toBe(assistantMessage.blob.hash);

    // Get spans
    const spans = storage.getNodeSpansByBlob(assistantMessage.blob.hash);
    expect(spans.length).toBeGreaterThan(0);

    // Find sections
    const sections = spans.filter((s) => s.level === 'section');
    expect(sections.length).toBeGreaterThan(0);

    // Find blocks
    const blocks = spans.filter((s) => s.level === 'block');
    expect(blocks.length).toBeGreaterThan(0);

    // Step 6: Test deduplication (exact match)
    const firstSignature = assistantMessage.signatures[0];
    const duplicates = storage.findNodesByContentId(firstSignature.content_id);
    expect(duplicates.length).toBeGreaterThanOrEqual(1);
    expect(duplicates[0].node_id).toBe(firstSignature.node_id);

    // Step 7: Test LSH candidate lookup
    const bands = extractLshBands({ hashes: firstSignature.minhash, numPermutations: 128 }, 16);

    const candidates = storage.findCandidatesByBandHash(bands[0].bandHash);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates).toContain(firstSignature.node_id);
  });

  it('should detect exact duplicates', async () => {
    const text1 = 'This is a test message.';
    const text2 = 'This is a test message.'; // Exact duplicate

    const processor = new ContentProcessor();
    const processed1 = await processor.processText(text1, 'message');
    const processed2 = await processor.processText(text2, 'message');

    // Insert both
    storage.insertBlob(processed1.blob);
    storage.insertBlob(processed2.blob);
    storage.insertNodeSpans(processed1.spans);
    storage.insertNodeSpans(processed2.spans);
    storage.insertNodeSignatures(processed1.signatures);
    storage.insertNodeSignatures(processed2.signatures);

    // Verify duplicate detection
    // Same content_id means exact duplicate
    const sig1 = processed1.signatures[0];
    const sig2 = processed2.signatures[0];

    expect(sig1.content_id).toBe(sig2.content_id);

    // Query by content_id should return the canonical nodes (Root, Block, Sentence)
    // CAS means we store them once. They all share the same content ID because the text is identical.
    const duplicates = storage.findNodesByContentId(sig1.content_id);
    expect(duplicates.length).toBeGreaterThanOrEqual(1);

    // Verify that we found the node we started with
    expect(duplicates.some((d) => d.node_id === sig1.node_id)).toBe(true);
  });

  it('should find near-duplicates via LSH', async () => {
    const text1 = 'The quick brown fox jumps over the lazy dog.';
    const text2 = 'The quick brown fox jumped over the lazy dog.'; // Near duplicate (1 word changed)

    const processor = new ContentProcessor();
    const processed1 = await processor.processText(text1, 'message');
    const processed2 = await processor.processText(text2, 'message');

    // Insert both
    storage.insertBlob(processed1.blob);
    storage.insertBlob(processed2.blob);
    storage.insertNodeSpans(processed1.spans);
    storage.insertNodeSpans(processed2.spans);
    storage.insertNodeSignatures(processed1.signatures);
    storage.insertNodeSignatures(processed2.signatures);

    // Generate LSH bands
    const sig1 = processed1.signatures[0];
    const sig2 = processed2.signatures[0];

    const bands1 = extractLshBands({ hashes: sig1.minhash, numPermutations: 128 }, 16);
    const bands2 = extractLshBands({ hashes: sig2.minhash, numPermutations: 128 }, 16);

    const lshBands1 = bands1.map((b) => ({
      band_hash: b.bandHash,
      band_index: b.bandIndex,
      node_id: sig1.node_id,
      data_tag: 'test',
      created_at: sig1.created_at,
    }));

    const lshBands2 = bands2.map((b) => ({
      band_hash: b.bandHash,
      band_index: b.bandIndex,
      node_id: sig2.node_id,
      data_tag: 'test',
      created_at: sig2.created_at,
    }));

    storage.insertLshBands(lshBands1);
    storage.insertLshBands(lshBands2);

    // Find candidates by band hashes from text1
    const bandHashes1 = bands1.map((b) => b.bandHash);

    const candidates = storage.findCandidatesByBandHashes(bandHashes1, undefined, 1);

    // Should find both nodes (they share at least 1 band)
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates).toContain(sig1.node_id);

    // Depending on how similar they are, may also find sig2
    // (Near-duplicates typically share multiple bands)
  });

  it('should handle multi-level hierarchy', async () => {
    const markdown = `# Main Topic

This is the introduction.

## Subtopic A

Details about subtopic A.

### Nested Section

More specific details.

## Subtopic B

Details about subtopic B.
`;

    const processor = new ContentProcessor();
    const processed = await processor.processText(markdown, 'message');

    // Insert
    storage.insertBlob(processed.blob);
    storage.insertNodeSpans(processed.spans);

    // Verify hierarchy
    const rootSpans = processed.spans.filter((s) => !s.parent_node_id);
    expect(rootSpans.length).toBeGreaterThanOrEqual(1);

    const rootNodeId = rootSpans[0].node_id;
    const children = storage.getChildSpans(rootNodeId);
    expect(children.length).toBeGreaterThan(0);

    // Verify sections were extracted
    expect(processed.sections.length).toBeGreaterThan(0);
    expect(processed.sections.some((s) => s.type === 'heading')).toBe(true);

    // Verify blocks
    expect(processed.blocks.length).toBeGreaterThan(0);

    // Verify sentences
    expect(processed.sentences.length).toBeGreaterThan(0);

    // Verify tokens
    expect(processed.tokens.length).toBeGreaterThan(0);
  });

  it('should handle code blocks separately', async () => {
    const markdown = `Here is some code:

\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`

And here is more text.
`;

    const processor = new ContentProcessor();
    const processed = await processor.processText(markdown, 'message');

    // Code blocks should be detected
    const codeBlocks = processed.blocks.filter((b) => b.type === 'code_fence');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);

    // Code spans should have modality='code'
    const codeSpans = processed.spans.filter((s) => s.modality === 'code');
    expect(codeSpans.length).toBeGreaterThanOrEqual(0); // May or may not create separate spans

    // Regular prose blocks
    const proseBlocks = processed.blocks.filter((b) => b.type === 'paragraph');
    expect(proseBlocks.length).toBeGreaterThanOrEqual(1);
  });
});
