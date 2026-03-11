const DEFAULT_MAX_EGRESS_CHARS = 8_000;
const EGRESS_SNIP_MARKER = '\n\n[...SNIP...]\n\n';

export interface VerificationEgressPolicy {
  allowFullRawEgress?: boolean;
  maxExcerptChars?: number;
}

export interface VerificationEgressPayload {
  content: string;
  mode: 'full_raw' | 'excerpt';
  totalChars: number;
  egressChars: number;
  truncated: boolean;
}

function normalizeMaxChars(maxExcerptChars?: number): number {
  if (typeof maxExcerptChars !== 'number' || !Number.isFinite(maxExcerptChars)) {
    return DEFAULT_MAX_EGRESS_CHARS;
  }

  return Math.max(256, Math.floor(maxExcerptChars));
}

export function buildVerificationEgressPayload(
  rawContent: string,
  policy: VerificationEgressPolicy = {}
): VerificationEgressPayload {
  const source = typeof rawContent === 'string' ? rawContent : '';
  const totalChars = source.length;
  const maxChars = normalizeMaxChars(policy.maxExcerptChars);

  if (policy.allowFullRawEgress) {
    return {
      content: source,
      mode: 'full_raw',
      totalChars,
      egressChars: totalChars,
      truncated: false,
    };
  }

  if (totalChars <= maxChars) {
    return {
      content: source,
      mode: 'excerpt',
      totalChars,
      egressChars: totalChars,
      truncated: false,
    };
  }

  const excerptBudget = Math.max(32, maxChars - EGRESS_SNIP_MARKER.length);
  const headChars = Math.ceil(excerptBudget / 2);
  const tailChars = Math.floor(excerptBudget / 2);

  const excerpt = `${source.slice(0, headChars)}${EGRESS_SNIP_MARKER}${source.slice(
    totalChars - tailChars
  )}`;

  return {
    content: excerpt,
    mode: 'excerpt',
    totalChars,
    egressChars: excerpt.length,
    truncated: true,
  };
}
