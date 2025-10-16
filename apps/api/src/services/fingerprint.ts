import crypto from 'crypto';
import { URL } from 'url';

/**
 * Generate SHA-256 fingerprint for content
 */
export function generateFingerprint(content: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Canonicalize URL for consistent fingerprinting
 * Removes query params, fragments, trailing slashes, etc.
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Normalize protocol
    parsed.protocol = parsed.protocol.toLowerCase();

    // Normalize host
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    // Remove trailing slash from path
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Remove fragment
    parsed.hash = '';

    // Sort query params (optional - for stricter matching)
    const params = new URLSearchParams(parsed.search);
    const sortedParams = Array.from(params.entries()).sort();
    parsed.search = new URLSearchParams(sortedParams).toString();

    return parsed.toString();
  } catch (error) {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Generate fingerprint for a file
 */
export async function fingerprintFile(
  filepath: string
): Promise<{ fingerprint: string; size: number }> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filepath);

  return {
    fingerprint: generateFingerprint(content),
    size: content.length,
  };
}

/**
 * Generate content-based ID for node
 */
export function generateNodeId(prefix: string, fingerprint: string): string {
  // Use first 12 chars of fingerprint for ID
  const shortHash = fingerprint.slice(0, 12);
  return `${prefix}_${shortHash}`;
}
