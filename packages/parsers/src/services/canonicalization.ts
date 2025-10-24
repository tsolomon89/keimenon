/**
 * Canonicalization Utility
 *
 * Implements the canonicalization specification from docs/architecture/CANONICALIZATION.md
 * Ensures deterministic content hashing for deduplication.
 *
 * @see docs/architecture/CANONICALIZATION.md
 * @see docs/architecture/ARCHITECTURE_CONTRACT.md
 */

import canonicalizeLib from 'canonicalize';

/**
 * Canonicalization options for special content types
 */
export interface CanonicalizeOptions {
  /**
   * If true, preserve exact whitespace (e.g., for code blocks)
   */
  preserveWhitespace?: boolean;

  /**
   * If true, do not remove null/undefined values from objects
   */
  preserveNullish?: boolean;

  /**
   * Custom key sorting function (default: lexicographic)
   */
  sortKeys?: (a: string, b: string) => number;
}

/**
 * Normalize whitespace in a string according to canonicalization spec
 *
 * @param str - Input string
 * @param preserve - If true, preserve exact whitespace
 * @returns Normalized string
 */
function normalizeWhitespace(str: string, preserve: boolean = false): string {
  if (preserve) {
    return str;
  }

  // 1. Normalize Unicode to NFC
  const normalized = str.normalize('NFC');

  // 2. Trim leading/trailing whitespace
  const trimmed = normalized.trim();

  // 3. Collapse internal whitespace to single space
  const collapsed = trimmed.replace(/\s+/g, ' ');

  return collapsed;
}

/**
 * Clean an object by removing null/undefined values
 *
 * @param obj - Input object
 * @param preserve - If true, preserve null/undefined values
 * @returns Cleaned object
 */
function cleanObject(
  obj: Record<string, unknown>,
  preserve: boolean = false
): Record<string, unknown> {
  if (preserve) {
    return obj;
  }

  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null));
}

/**
 * Preprocess value before canonicalization to apply custom rules
 *
 * @param value - Input value
 * @param options - Canonicalization options
 * @returns Preprocessed value
 */
function preprocessValue(value: unknown, options: CanonicalizeOptions = {}): unknown {
  // Null/undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Number: handle special cases
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null; // NaN -> null (JSON doesn't support NaN)
    }
    if (!Number.isFinite(value)) {
      return null; // Infinity/-Infinity -> null (JSON doesn't support Infinity)
    }
    return value;
  }

  // String: normalize whitespace
  if (typeof value === 'string') {
    return normalizeWhitespace(value, options.preserveWhitespace);
  }

  // Date: convert to ISO string
  if (value instanceof Date) {
    return value.toISOString();
  }

  // RegExp: convert to string
  if (value instanceof RegExp) {
    return value.toString();
  }

  // Set: convert to sorted array
  if (value instanceof Set) {
    return Array.from(value).sort();
  }

  // Map: convert to object
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }

  // Array: recursively preprocess elements
  if (Array.isArray(value)) {
    return value.map((v) => preprocessValue(v, options));
  }

  // Object: clean and recursively preprocess values
  if (typeof value === 'object' && value !== null) {
    const cleaned = cleanObject(value as Record<string, unknown>, options.preserveNullish);
    const processed = Object.fromEntries(
      Object.entries(cleaned).map(([k, v]) => [
        normalizeWhitespace(k, options.preserveWhitespace),
        preprocessValue(v, options),
      ])
    );
    // Remove entries with empty string keys after whitespace normalization
    return Object.fromEntries(Object.entries(processed).filter(([k]) => k.length > 0));
  }

  // Primitives: return as-is
  return value;
}

/**
 * Canonicalize a value according to the specification
 *
 * This function implements the canonicalization algorithm specified in
 * docs/architecture/CANONICALIZATION.md
 *
 * Properties:
 * - Deterministic: same input always produces same output
 * - Idempotent: canonical(canonical(x)) === canonical(x)
 * - Order-independent for objects: { a: 1, b: 2 } === { b: 2, a: 1 }
 * - Whitespace-normalized: "  hello  " === "hello"
 *
 * @param value - Value to canonicalize
 * @param options - Canonicalization options
 * @returns Canonical string representation
 *
 * @example
 * ```typescript
 * canonicalize({ b: 2, a: 1 })
 * // => '{"a":1,"b":2}'
 *
 * canonicalize("  hello   world  ")
 * // => '"hello world"'
 *
 * canonicalize([1, 2, 3])
 * // => '[1,2,3]'
 * ```
 */
export function canonicalize(value: unknown, options: CanonicalizeOptions = {}): string {
  // Preprocess according to our rules
  const preprocessed = preprocessValue(value, options);

  // Use library for actual canonicalization (RFC 8785 compliant)
  const canonical = canonicalizeLib(preprocessed);

  if (canonical === undefined) {
    throw new Error(`Cannot canonicalize value: ${typeof value}`);
  }

  return canonical;
}

/**
 * Check if two values are canonically equal
 *
 * @param a - First value
 * @param b - Second value
 * @param options - Canonicalization options
 * @returns True if canonically equal
 *
 * @example
 * ```typescript
 * areCanonicallyEqual({ a: 1, b: 2 }, { b: 2, a: 1 })
 * // => true
 *
 * areCanonicallyEqual("  hello  ", "hello")
 * // => true
 * ```
 */
export function areCanonicallyEqual(
  a: unknown,
  b: unknown,
  options: CanonicalizeOptions = {}
): boolean {
  try {
    return canonicalize(a, options) === canonicalize(b, options);
  } catch {
    return false;
  }
}

/**
 * Canonicalize content for a specific node type
 *
 * This function applies type-specific canonicalization rules based on
 * the node type.
 *
 * @param nodeType - Type of node
 * @param content - Content to canonicalize
 * @returns Canonical string representation
 *
 * @example
 * ```typescript
 * canonicalizeForNodeType('message', { text: '  hello  ', timestamp: 123 })
 * // Normalizes whitespace in text
 *
 * canonicalizeForNodeType('code', { language: 'typescript', code: '  const x = 1;  ' })
 * // Preserves whitespace in code
 * ```
 */
export function canonicalizeForNodeType(nodeType: string, content: unknown): string {
  // Code nodes preserve whitespace
  if (nodeType === 'code' || nodeType === 'snippet') {
    return canonicalize(content, { preserveWhitespace: true });
  }

  // Default: normalize whitespace
  return canonicalize(content);
}

/**
 * Test vectors for canonicalization
 *
 * These vectors are used for testing and validation.
 * Each vector specifies an input and its expected canonical form.
 *
 * @see docs/architecture/CANONICALIZATION.md#appendix-a-test-vectors
 */
export const TEST_VECTORS = [
  // Objects: key ordering
  {
    name: 'object_key_ordering',
    input: { b: 2, a: 1 },
    canonical: '{"a":1,"b":2}',
  },
  {
    name: 'object_nested',
    input: { z: { nested: true }, a: [1, 2] },
    canonical: '{"a":[1,2],"z":{"nested":true}}',
  },

  // Strings: whitespace normalization
  {
    name: 'string_trim',
    input: '  hello  ',
    canonical: '"hello"',
  },
  {
    name: 'string_collapse',
    input: 'hello   world',
    canonical: '"hello world"',
  },
  {
    name: 'string_newlines',
    input: 'hello\n\nworld',
    canonical: '"hello world"',
  },

  // Arrays: preserve order
  {
    name: 'array_order',
    input: [3, 1, 2],
    canonical: '[3,1,2]',
  },
  {
    name: 'array_nested',
    input: [
      [1, 2],
      [3, 4],
    ],
    canonical: '[[1,2],[3,4]]',
  },

  // Null handling
  {
    name: 'null_value',
    input: null,
    canonical: 'null',
  },
  {
    name: 'undefined_value',
    input: undefined,
    canonical: 'null',
  },
  {
    name: 'object_null_values',
    input: { foo: null, bar: 'baz', qux: undefined },
    canonical: '{"bar":"baz"}',
  },

  // Numbers
  {
    name: 'number_integer',
    input: 42,
    canonical: '42',
  },
  {
    name: 'number_float',
    input: 42.5,
    canonical: '42.5',
  },
  {
    name: 'number_negative',
    input: -42,
    canonical: '-42',
  },

  // Booleans
  {
    name: 'boolean_true',
    input: true,
    canonical: 'true',
  },
  {
    name: 'boolean_false',
    input: false,
    canonical: 'false',
  },

  // Empty values
  {
    name: 'empty_string',
    input: '',
    canonical: '""',
  },
  {
    name: 'empty_array',
    input: [],
    canonical: '[]',
  },
  {
    name: 'empty_object',
    input: {},
    canonical: '{}',
  },

  // Mixed types
  {
    name: 'mixed_types',
    input: {
      str: 'hello',
      num: 42,
      bool: true,
      arr: [1, 2, 3],
      obj: { nested: true },
      nil: null,
    },
    canonical: '{"arr":[1,2,3],"bool":true,"num":42,"obj":{"nested":true},"str":"hello"}',
  },

  // Special objects
  {
    name: 'date',
    input: new Date('2025-10-23T12:00:00.000Z'),
    canonical: '"2025-10-23T12:00:00.000Z"',
  },
  {
    name: 'set',
    input: new Set([3, 1, 2]),
    canonical: '[1,2,3]',
  },
  {
    name: 'map',
    input: new Map([
      ['b', 2],
      ['a', 1],
    ]),
    canonical: '{"a":1,"b":2}',
  },
];

/**
 * Validate canonicalization properties
 *
 * This function tests that the canonicalization implementation
 * satisfies the required properties from the specification.
 *
 * @throws Error if any property is violated
 */
export function validateCanonicalizeProperties(): void {
  // P1: Idempotency
  for (const vector of TEST_VECTORS) {
    const c1 = canonicalize(vector.input);
    const parsed = JSON.parse(c1);
    const c2 = canonicalize(parsed);
    if (c1 !== c2) {
      throw new Error(`P1 (idempotency) violated for ${vector.name}: ${c1} !== ${c2}`);
    }
  }

  // P2: Determinism
  for (const vector of TEST_VECTORS) {
    const c1 = canonicalize(vector.input);
    const c2 = canonicalize(vector.input);
    if (c1 !== c2) {
      throw new Error(`P2 (determinism) violated for ${vector.name}`);
    }
  }

  // P3: Expected output
  for (const vector of TEST_VECTORS) {
    const actual = canonicalize(vector.input);
    if (actual !== vector.canonical) {
      throw new Error(
        `Expected output mismatch for ${vector.name}:\n` +
          `  Expected: ${vector.canonical}\n` +
          `  Actual:   ${actual}`
      );
    }
  }

  console.log('✓ All canonicalization properties validated');
}
