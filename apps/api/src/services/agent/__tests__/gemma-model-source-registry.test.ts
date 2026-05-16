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

  it('should explicitly mark artifact verification as false for pending variants', () => {
    const pendingCandidates = GEMMA_MODEL_SOURCES.filter((c) => c.id.includes('pending'));
    pendingCandidates.forEach((candidate) => {
      expect(candidate.source_verified).toBe(true);
      expect(candidate.artifact_verified).toBe(false);
      expect(candidate.runtime_compatibility_verified).toBe(false);
      expect(candidate.download_url).toBeNull();
    });
  });

  it('should not contain any older active artifacts', () => {
    const gemma2Candidates = GEMMA_MODEL_SOURCES.filter((c) => {
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

  it('should not mark runtime compatibility as verified without source proof', () => {
    GEMMA_MODEL_SOURCES.forEach((c) => {
      if (c.runtime_compatibility_verified) {
        expect(c.source_verified).toBe(true);
        expect(c.artifact_verified).toBe(true);
        expect(c.local_runtime_supported).toBe(true);
        expect(c.verification_notes).not.toContain('Pending official');
      }
    });
  });
});
