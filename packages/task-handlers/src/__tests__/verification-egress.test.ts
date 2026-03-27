import { describe, expect, it } from 'vitest';
import { buildVerificationEgressPayload } from '../verification-egress';

describe('verification-egress', () => {
  it('ignores full raw override and still returns an excerpt', () => {
    const raw = 'x'.repeat(10_000);
    const result = buildVerificationEgressPayload(raw, {
      allowFullRawEgress: true,
      maxExcerptChars: 1024,
    });

    expect(result.mode).toBe('excerpt');
    expect(result.truncated).toBe(true);
    expect(result.egressChars).toBeLessThanOrEqual(1024);
    expect(result.content).toContain('[...SNIP...]');
  });

  it('sends excerpt by default when content exceeds cap', () => {
    const raw = `HEAD-${'a'.repeat(4000)}-MIDDLE-${'b'.repeat(4000)}-TAIL`;
    const result = buildVerificationEgressPayload(raw, {
      maxExcerptChars: 1200,
    });

    expect(result.mode).toBe('excerpt');
    expect(result.truncated).toBe(true);
    expect(result.egressChars).toBeLessThanOrEqual(1200);
    expect(result.content).toContain('[...SNIP...]');
    expect(result.content.startsWith('HEAD-')).toBe(true);
    expect(result.content.endsWith('TAIL')).toBe(true);
  });

  it('is deterministic for identical input and policy', () => {
    const raw = '0123456789'.repeat(1000);
    const a = buildVerificationEgressPayload(raw, { maxExcerptChars: 2048 });
    const b = buildVerificationEgressPayload(raw, { maxExcerptChars: 2048 });

    expect(a).toEqual(b);
  });
});
