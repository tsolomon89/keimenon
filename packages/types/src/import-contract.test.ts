import { describe, expect, it } from 'vitest';
import { normalizeImportOptions } from './import-contract';

describe('import contract normalization', () => {
  it('defaults agent bootstrap to manual', () => {
    const normalized = normalizeImportOptions();
    expect(normalized.agent.bootstrap).toBe('manual');
  });

  it('preserves backward compatibility for legacy payloads without agent config', () => {
    const normalized = normalizeImportOptions({
      extraction: { includeUser: true, includeAssistant: true },
      minMessageLength: 32,
      processingMode: 'hybrid',
      branches: 'separate',
      extractCode: true,
      codeSettings: {
        minLength: 10,
        languages: ['ts'],
        groupBy: 'language',
        deduplicate: true,
        sourceHandling: 'keep_inline',
      },
      duplicateDetection: {
        enabled: true,
        exactMatch: true,
        similarityThreshold: 0.91,
        crossConversation: true,
        algorithm: 'jaccard',
        normalizeTokens: true,
        minTokenOverlap: 4,
        lengthRatioTolerance: 0.2,
        ignoreWhitespace: true,
        ignoreCase: false,
        ignoreTimestamp: true,
        requireReview: true,
        autoApproveExact: false,
        autoMergeThreshold: 0.95,
      },
    });

    expect(normalized.processingMode).toBe('hybrid');
    expect(normalized.branches).toBe('separate');
    expect(normalized.agent.bootstrap).toBe('manual');
  });
});
