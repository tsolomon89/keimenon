import { describe, it, expect } from 'vitest';
import { gemmaModelSourceRegistry } from '../services/agent/gemma-model-source-registry';

describe('GemmaModelSourceRegistry', () => {
  it('should not contain any older active artifacts', async () => {
    const candidates = await gemmaModelSourceRegistry.getCandidates();
    const gemma2Candidates = candidates.filter((c) => {
      const lowerId = c.id.toLowerCase();
      const lowerName = c.display_name.toLowerCase();
      return (
        lowerId.includes('gemma' + '-2') ||
        lowerName.includes('gemma' + ' 2') ||
        lowerName.includes('2b it')
      );
    });
    expect(gemma2Candidates).toHaveLength(0);
  });

  it('should not mark artifacts as verified without exact source URL and explicit format', async () => {
    const candidates = await gemmaModelSourceRegistry.getCandidates();
    for (const c of candidates) {
      if (c.artifact_verified) {
        expect(c.source_url).toBeTruthy();
        expect(c.source_url).not.toBe('https://deepmind.google/models/gemma/'); // Generic landing page is not proof
        expect(c.runtime_format).not.toBe('unknown');
        // If it's an official litert artifact, it should have a specific source_kind
        if (c.source_kind === 'official_huggingface') {
          expect(c.download_url).toBeTruthy();
        }
      }
    }
  });

  it('should not mark runtime compatibility as verified without source proof', async () => {
    const candidates = await gemmaModelSourceRegistry.getCandidates();
    for (const c of candidates) {
      if (c.runtime_compatibility_verified) {
        expect(c.source_verified).toBe(true);
        expect(c.artifact_verified).toBe(true);
        expect(c.local_runtime_supported).toBe(true);
        expect(c.verification_notes).not.toContain('Pending official');
      }
    }
  });

  it('should maintain all four core Gemma 4 variants', async () => {
    const candidates = await gemmaModelSourceRegistry.getCandidates();

    const e2b = candidates.find((c) => c.model_generation === 'gemma-4' && c.variant === 'e2b');
    const e4b = candidates.find((c) => c.model_generation === 'gemma-4' && c.variant === 'e4b');
    const b26 = candidates.find((c) => c.model_generation === 'gemma-4' && c.variant === '26b');
    const b31 = candidates.find((c) => c.model_generation === 'gemma-4' && c.variant === '31b');

    expect(e2b).toBeDefined();
    expect(e4b).toBeDefined();
    expect(b26).toBeDefined();
    expect(b31).toBeDefined();
  });
});
