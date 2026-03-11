import os from 'os';

const REMOTE_SCHEME_REGEX = /^([a-z][a-z0-9+.-]*):\/\//i;
const UNC_PATH_REGEX = /^\\\\/;
const WINDOWS_UNC_DEVICE_REGEX = /^\\\\\?\\UNC\\/i;

const REMOTE_SCHEMES = new Set([
  'http',
  'https',
  'ftp',
  'ftps',
  's3',
  'gs',
  'az',
  'azure',
  'nfs',
  'smb',
  'ssh',
]);

export interface RawStoragePolicyInput {
  rawStorageMode?: string | null;
  localDocsPath?: string | null;
  sqlitePath?: string | null;
  storagePath?: string | null;
}

export interface RawStoragePolicyPathCheck {
  key: 'LOCAL_DOCS_PATH' | 'SQLITE_PATH' | 'STORAGE_PATH';
  value: string;
}

function normalizePathCandidate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('~')) {
    return trimmed;
  }

  return trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
}

export function resolveRawStorageMode(inputMode?: string | null): string {
  const candidate = inputMode ?? process.env.RAW_STORAGE_MODE ?? 'local_only';
  return String(candidate).trim().toLowerCase();
}

export function isLocalFilesystemPath(pathCandidate: string): boolean {
  const candidate = normalizePathCandidate(pathCandidate);

  if (!candidate) {
    return false;
  }

  const schemeMatch = candidate.match(REMOTE_SCHEME_REGEX);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (REMOTE_SCHEMES.has(scheme)) {
      return false;
    }
  }

  if (UNC_PATH_REGEX.test(candidate) || WINDOWS_UNC_DEVICE_REGEX.test(candidate)) {
    return false;
  }

  return true;
}

export function assertRawStoragePolicy(input: RawStoragePolicyInput = {}): void {
  const mode = resolveRawStorageMode(input.rawStorageMode);
  if (mode !== 'local_only') {
    throw new Error(
      `RAW_STORAGE_MODE must be 'local_only'. Received '${input.rawStorageMode ?? process.env.RAW_STORAGE_MODE ?? 'undefined'}'.`
    );
  }

  const pathChecks: RawStoragePolicyPathCheck[] = [
    {
      key: 'LOCAL_DOCS_PATH',
      value: String(input.localDocsPath ?? process.env.LOCAL_DOCS_PATH ?? '').trim(),
    },
    {
      key: 'SQLITE_PATH',
      value: String(input.sqlitePath ?? process.env.SQLITE_PATH ?? '').trim(),
    },
    {
      key: 'STORAGE_PATH',
      value: String(input.storagePath ?? process.env.STORAGE_PATH ?? '').trim(),
    },
  ];

  const candidates = pathChecks.filter((entry) => entry.value.length > 0);

  for (const candidate of candidates) {
    if (!isLocalFilesystemPath(candidate.value)) {
      throw new Error(
        `${candidate.key} must resolve to a local filesystem path under RAW_STORAGE_MODE=local_only. Received '${candidate.value}'.`
      );
    }
  }
}
