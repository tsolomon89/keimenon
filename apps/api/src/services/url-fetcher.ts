import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

/**
 * URL Fetcher Service with SSRF Prevention
 *
 * Securely fetches content from URLs while preventing:
 * - Server-Side Request Forgery (SSRF) attacks
 * - Access to internal/private networks
 * - Excessive resource consumption
 */

// SSRF Prevention: Blocked IP ranges
const BLOCKED_IP_PATTERNS = [
  /^127\./, // Loopback (127.0.0.0/8)
  /^10\./, // Private Class A (10.0.0.0/8)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B (172.16.0.0/12)
  /^192\.168\./, // Private Class C (192.168.0.0/16)
  /^169\.254\./, // Link-local (169.254.0.0/16)
  /^0\./, // Current network (0.0.0.0/8)
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^198\.1[8-9]\./, // Benchmark testing
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
  /^fd/i, // IPv6 unique local
];

const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'gopher:', 'data:', 'javascript:'];

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export interface URLFetchConfig {
  timeoutMs: number;
  maxSizeBytes: number;
  userAgent: string;
  followRedirects: boolean;
  maxRedirects: number;
}

export interface URLFetchResult {
  html: string;
  status: number;
  headers: Record<string, string>;
  finalUrl: string;
  contentType: string;
  contentLength: number;
  fetchedAt: number;
}

export interface URLValidationResult {
  valid: boolean;
  reason?: string;
  canonicalUrl?: string;
}

const DEFAULT_CONFIG: URLFetchConfig = {
  timeoutMs: 30000,
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  userAgent: 'Keimenon/1.0 (URL Content Fetcher)',
  followRedirects: true,
  maxRedirects: 5,
};

export class URLFetcherService {
  private config: URLFetchConfig;

  constructor(config: Partial<URLFetchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate URL for safety and correctness
   */
  async validateUrl(url: string): Promise<URLValidationResult> {
    // Parse URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { valid: false, reason: 'Invalid URL format' };
    }

    // Check protocol
    if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
      return { valid: false, reason: `Protocol ${parsed.protocol} is not allowed` };
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return { valid: false, reason: `Protocol ${parsed.protocol} is not supported` };
    }

    // Check for IP-based URLs that might be private
    const hostname = parsed.hostname;
    if (this.isBlockedIP(hostname)) {
      return { valid: false, reason: 'Access to private/internal networks is not allowed' };
    }

    // Resolve hostname to IP and check
    try {
      const resolved = await dnsLookup(hostname);
      if (this.isBlockedIP(resolved.address)) {
        return {
          valid: false,
          reason: 'Hostname resolves to a private/internal IP address',
        };
      }
    } catch (error) {
      return { valid: false, reason: 'Failed to resolve hostname' };
    }

    return {
      valid: true,
      canonicalUrl: this.canonicalizeUrl(parsed),
    };
  }

  /**
   * Check if an IP address is in the blocked ranges
   */
  private isBlockedIP(ip: string): boolean {
    return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(ip));
  }

  /**
   * Canonicalize URL for consistent fingerprinting
   */
  private canonicalizeUrl(parsed: URL): string {
    // Normalize protocol and host
    parsed.protocol = parsed.protocol.toLowerCase();
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

    return parsed.toString();
  }

  /**
   * Fetch content from URL with security checks
   */
  async fetch(url: string): Promise<URLFetchResult> {
    // Validate URL first
    const validation = await this.validateUrl(url);
    if (!validation.valid) {
      throw new URLFetchError(validation.reason || 'URL validation failed', 'VALIDATION_FAILED');
    }

    const canonicalUrl = validation.canonicalUrl || url;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchWithRedirects(canonicalUrl, controller.signal);
      clearTimeout(timeoutId);

      // Check content type
      const contentType = response.headers.get('content-type') || 'text/html';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        throw new URLFetchError(
          `Unsupported content type: ${contentType}`,
          'UNSUPPORTED_CONTENT_TYPE'
        );
      }

      // Check content length
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (contentLength > this.config.maxSizeBytes) {
          throw new URLFetchError(
            `Content too large: ${contentLength} bytes (max: ${this.config.maxSizeBytes})`,
            'CONTENT_TOO_LARGE'
          );
        }
      }

      // Read body with size limit
      const html = await this.readBodyWithLimit(response);

      // Convert headers to record
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        html,
        status: response.status,
        headers,
        finalUrl: response.url,
        contentType,
        contentLength: html.length,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof URLFetchError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new URLFetchError(`Request timed out after ${this.config.timeoutMs}ms`, 'TIMEOUT');
        }
        throw new URLFetchError(error.message, 'FETCH_FAILED');
      }

      throw new URLFetchError('Unknown fetch error', 'FETCH_FAILED');
    }
  }

  /**
   * Fetch with redirect handling and SSRF checks at each hop
   */
  private async fetchWithRedirects(
    url: string,
    signal: AbortSignal,
    redirectCount = 0
  ): Promise<Response> {
    if (redirectCount > this.config.maxRedirects) {
      throw new URLFetchError(
        `Too many redirects (max: ${this.config.maxRedirects})`,
        'TOO_MANY_REDIRECTS'
      );
    }

    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': this.config.userAgent,
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'manual', // Handle redirects manually for SSRF checks
    });

    // Handle redirects with SSRF validation
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new URLFetchError('Redirect without location header', 'INVALID_REDIRECT');
      }

      // Resolve relative URLs
      const redirectUrl = new URL(location, url).toString();

      // Validate redirect URL for SSRF
      const validation = await this.validateUrl(redirectUrl);
      if (!validation.valid) {
        throw new URLFetchError(
          `Redirect to blocked URL: ${validation.reason}`,
          'BLOCKED_REDIRECT'
        );
      }

      return this.fetchWithRedirects(redirectUrl, signal, redirectCount + 1);
    }

    if (!response.ok) {
      throw new URLFetchError(`HTTP ${response.status}: ${response.statusText}`, 'HTTP_ERROR');
    }

    return response;
  }

  /**
   * Read response body with size limit enforcement
   */
  private async readBodyWithLimit(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new URLFetchError('No response body', 'NO_BODY');
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > this.config.maxSizeBytes) {
          reader.cancel();
          throw new URLFetchError(
            `Content exceeds size limit: ${totalSize} bytes`,
            'CONTENT_TOO_LARGE'
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks and decode
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder('utf-8').decode(combined);
  }
}

export class URLFetchError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'URLFetchError';
    this.code = code;
  }
}

// Singleton instance
let instance: URLFetcherService | null = null;

export function getURLFetcherService(config?: Partial<URLFetchConfig>): URLFetcherService {
  if (!instance || config) {
    instance = new URLFetcherService(config);
  }
  return instance;
}
