import crypto from 'crypto';

/**
 * Generate SHA-256 hash of normalized text
 */
export function fingerprint(text: string): string {
  const normalized = normalizeText(text);
  return 'sha256:' + crypto
    .createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex');
}

/**
 * Normalize text for consistent hashing
 * - Trim whitespace
 * - Normalize line endings
 * - Remove excessive whitespace
 */
export function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' '); // Collapse spaces
}

/**
 * Tokenize text for Jaccard similarity
 * Split on non-word characters, lowercase
 */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter(token => token.length > 0);
  return new Set(tokens);
}

/**
 * Calculate Jaccard similarity between two token sets
 * J(A,B) = |A ∩ B| / |A ∪ B|
 */
export function jaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Normalize title for bucketing
 * - Lowercase
 * - Trim
 * - Remove common noise (dates, numbers, etc.)
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\d{4}-\d{2}-\d{2}/g, '') // Remove dates
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}
