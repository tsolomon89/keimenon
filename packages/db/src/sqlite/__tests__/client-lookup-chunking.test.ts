import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { SQLiteClient } from '../client';

describe('SQLiteClient lookup chunking', () => {
  let db: Database.Database;
  let client: any;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        properties TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        content_hash TEXT
      );
    `);

    client = new SQLiteClient({ databasePath: ':memory:' } as any) as any;
    client.db = db;
  });

  afterEach(() => {
    db.close();
  });

  it('chunks high-cardinality content-hash duplicate lookups', async () => {
    const insertNode = db.prepare(`
      INSERT INTO nodes (id, kind, properties, account_id, created_at, content_hash)
      VALUES (?, 'source', ?, 'account_test', ?, ?)
    `);

    for (let index = 0; index < 25; index += 1) {
      insertNode.run(
        `node_hash_${index}`,
        JSON.stringify({ title: `Node ${index}` }),
        Date.now() + index,
        `hash_${index}`
      );
    }

    const probeHashes = Array.from({ length: 1400 }, (_, index) => `hash_${index}`);
    const result = await client.findDuplicatesByContentHash(probeHashes, 'account_test');

    expect(result.size).toBe(25);
    expect(result.get('hash_0')).toBe('node_hash_0');
    expect(result.get('hash_24')).toBe('node_hash_24');
  });

  it('chunks high-cardinality spine lookups by normalized text', async () => {
    const insertNode = db.prepare(`
      INSERT INTO nodes (id, kind, properties, account_id, created_at, content_hash)
      VALUES (?, 'Phrase', ?, 'account_test', ?, NULL)
    `);

    for (let index = 0; index < 18; index += 1) {
      insertNode.run(
        `phrase_${index}`,
        JSON.stringify({
          id: `phrase_${index}`,
          kind: 'Phrase',
          normalized_text: `topic ${index}`,
          account_id: 'account_test',
        }),
        Date.now() + index
      );
    }

    const probeTexts = Array.from({ length: 1300 }, (_, index) => `topic ${index}`);
    const result = await client.findSpineNodesByTexts('account_test', 'Phrase', probeTexts);

    expect(result.size).toBe(18);
    expect(result.get('topic 0')?.id).toBe('phrase_0');
    expect(result.get('topic 17')?.id).toBe('phrase_17');
  });
});
