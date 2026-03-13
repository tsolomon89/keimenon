import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectParserMode, expandJsonObjectPayload } from './import.worker';

describe('import.worker parser selection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keimenon-import-worker-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects JSON array payloads', () => {
    const file = path.join(tempDir, 'array.json');
    fs.writeFileSync(file, JSON.stringify([{ id: 1 }, { id: 2 }]), 'utf8');
    expect(detectParserMode(file, 'application/json')).toBe('json_array');
  });

  it('detects JSON object payloads', () => {
    const file = path.join(tempDir, 'object.json');
    fs.writeFileSync(file, JSON.stringify({ id: 1, messages: [] }), 'utf8');
    expect(detectParserMode(file, 'application/json')).toBe('json_object');
  });

  it('detects JSONL by extension', () => {
    const file = path.join(tempDir, 'events.jsonl');
    fs.writeFileSync(file, '{"id":1}\n{"id":2}\n', 'utf8');
    expect(detectParserMode(file, 'application/json')).toBe('jsonl');
  });

  it('detects JSONL by mime type', () => {
    const file = path.join(tempDir, 'events.txt');
    fs.writeFileSync(file, '{"id":1}\n{"id":2}\n', 'utf8');
    expect(detectParserMode(file, 'application/x-ndjson')).toBe('jsonl');
  });

  it('expands object wrappers into conversation arrays', () => {
    const payload = { conversations: [{ id: 'a' }, { id: 'b' }] };
    const expanded = expandJsonObjectPayload(payload);
    expect(expanded).toHaveLength(2);
    expect(expanded[0]).toEqual({ id: 'a' });
  });
});
