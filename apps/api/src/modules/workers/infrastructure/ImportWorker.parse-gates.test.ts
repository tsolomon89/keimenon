import { describe, expect, it } from 'vitest';
import { evaluateParseQualityGate } from './ImportWorker';

describe('ImportWorker parse quality gate', () => {
  it('returns PARSE_FAILED when parsing errors occur and no conversations are imported', () => {
    const result = evaluateParseQualityGate({
      parseAttemptCount: 5,
      parseErrorCount: 5,
      conversationsProcessed: 0,
      parseErrorSamples: [{ index: 0, message: 'Invalid JSON' }],
    });

    expect(result?.code).toBe('PARSE_FAILED');
    expect(result?.details.parseErrorCount).toBe(5);
    expect(result?.details.attemptedItems).toBe(5);
  });

  it('returns PARSE_ERROR_RATE_EXCEEDED when error rate is >= 30% and attempts are >= 100', () => {
    const result = evaluateParseQualityGate({
      parseAttemptCount: 120,
      parseErrorCount: 36,
      conversationsProcessed: 10,
      parseErrorSamples: [{ index: 10, message: 'Malformed item' }],
    });

    expect(result?.code).toBe('PARSE_ERROR_RATE_EXCEEDED');
    expect(result?.details.errorRate).toBeCloseTo(0.3, 5);
    expect(result?.details.threshold).toBe(0.3);
    expect(result?.details.minimumAttempts).toBe(100);
  });

  it('passes when error rate is below threshold', () => {
    const result = evaluateParseQualityGate({
      parseAttemptCount: 200,
      parseErrorCount: 40,
      conversationsProcessed: 50,
      parseErrorSamples: [],
    });

    expect(result).toBeNull();
  });

  it('passes when attempts are below minimum sample size', () => {
    const result = evaluateParseQualityGate({
      parseAttemptCount: 50,
      parseErrorCount: 40,
      conversationsProcessed: 10,
      parseErrorSamples: [],
    });

    expect(result).toBeNull();
  });
});
