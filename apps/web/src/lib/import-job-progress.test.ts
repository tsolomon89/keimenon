import { describe, expect, it } from 'vitest';
import { ImportJobStage } from '@keimenon/types';
import { deriveImportProgress, normalizeImportProgressPercent } from './import-job-progress';

describe('deriveImportProgress', () => {
  it('maps backend running imports to active parsing fallback, never queued', () => {
    const derived = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: {},
    });

    expect(derived.status).toBe('parsing');
    expect(derived.stage).toBe('parsing');
  });

  it('ignores queued-like progress hints while backend status is running', () => {
    const derived = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { message: 'Import is queued and waiting to start...' },
    });

    expect(derived.status).not.toBe('queued');
    expect(derived.stage).not.toBe('queued');
  });

  it('preserves last meaningful stage when backend status is blocked', () => {
    const derived = deriveImportProgress({
      backendStatus: 'blocked',
      jobType: 'import',
      previousStatus: 'indexing',
      progress: { message: 'Paused by user' },
    });

    expect(derived.status).toBe('blocked');
    expect(derived.stage).toBe('indexing');
  });

  it('maps backend ImportJobStage values consistently across views', () => {
    const parse = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.PARSE },
    });
    const normalize = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.NORMALIZE },
    });
    const dedupe = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.DEDUPE },
    });
    const atomic = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.ATOMIC_EXTRACT },
    });
    const packet = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.PACKET_DERIVE },
    });
    const layerLink = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.LAYER_LINK },
    });

    expect(parse.status).toBe('parsing');
    expect(normalize.status).toBe('normalizing');
    expect(dedupe.status).toBe('linking');
    expect(atomic.status).toBe('indexing');
    expect(packet.status).toBe('indexing');
    expect(layerLink.status).toBe('linking');
  });

  it('keeps running stage monotonic when later signals regress to earlier stages', () => {
    const linking = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.DEDUPE },
      previousStatus: 'indexing',
    });

    const regressedSignal = deriveImportProgress({
      backendStatus: 'running',
      jobType: 'import',
      progress: { stage: ImportJobStage.CANONICALIZE },
      previousStatus: linking.status,
    });

    expect(linking.status).toBe('linking');
    expect(regressedSignal.status).toBe('linking');
    expect(regressedSignal.stage).toBe('linking');
  });

  it('normalizes running progress percent to stay monotonic and stage-consistent', () => {
    const normalized = normalizeImportProgressPercent({
      backendStatus: 'running',
      status: 'indexing',
      rawPercent: 12,
      previousPercent: 40,
    });

    expect(normalized).toBeGreaterThanOrEqual(40);
  });

  it('returns 100 percent for succeeded imports regardless of raw payload', () => {
    const normalized = normalizeImportProgressPercent({
      backendStatus: 'succeeded',
      status: 'done',
      rawPercent: 86,
      previousPercent: 92,
    });

    expect(normalized).toBe(100);
  });

  it('applies stage-aware shaping for long-running layer link heartbeats', () => {
    const normalized = normalizeImportProgressPercent({
      backendStatus: 'running',
      status: 'linking',
      rawPercent: 86,
      previousPercent: 86,
      stage: ImportJobStage.LAYER_LINK,
      metadata: { elapsedMsInBatch: 2 * 60 * 60 * 1000 },
    });

    expect(normalized).toBeGreaterThan(86);
    expect(normalized).toBeLessThanOrEqual(99);
  });
});
