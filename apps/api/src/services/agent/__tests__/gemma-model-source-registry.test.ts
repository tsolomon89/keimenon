import { describe, it, expect } from 'vitest';
import { GEMMA_MODEL_SOURCES, GemmaModelSourceRegistry } from '../gemma-model-source-registry';

describe('GemmaModelSourceRegistry', () => {
  it('should only contain Gemma 4 active source candidates', () => {
    GEMMA_MODEL_SOURCES.forEach((candidate) => {
      expect(candidate.display_name).toContain('Gemma 4');
    });
  });

  it('should not claim artifact verification without a download URL', () => {
    GEMMA_MODEL_SOURCES.forEach((candidate) => {
      if (candidate.artifact_verified) {
        expect(candidate.download_url).not.toBeNull();
        expect(candidate.download_url).toBeDefined();
      }
    });
  });

  it('should contain the core Gemma 4 variants (E2B, E4B, 26B, 31B)', () => {
    const variants = GEMMA_MODEL_SOURCES.map((c) => c.variant?.toLowerCase());
    expect(variants).toContain('e2b');
    expect(variants).toContain('e4b');
    expect(variants).toContain('26b');
    expect(variants).toContain('31b');
  });

  it('should explicitly mark artifact verification as false and have a null download url', () => {
    GEMMA_MODEL_SOURCES.forEach((candidate) => {
      expect(candidate.source_verified).toBe(true);
      expect(candidate.artifact_verified).toBe(false);
      expect(candidate.runtime_compatibility_verified).toBe(false);
      expect(candidate.download_url).toBeNull();
    });
  });
});
