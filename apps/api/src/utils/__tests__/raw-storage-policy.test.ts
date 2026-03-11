import { describe, expect, it } from 'vitest';
import {
  assertRawStoragePolicy,
  isLocalFilesystemPath,
  resolveRawStorageMode,
} from '../raw-storage-policy';

describe('raw-storage-policy', () => {
  it('defaults RAW_STORAGE_MODE to local_only', () => {
    expect(resolveRawStorageMode(undefined)).toBe('local_only');
  });

  it('accepts local filesystem path candidates', () => {
    expect(isLocalFilesystemPath('C:\\keimenon\\storage')).toBe(true);
    expect(isLocalFilesystemPath('/tmp/keimenon/storage')).toBe(true);
    expect(isLocalFilesystemPath('./storage')).toBe(true);
    expect(isLocalFilesystemPath('~/.keimenon')).toBe(true);
  });

  it('rejects remote and UNC path candidates', () => {
    expect(isLocalFilesystemPath('s3://bucket/raw')).toBe(false);
    expect(isLocalFilesystemPath('https://example.com/data')).toBe(false);
    expect(isLocalFilesystemPath('\\\\server\\share\\raw')).toBe(false);
  });

  it('throws when RAW_STORAGE_MODE is not local_only', () => {
    expect(() =>
      assertRawStoragePolicy({
        rawStorageMode: 'managed',
        localDocsPath: '/tmp/keimenon',
        sqlitePath: '/tmp/keimenon/keimenon.db',
      })
    ).toThrow(/RAW_STORAGE_MODE must be 'local_only'/);
  });

  it('throws when any configured storage path is remote', () => {
    expect(() =>
      assertRawStoragePolicy({
        rawStorageMode: 'local_only',
        localDocsPath: 's3://keimenon-docs',
        sqlitePath: '/tmp/keimenon/keimenon.db',
        storagePath: './storage',
      })
    ).toThrow(/LOCAL_DOCS_PATH must resolve to a local filesystem path/);
  });

  it('passes when mode is local_only and all configured paths are local', () => {
    expect(() =>
      assertRawStoragePolicy({
        rawStorageMode: 'local_only',
        localDocsPath: '/tmp/keimenon',
        sqlitePath: '/tmp/keimenon/keimenon.db',
        storagePath: './storage',
      })
    ).not.toThrow();
  });
});
