import path from 'path';

const MAX_FILENAME_LENGTH = 128;
const SAFE_FILENAME_REGEX = /[^A-Za-z0-9._-]+/g;
const VALID_EXTENSION_REGEX = /^[A-Za-z0-9]{1,10}$/;

export interface SanitizedUploadFilename {
  sanitized: string;
  original: string;
}

/**
 * Sanitize user-provided upload filenames for safe filesystem usage.
 *
 * Rules:
 * - basename only
 * - strip control/path separator chars
 * - allow [A-Za-z0-9._-]
 * - collapse runs of invalid chars to "_"
 * - max 128 chars
 * - preserve extension when valid
 * - fallback to upload.json
 */
export function sanitizeUploadFilename(raw: string | null | undefined): SanitizedUploadFilename {
  const original = typeof raw === 'string' ? raw : '';
  const fallback = 'upload.json';
  if (!original.trim()) {
    return { sanitized: fallback, original };
  }

  const base = path.basename(original);
  const withoutControls = base.replace(/[\u0000-\u001F\u007F]/g, '').replace(/[\\/:"*?<>|]+/g, '_');

  const parsed = path.parse(withoutControls);
  const ext = parsed.ext.replace(/^\./, '');
  const safeExt = VALID_EXTENSION_REGEX.test(ext) ? ext.toLowerCase() : '';

  const safeBase = parsed.name
    .replace(SAFE_FILENAME_REGEX, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .trim();

  const baseWithFallback = safeBase.length > 0 ? safeBase : 'upload';
  const maxBaseLength =
    safeExt.length > 0 ? MAX_FILENAME_LENGTH - (safeExt.length + 1) : MAX_FILENAME_LENGTH;
  const truncatedBase = baseWithFallback.slice(0, Math.max(1, maxBaseLength));
  const sanitized = safeExt.length > 0 ? `${truncatedBase}.${safeExt}` : truncatedBase;

  return {
    sanitized: sanitized.length > 0 ? sanitized : fallback,
    original,
  };
}
