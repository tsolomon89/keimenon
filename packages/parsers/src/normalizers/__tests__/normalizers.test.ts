import { describe, it, expect } from 'vitest';
import { normalizeText, validateCanonicalForm } from '../../utils/text-normalizer';
import { generateBlobId, generateNodeKey, generateContentId } from '../../utils/id-generator';
import { JsonNormalizer, jsonEquals } from '../json-normalizer';
import { CodeNormalizer } from '../code-normalizer';

describe('Text Normalizer', () => {
  it('should normalize CRLF to LF', () => {
    const input = 'line1\r\nline2\r\nline3';
    const result = normalizeText(input);

    expect(result.normalized).toBe('line1\nline2\nline3');
    expect(result.deviations).toContain('2 CRLF → LF conversions');
  });

  it.skip('should apply NFC normalization', () => {
    const input = 'naï\u0308ve'; // NFD form (ï is separate)
    const result = normalizeText(input);

    expect(result.normalized).toBe('naïve'); // NFC form
    expect(result.deviations).toContain('NFC normalization applied');
  });

  it('should strip UTF-8 BOM', () => {
    const input = '\uFEFFHello';
    const result = normalizeText(input);

    expect(result.normalized).toBe('Hello');
    expect(result.deviations).toContain('UTF-8 BOM removed');
  });

  it('should validate canonical form', () => {
    const violations = validateCanonicalForm('line1\r\nline2');
    expect(violations).toContain('Contains CR or CRLF newlines');
  });

  it('should hash consistently', () => {
    const text1 = normalizeText('hello\r\nworld');
    const text2 = normalizeText('hello\nworld');

    expect(text1.hash).toBe(text2.hash);
  });
});

describe('ID Generator', () => {
  it('should generate deterministic BlobIds', () => {
    const buffer = Buffer.from('test content', 'utf-8');
    const id1 = generateBlobId(buffer);
    const id2 = generateBlobId(buffer);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^blob_[0-9a-f]{64}$/);
  });

  it('should generate deterministic NodeKeys', () => {
    const blobId = 'blob_abc123';
    const key1 = generateNodeKey(blobId, 'block', 'code', 0, 100);
    const key2 = generateNodeKey(blobId, 'block', 'code', 0, 100);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^nk_[0-9a-f]{64}$/);
  });

  it('should generate different NodeKeys for different spans', () => {
    const blobId = 'blob_abc123';
    const key1 = generateNodeKey(blobId, 'block', 'code', 0, 100);
    const key2 = generateNodeKey(blobId, 'block', 'code', 0, 101);

    expect(key1).not.toBe(key2);
  });

  it('should generate deterministic ContentIds', () => {
    const text = 'function foo() { return 42; }';
    const id1 = generateContentId(text);
    const id2 = generateContentId(text);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^cid_[0-9a-f]{64}$/);
  });
});

describe('JSON Normalizer', () => {
  it('should sort keys deterministically', () => {
    const json1 = '{"b": 2, "a": 1}';
    const json2 = '{"a": 1, "b": 2}';

    expect(jsonEquals(json1, json2)).toBe(true);
  });

  it('should remove volatile fields', () => {
    const normalizer = new JsonNormalizer({
      volatileFields: ['id', 'timestamp'],
      sortKeys: true,
      indent: 2,
      compact: false,
    });

    const json = '{"id": 123, "name": "Alice", "timestamp": 1234567890}';
    const result = normalizer.normalize(json);

    expect(result.normalized).not.toContain('id');
    expect(result.normalized).not.toContain('timestamp');
    expect(result.normalized).toContain('Alice');
    expect(result.removedFields).toEqual(['id', 'timestamp']);
  });

  it('should handle nested objects', () => {
    const normalizer = new JsonNormalizer({
      volatileFields: ['id', '*.timestamp'],
      sortKeys: true,
      indent: 2,
      compact: false,
    });

    const json =
      '{"user": {"id": 1, "name": "Bob", "timestamp": 999}, "post": {"id": 2, "title": "Hello"}}';
    const result = normalizer.normalize(json);

    expect(result.removedFields).toContain('user.id');
    expect(result.removedFields).toContain('user.timestamp');
    expect(result.removedFields).toContain('post.id');
  });

  it('should produce same content_id for equivalent JSON', () => {
    const normalizer = new JsonNormalizer();

    const json1 = '{"x": 1, "y": 2}';
    const json2 = '{"y": 2, "x": 1}';

    const result1 = normalizer.normalize(json1);
    const result2 = normalizer.normalize(json2);

    expect(result1.content_id).toBe(result2.content_id);
  });
});

describe('Code Normalizer', () => {
  it('should normalize whitespace', () => {
    const normalizer = new CodeNormalizer({
      normalizeWhitespace: true,
      stripComments: false,
      indentSize: 2,
      generateTokenSketch: false,
      normalizeLiterals: false,
      alphaRename: false,
    });

    const code = 'function   foo()   {   return   42;   }';
    const result = normalizer.normalize(code, 'javascript');

    expect(result.normalized).not.toMatch(/\s{2,}/); // No double spaces
  });

  it('should strip comments', () => {
    const normalizer = new CodeNormalizer({
      stripComments: true,
    });

    const code = 'function foo() {\n  // comment\n  return 42;\n}';
    const result = normalizer.normalize(code, 'javascript');

    expect(result.normalized).not.toContain('// comment');
  });

  it('should generate token sketch', () => {
    const normalizer = new CodeNormalizer({
      generateTokenSketch: true,
      indentSize: 2,
      normalizeWhitespace: false,
      normalizeLiterals: false,
      alphaRename: false,
      stripComments: false,
    });

    const code = 'const x = 42;';
    const result = normalizer.normalize(code, 'javascript');

    expect(result.token_sketch).toContain('kw'); // const
    expect(result.token_sketch).toContain('ident'); // x
    expect(result.token_sketch).toContain('op'); // =
    expect(result.token_sketch).toContain('num'); // 42
  });

  it.skip('should produce same content_id for semantically equivalent code', () => {
    const normalizer = new CodeNormalizer({
      normalizeWhitespace: true,
      stripComments: true,
    });

    const code1 = 'function foo() {\n\n  return 42;\n}';
    const code2 = 'function   foo()   {\n  // comment\n  return   42;\n}';

    const result1 = normalizer.normalize(code1, 'javascript');
    const result2 = normalizer.normalize(code2, 'javascript');

    expect(result1.content_id).toBe(result2.content_id);
  });

  it('should handle different languages', () => {
    const normalizer = new CodeNormalizer();

    const pythonCode = 'def foo():\n    return 42';
    const javaCode = 'public int foo() { return 42; }';

    const pythonResult = normalizer.normalize(pythonCode, 'python');
    const javaResult = normalizer.normalize(javaCode, 'java');

    expect(pythonResult.content_id).not.toBe(javaResult.content_id);
    expect(pythonResult.language).toBe('python');
    expect(javaResult.language).toBe('java');
  });
});

describe('Integration: End-to-End Normalization', () => {
  it('should normalize text → code → generate IDs', () => {
    // 1. Normalize text (UTF-8, NFC, LF)
    const rawCode = 'function foo() {\r\n  return 42;\r\n}';
    const textResult = normalizeText(rawCode);

    // 2. Normalize code
    const codeNormalizer = new CodeNormalizer({
      normalizeWhitespace: true,
    });
    const codeResult = codeNormalizer.normalize(textResult.normalized, 'javascript');

    // 3. Generate IDs
    const blobBuffer = Buffer.from(textResult.normalized, 'utf-8');
    const blobId = generateBlobId(blobBuffer);
    const nodeKey = generateNodeKey(blobId, 'block', 'code', 0, textResult.normalized.length);
    const contentId = codeResult.content_id;

    expect(blobId).toMatch(/^blob_/);
    expect(nodeKey).toMatch(/^nk_/);
    expect(contentId).toMatch(/^cid_/);
    expect(codeResult.stepsApplied).toContain('tokenize');
  });

  it.skip('should detect duplicate code across different sources', () => {
    const codeNormalizer = new CodeNormalizer({
      normalizeWhitespace: true,
      stripComments: true,
      indentSize: 2,
      generateTokenSketch: false,
      normalizeLiterals: false,
      alphaRename: false,
    });

    // Same code in different formats
    const markdown = '```js\nfunction foo() { return 42; }\n```';
    const json = '{"code": "function foo() { return 42; }"}';
    const raw = 'function foo() { return 42; }';

    // Extract code from markdown (simplified)
    const mdCode = markdown.match(/```js\n(.*?)\n```/s)?.[1] || '';

    // Extract code from JSON
    const jsonObj = JSON.parse(json);
    const jsonCode = jsonObj.code;

    // Normalize all three
    const result1 = codeNormalizer.normalize(mdCode, 'javascript');
    const result2 = codeNormalizer.normalize(jsonCode, 'javascript');
    const result3 = codeNormalizer.normalize(raw, 'javascript');

    // All should have same content_id
    expect(result1.content_id).toBe(result2.content_id);
    expect(result2.content_id).toBe(result3.content_id);
  });
});
