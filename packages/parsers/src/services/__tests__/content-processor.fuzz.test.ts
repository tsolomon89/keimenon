import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ContentProcessor } from '../content-processor';
import { TestingFactory } from '../../testing/TestingFactory';

describe('ContentProcessor (Fuzzing)', () => {
  const processor = new ContentProcessor();

  it('should not crash on any text input (No Crash)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const result = await processor.processText(text);
        expect(result).toBeDefined();
        expect(result.blob).toBeDefined();
        expect(result.spans).toBeDefined();
      })
    );
  });

  it('should maintain span hierarchy invariants', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const result = await processor.processText(text);
        const blobSize = result.blob.size_bytes;

        for (const span of result.spans) {
          // Invariant 1: Span bounds must be valid
          expect(span.byte_start).toBeGreaterThanOrEqual(0);
          expect(span.byte_end).toBeGreaterThanOrEqual(span.byte_start);
          expect(span.byte_end).toBeLessThanOrEqual(blobSize);

          // Invariant 2: Parent relationship check (if parent exists, child must be inside)
          if (span.parent_node_id) {
            const parent = result.spans.find(s => s.node_id === span.parent_node_id);
            // Root might ideally always exist, but in partial processing it depends.
            // If parent is found, check containment
            if (parent) {
               expect(span.byte_start).toBeGreaterThanOrEqual(parent.byte_start);
               expect(span.byte_end).toBeLessThanOrEqual(parent.byte_end);
            }
          }
        }
      })
    );
  });

  it('should be deterministic/idempotent for same input', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const result1 = await processor.processText(text);
        const result2 = await processor.processText(text);

        expect(result1.blob.hash).toBe(result2.blob.hash);
        expect(result1.blob.blob_id).toBe(result2.blob.blob_id);
        expect(result1.signatures.length).toBe(result2.signatures.length);
        
        if (result1.signatures.length > 0) {
           expect(result1.signatures[0].minhash).toEqual(result2.signatures[0].minhash);
        }
      })
    );
  });
});
