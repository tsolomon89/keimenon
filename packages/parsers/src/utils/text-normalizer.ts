import { Buffer } from 'buffer';
import crypto from 'crypto';

/**
 * Normalization result with tracking of deviations
 */
export interface NormalizationResult {
  normalized: string;
  originalEncoding: string;
  originalLength: number;
  normalizedLength: number;
  deviations: string[];
  hash: string; // SHA-256 of normalized text
}

/**
 * Normalization configuration
 */
export interface NormalizationConfig {
  enforceNFC: boolean;        // Normalize to NFC (default: true)
  normalizeLF: boolean;       // Convert all newlines to LF (default: true)
  stripBOM: boolean;          // Remove UTF-8 BOM if present (default: true)
  trackDeviations: boolean;   // Track what changed (default: true)
}

const DEFAULT_CONFIG: NormalizationConfig = {
  enforceNFC: true,
  normalizeLF: true,
  stripBOM: true,
  trackDeviations: true,
};

/**
 * Normalize text to canonical form: UTF-8, NFC, LF newlines
 *
 * This is the FIRST step for all content processing. It ensures:
 * - UTF-8 encoding (detect and warn on others)
 * - NFC normalization (NOT NFKC - preserves semantic distinctions)
 * - LF newlines (convert CRLF → LF)
 * - Consistent hashing across platforms
 *
 * @param input - Buffer or string to normalize
 * @param config - Normalization options
 * @returns Normalized text with deviations tracked
 */
export function normalizeText(
  input: Buffer | string,
  config: Partial<NormalizationConfig> = {}
): NormalizationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const deviations: string[] = [];

  // 1. Convert to string if Buffer
  let text: string;
  let originalEncoding = 'utf-8';

  if (Buffer.isBuffer(input)) {
    // Detect encoding (simple heuristic - assume UTF-8, warn if suspicious)
    if (hasNonUTF8Bytes(input)) {
      deviations.push('Non-UTF-8 bytes detected, treating as UTF-8');
      // In production, could use chardet library for encoding detection
    }
    text = input.toString('utf-8');
  } else {
    text = input;
  }

  const originalLength = text.length;

  // 2. Strip UTF-8 BOM if present
  if (cfg.stripBOM && text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
    if (cfg.trackDeviations) {
      deviations.push('UTF-8 BOM removed');
    }
  }

  // 3. Normalize to NFC (Canonical Composition)
  // Why NFC and not NFKC?
  // - NFC preserves semantic distinctions (e.g., ① vs 1)
  // - NFKC would collapse too much (ligatures, super/subscripts)
  if (cfg.enforceNFC) {
    const beforeNFC = text;
    text = text.normalize('NFC');
    if (cfg.trackDeviations && text !== beforeNFC) {
      deviations.push('NFC normalization applied');
    }
  }

  // 4. Normalize newlines to LF
  if (cfg.normalizeLF) {
    const crlfCount = (text.match(/\r\n/g) || []).length;
    const crCount = (text.match(/\r(?!\n)/g) || []).length;

    if (crlfCount > 0 || crCount > 0) {
      // Replace CRLF with LF, then any remaining CR with LF
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (cfg.trackDeviations) {
        if (crlfCount > 0) {
          deviations.push(`${crlfCount} CRLF → LF conversions`);
        }
        if (crCount > 0) {
          deviations.push(`${crCount} CR → LF conversions`);
        }
      }
    }
  }

  const normalizedLength = text.length;

  // 5. Compute SHA-256 hash of normalized text
  const hash = crypto.createHash('sha256')
    .update(text, 'utf-8')
    .digest('hex');

  return {
    normalized: text,
    originalEncoding,
    originalLength,
    normalizedLength,
    deviations,
    hash,
  };
}

/**
 * Normalize a Buffer to canonical UTF-8 bytes
 * Returns Buffer instead of string for direct storage
 */
export function normalizeToBuffer(
  input: Buffer | string,
  config: Partial<NormalizationConfig> = {}
): { buffer: Buffer; result: NormalizationResult } {
  const result = normalizeText(input, config);
  const buffer = Buffer.from(result.normalized, 'utf-8');
  return { buffer, result };
}

/**
 * Simple heuristic to detect non-UTF-8 bytes
 * (In production, use a proper encoding detection library like chardet)
 */
function hasNonUTF8Bytes(buffer: Buffer): boolean {
  try {
    // Try to decode as UTF-8 - if it throws, it's not valid UTF-8
    buffer.toString('utf-8');

    // Check for UTF-16 BOM
    if (buffer.length >= 2) {
      const firstTwo = buffer.readUInt16BE(0);
      if (firstTwo === 0xFEFF || firstTwo === 0xFFFE) {
        return true; // UTF-16 BOM
      }
    }

    // Check for common non-UTF-8 patterns
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
      const byte = buffer[i];
      // Look for invalid UTF-8 start bytes
      if (byte === 0x00) continue; // Null bytes are OK in some contexts
      if ((byte & 0x80) === 0) continue; // ASCII
      if ((byte & 0xE0) === 0xC0) continue; // Valid 2-byte start
      if ((byte & 0xF0) === 0xE0) continue; // Valid 3-byte start
      if ((byte & 0xF8) === 0xF0) continue; // Valid 4-byte start
      if ((byte & 0xC0) === 0x80) continue; // Valid continuation byte
      // If we get here, suspicious byte found
      return true;
    }

    return false;
  } catch (e) {
    return true; // Decoding failed
  }
}

/**
 * Validate that text is in canonical form (UTF-8, NFC, LF)
 * Returns null if valid, otherwise returns list of violations
 */
export function validateCanonicalForm(text: string): string[] | null {
  const violations: string[] = [];

  // Check for BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    violations.push('UTF-8 BOM present');
  }

  // Check if NFC normalized
  const nfc = text.normalize('NFC');
  if (nfc !== text) {
    violations.push('Not in NFC form');
  }

  // Check for non-LF newlines
  if (text.includes('\r')) {
    violations.push('Contains CR or CRLF newlines');
  }

  return violations.length > 0 ? violations : null;
}

/**
 * Compute SHA-256 hash of text in canonical form
 * Convenience wrapper for consistent hashing
 */
export function hashCanonical(text: string): string {
  return crypto.createHash('sha256')
    .update(text, 'utf-8')
    .digest('hex');
}

/**
 * Batch normalize multiple texts
 * Useful for processing multiple files/segments
 */
export function normalizeTexts(
  inputs: Array<Buffer | string>,
  config: Partial<NormalizationConfig> = {}
): NormalizationResult[] {
  return inputs.map(input => normalizeText(input, config));
}
