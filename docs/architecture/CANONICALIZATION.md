# CANONICALIZATION.md

**Status:** Specification
**Version:** 1.0.0
**Last Updated:** 2025-10-23
**Related:** [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md)

---

## Purpose

This document specifies the exact canonicalization algorithm used for content-addressable storage in Keimenon. Canonical form ensures that semantically identical content produces identical hashes, enabling automatic deduplication.

---

## Core Requirement

**Invariant:** For any two objects A and B:

```
hash(canonical(A)) === hash(canonical(B)) ⟺ content_equal(A, B)
```

This means:

1. Identical content must produce identical canonical forms
2. Different content must produce different canonical forms
3. Canonicalization must be deterministic and stable

---

## Algorithm Specification

### Step 1: Type Handling

```typescript
function canonicalize(value: unknown): string {
  // Null and undefined both canonicalize to null
  if (value === null || value === undefined) {
    return 'null';
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  // Number
  if (typeof value === 'number') {
    return canonicalizeNumber(value);
  }

  // String
  if (typeof value === 'string') {
    return canonicalizeString(value);
  }

  // Array
  if (Array.isArray(value)) {
    return canonicalizeArray(value);
  }

  // Object
  if (typeof value === 'object') {
    return canonicalizeObject(value);
  }

  throw new Error(`Cannot canonicalize type: ${typeof value}`);
}
```

### Step 2: Number Canonicalization

```typescript
function canonicalizeNumber(n: number): string {
  // NaN canonicalizes to "NaN"
  if (Number.isNaN(n)) {
    return '"NaN"';
  }

  // Infinity canonicalizes to "Infinity" or "-Infinity"
  if (!Number.isFinite(n)) {
    return n > 0 ? '"Infinity"' : '"-Infinity"';
  }

  // Integers: no decimal point
  if (Number.isInteger(n)) {
    return n.toString();
  }

  // Floats: normalize to shortest representation
  // Remove trailing zeros after decimal
  return n.toString().replace(/\.?0+$/, '');
}
```

**Examples:**

```typescript
canonicalizeNumber(42); // "42"
canonicalizeNumber(42.0); // "42"
canonicalizeNumber(42.5); // "42.5"
canonicalizeNumber(42.5); // "42.5"
canonicalizeNumber(NaN); // "\"NaN\""
canonicalizeNumber(Infinity); // "\"Infinity\""
```

### Step 3: String Canonicalization

```typescript
function canonicalizeString(s: string): string {
  // 1. Normalize Unicode to NFC
  const normalized = s.normalize('NFC');

  // 2. Trim leading/trailing whitespace
  const trimmed = normalized.trim();

  // 3. Collapse internal whitespace to single space
  const collapsed = trimmed.replace(/\s+/g, ' ');

  // 4. JSON-encode (handles escaping)
  return JSON.stringify(collapsed);
}
```

**Examples:**

```typescript
canonicalizeString('hello'); // "\"hello\""
canonicalizeString('  hello  '); // "\"hello\""
canonicalizeString('hello\n\nworld'); // "\"hello world\""
canonicalizeString('café'); // "\"café\"" (NFC normalized)
```

**Whitespace Rules:**

- Leading/trailing: removed
- Internal consecutive whitespace (spaces, tabs, newlines): collapsed to single space
- Exception: Preserve whitespace in code blocks (see Special Cases)

### Step 4: Array Canonicalization

```typescript
function canonicalizeArray(arr: unknown[]): string {
  // Recursively canonicalize elements, preserve order
  const canonical = arr.map(canonicalize);

  // Format: [elem1,elem2,elem3] (no spaces)
  return '[' + canonical.join(',') + ']';
}
```

**Examples:**

```typescript
canonicalizeArray([1, 2, 3]); // "[1,2,3]"
canonicalizeArray([1, 'hello', null]); // "[1,\"hello\",null]"
canonicalizeArray([
  [1, 2],
  [3, 4],
]); // "[[1,2],[3,4]]"
```

**Ordering:**

- Array order is significant
- `[1, 2, 3]` ≠ `[3, 2, 1]`

### Step 5: Object Canonicalization

```typescript
function canonicalizeObject(obj: Record<string, unknown>): string {
  // 1. Remove properties with undefined or null values
  const cleaned = Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null)
  );

  // 2. Sort keys alphabetically (lexicographic, case-sensitive)
  const sortedKeys = Object.keys(cleaned).sort();

  // 3. Recursively canonicalize values
  const pairs = sortedKeys.map((key) => {
    const canonicalKey = canonicalizeString(key);
    const canonicalValue = canonicalize(cleaned[key]);
    return canonicalKey + ':' + canonicalValue;
  });

  // 4. Format: {key1:value1,key2:value2} (no spaces)
  return '{' + pairs.join(',') + '}';
}
```

**Examples:**

```typescript
canonicalizeObject({ b: 2, a: 1 });
// "{\"a\":1,\"b\":2}"

canonicalizeObject({ foo: null, bar: 'baz' });
// "{\"bar\":\"baz\"}"

canonicalizeObject({ z: { nested: true }, a: [1, 2] });
// "{\"a\":[1,2],\"z\":{\"nested\":true}}"
```

**Key Sorting Rules:**

- Lexicographic (dictionary order)
- Case-sensitive: 'A' < 'Z' < 'a' < 'z'
- Numbers as strings: '1' < '10' < '2'

### Step 6: Special Object Types

#### Dates

```typescript
// Convert to ISO 8601 string
if (value instanceof Date) {
  return canonicalizeString(value.toISOString());
}
```

**Example:**

```typescript
new Date('2025-10-23T12:00:00Z');
// "\"2025-10-23T12:00:00.000Z\""
```

#### Regular Expressions

```typescript
// Convert to string representation
if (value instanceof RegExp) {
  return canonicalizeString(value.toString());
}
```

**Example:**

```typescript
/^hello$/i;
// "\"/^hello$/i\""
```

#### Sets

```typescript
// Convert to sorted array
if (value instanceof Set) {
  const sorted = Array.from(value).sort();
  return canonicalizeArray(sorted);
}
```

**Example:**

```typescript
new Set([3, 1, 2]);
// "[1,2,3]"
```

#### Maps

```typescript
// Convert to sorted object
if (value instanceof Map) {
  const obj = Object.fromEntries(value);
  return canonicalizeObject(obj);
}
```

---

## Complete Algorithm (TypeScript)

```typescript
export function canonicalize(value: unknown): string {
  // Null/undefined
  if (value === null || value === undefined) {
    return 'null';
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  // Number
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '"NaN"';
    if (!Number.isFinite(value)) return value > 0 ? '"Infinity"' : '"-Infinity"';
    if (Number.isInteger(value)) return value.toString();
    return value.toString().replace(/\.?0+$/, '');
  }

  // String
  if (typeof value === 'string') {
    const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ');
    return JSON.stringify(normalized);
  }

  // Date
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  // RegExp
  if (value instanceof RegExp) {
    return JSON.stringify(value.toString());
  }

  // Set
  if (value instanceof Set) {
    const sorted = Array.from(value).sort();
    return '[' + sorted.map(canonicalize).join(',') + ']';
  }

  // Map
  if (value instanceof Map) {
    const obj = Object.fromEntries(value);
    return canonicalizeObject(obj);
  }

  // Array
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }

  // Object
  if (typeof value === 'object') {
    const cleaned = Object.fromEntries(
      Object.entries(value).filter(([_, v]) => v !== undefined && v !== null)
    );
    const sortedKeys = Object.keys(cleaned).sort();
    const pairs = sortedKeys.map((key) => {
      const canonicalKey = JSON.stringify(key.trim().replace(/\s+/g, ' '));
      const canonicalValue = canonicalize(cleaned[key]);
      return canonicalKey + ':' + canonicalValue;
    });
    return '{' + pairs.join(',') + '}';
  }

  throw new Error(`Cannot canonicalize type: ${typeof value}`);
}
```

---

## Content Hashing

```typescript
import { createHash } from 'crypto';

export function contentHash(value: unknown): string {
  const canonical = canonicalize(value);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
```

**Properties:**

- Deterministic: same input always produces same hash
- Collision-resistant: SHA-256 provides 2^256 space
- Fast: O(n) in content size

---

## Property Tests

These properties must hold for all inputs:

### P1: Idempotency

```typescript
canonical(canonical(x)) === canonical(x);
```

Canonicalization is idempotent — applying it multiple times doesn't change the result.

### P2: Equivalence

```typescript
deepEqual(A, B) ⟹ canonical(A) === canonical(B)
```

Semantically equal content produces identical canonical forms.

### P3: Determinism

```typescript
canonical(x) === canonical(x); // always
```

Same input always produces same output.

### P4: Stability

```typescript
// Version N
const hashN = contentHash(obj);

// Version N+1 (after system upgrade)
const hashN1 = contentHash(obj);

assert(hashN === hashN1);
```

Canonical form is stable across software versions.

### P5: Ordering Independence (Objects Only)

```typescript
canonical({ a: 1, b: 2 }) === canonical({ b: 2, a: 1 });
```

Object key order doesn't affect canonical form.

### P6: Whitespace Normalization

```typescript
canonical('hello   world') === canonical('hello world');
canonical('  hello  ') === canonical('hello');
```

Whitespace variations produce same canonical form.

---

## Edge Cases

### Empty Values

```typescript
canonicalize(null); // "null"
canonicalize(undefined); // "null"
canonicalize(''); // "\"\""
canonicalize([]); // "[]"
canonicalize({}); // "{}"
```

### Nested Structures

```typescript
canonicalize({
  users: [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ],
});
// "{\"users\":[{\"age\":30,\"name\":\"Alice\"},{\"age\":25,\"name\":\"Bob\"}]}"
```

### Mixed Types

```typescript
canonicalize({
  str: 'hello',
  num: 42,
  bool: true,
  arr: [1, 2, 3],
  obj: { nested: true },
  nil: null,
});
// "{\"arr\":[1,2,3],\"bool\":true,\"num\":42,\"obj\":{\"nested\":true},\"str\":\"hello\"}"
// Note: "nil" property removed (null value)
```

### Unicode Normalization

```typescript
// These are different Unicode sequences but same visual character
const composed = 'é'; // U+00E9 (single character)
const decomposed = 'é'; // U+0065 U+0301 (e + combining acute)

canonicalize(composed) === canonicalize(decomposed); // true
// Both normalize to NFC form
```

---

## Special Cases

### Code Blocks (Preserve Whitespace)

For content marked as code, preserve exact whitespace:

```typescript
interface CodeBlock {
  type: 'code';
  language: string;
  content: string; // Do NOT normalize whitespace
}

function canonicalizeCodeBlock(block: CodeBlock): string {
  return canonicalizeObject({
    ...block,
    content: JSON.stringify(block.content), // Preserve exact string
  });
}
```

### Large Numbers

JavaScript numbers lose precision beyond 2^53. For large integers, use strings:

```typescript
// Bad: precision loss
{
  amount: 9007199254740993;
}

// Good: exact representation
{
  amount: '9007199254740993';
}
```

### Binary Data

Binary data should be base64-encoded before canonicalization:

```typescript
const binary = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
const encoded = binary.toString('base64'); // "SGVsbG8="

canonicalize({ data: encoded });
```

---

## Usage in System

### Node Creation

```typescript
import { canonicalize, contentHash } from '@/lib/canonicalize';

function createNode(nodeType: NodeType, content: unknown): Node {
  // 1. Canonicalize content
  const canonical = canonicalize(content);

  // 2. Generate content hash
  const hash = contentHash(content);

  // 3. Check for duplicate
  const existing = await db.findByContentHash(hash);
  if (existing) {
    return existing; // Deduplicate
  }

  // 4. Create new node
  const nodeId = `${nodeType}_${hash}_${Date.now()}`;
  const node = {
    node_id: nodeId,
    node_type: nodeType,
    content: canonical,
    content_hash: hash,
    created_at: Date.now(),
  };

  await db.insert(node);
  return node;
}
```

### Deduplication

```typescript
async function deduplicate(accountId: string): Promise<DedupeResult> {
  // Group nodes by content hash
  const groups = await db.query(
    `
    SELECT content_hash, array_agg(node_id) as node_ids
    FROM nodes
    WHERE account_id = ?
    GROUP BY content_hash
    HAVING count(*) > 1
  `,
    [accountId]
  );

  // For each duplicate group, merge into canonical node
  for (const group of groups) {
    const [canonical, ...duplicates] = group.node_ids;
    await mergeNodes(canonical, duplicates);
  }

  return {
    deduplicated: groups.length,
    saved_bytes: calculateSavings(groups),
  };
}
```

---

## Performance Characteristics

### Time Complexity

- Primitives: O(1)
- Strings: O(n) where n = string length
- Arrays: O(n \* k) where n = length, k = element complexity
- Objects: O(m log m + m \* k) where m = keys, k = value complexity
  - O(m log m) for sorting keys
  - O(m \* k) for canonicalizing values

### Space Complexity

- O(n) where n = total content size
- Canonical form typically same size as original

### Optimization Opportunities

```typescript
// Cache canonical forms for immutable data
const canonicalCache = new WeakMap();

function canonicalizeCached(value: object): string {
  if (canonicalCache.has(value)) {
    return canonicalCache.get(value)!;
  }

  const canonical = canonicalize(value);
  canonicalCache.set(value, canonical);
  return canonical;
}
```

---

## Testing Requirements

### Unit Tests

```typescript
describe('canonicalize', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const c1 = canonicalize(value);
        const c2 = canonicalize(JSON.parse(c1));
        return c1 === c2;
      })
    );
  });

  it('handles object key ordering', () => {
    const a = { z: 1, a: 2 };
    const b = { a: 2, z: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('normalizes whitespace', () => {
    expect(canonicalize('  hello   world  ')).toBe(canonicalize('hello world'));
  });
});
```

### Property Tests

```typescript
import fc from 'fast-check';

describe('canonicalize properties', () => {
  it('P1: idempotency', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const c1 = canonicalize(x);
        const c2 = canonicalize(c1);
        return c1 === c2;
      })
    );
  });

  it('P2: determinism', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        return canonicalize(x) === canonicalize(x);
      })
    );
  });

  it('P3: hash collision resistance', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        if (deepEqual(a, b)) {
          return contentHash(a) === contentHash(b);
        } else {
          return contentHash(a) !== contentHash(b);
        }
      })
    );
  });
});
```

---

## Migration Strategy

### Phase 1: Add content_hash column

```sql
ALTER TABLE nodes ADD COLUMN content_hash TEXT;
CREATE INDEX idx_content_hash ON nodes(content_hash);
```

### Phase 2: Backfill existing nodes

```typescript
async function backfillContentHashes() {
  const nodes = await db.all('SELECT node_id, content FROM nodes WHERE content_hash IS NULL');

  for (const node of nodes) {
    const hash = contentHash(JSON.parse(node.content));
    await db.run('UPDATE nodes SET content_hash = ? WHERE node_id = ?', [hash, node.node_id]);
  }
}
```

### Phase 3: Enforce uniqueness (optional)

```sql
CREATE UNIQUE INDEX idx_account_content_hash
ON nodes(account_id, content_hash);
```

---

## Appendix A: Test Vectors

```typescript
export const TEST_VECTORS = [
  {
    input: { b: 2, a: 1 },
    canonical: '{"a":1,"b":2}',
    hash: 'a7f3c77f3e9e...',
  },
  {
    input: '  hello   world  ',
    canonical: '"hello world"',
    hash: 'b94d27b99342...',
  },
  {
    input: [3, 1, 2],
    canonical: '[3,1,2]',
    hash: 'c3ab8ff13720...',
  },
  // Add more vectors...
];
```

---

## Appendix B: References

- [RFC 8785: JSON Canonicalization Scheme (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
- [Unicode Normalization (NFC)](https://unicode.org/reports/tr15/)
- [SHA-256 Specification](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf)
- [ARCHITECTURE_CONTRACT.md](./ARCHITECTURE_CONTRACT.md)

---

## Revision History

| Version | Date       | Changes               | Author |
| ------- | ---------- | --------------------- | ------ |
| 1.0.0   | 2025-10-23 | Initial specification | System |

---

**End of Specification**
