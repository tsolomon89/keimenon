import { generateContentId } from '../utils/id-generator';

/**
 * Configuration for JSON normalization
 */
export interface JsonNormalizerConfig {
  /**
   * Fields to remove before hashing (e.g., timestamps, IDs)
   * Supports dot notation for nested fields: "user.id", "metadata.timestamp"
   */
  volatileFields: string[];

  /**
   * Whether to sort object keys recursively
   * Default: true (ensures {"a":1,"b":2} === {"b":2,"a":1})
   */
  sortKeys: boolean;

  /**
   * Indentation for pretty-printing
   * Default: 2 spaces
   */
  indent: number;

  /**
   * Whether to compact output (remove all whitespace)
   * If true, overrides indent setting
   * Default: false
   */
  compact: boolean;

  /**
   * Fields to KEEP when volatileFields is a deny-list
   * If specified, volatileFields becomes an allow-list instead
   */
  keepFields?: string[];
}

/**
 * Result of JSON normalization
 */
export interface JsonNormalizationResult {
  /**
   * Normalized JSON string
   */
  normalized: string;

  /**
   * Content ID (hash of normalized JSON)
   */
  content_id: string;

  /**
   * Fields that were removed during normalization
   */
  removedFields: string[];

  /**
   * Original vs normalized size
   */
  originalSize: number;
  normalizedSize: number;

  /**
   * Whether keys were reordered
   */
  keysReordered: boolean;
}

const DEFAULT_CONFIG: JsonNormalizerConfig = {
  volatileFields: ['id', 'timestamp', 'updated_at', 'created_at', '_id'],
  sortKeys: true,
  indent: 2,
  compact: false,
};

/**
 * JSON normalizer for deterministic content-addressable hashing
 *
 * Ensures that semantically equivalent JSON objects produce identical hashes:
 * - Removes volatile fields (timestamps, IDs)
 * - Sorts object keys recursively
 * - Consistent whitespace (or compact)
 * - NaN/Infinity → null (JSON standard)
 *
 * Example:
 * ```
 * const normalizer = new JsonNormalizer({
 *   volatileFields: ['id', 'timestamp'],
 *   sortKeys: true
 * });
 *
 * const result = normalizer.normalize('{"b":2,"id":123,"a":1}');
 * // result.normalized: '{"a":1,"b":2}'
 * // result.content_id: 'cid_abc123...'
 * ```
 */
export class JsonNormalizer {
  constructor(private config: JsonNormalizerConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Normalize a JSON string
   *
   * @param json - JSON string to normalize
   * @returns Normalization result with content_id
   */
  normalize(json: string): JsonNormalizationResult {
    const originalSize = json.length;
    const removedFields: string[] = [];

    // 1. Parse JSON
    let obj: any;
    try {
      obj = JSON.parse(json);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 2. Remove volatile fields
    if (this.config.volatileFields.length > 0) {
      obj = this.stripVolatileFields(obj, this.config.volatileFields, removedFields);
    }

    // 3. Sort keys if requested
    let keysReordered = false;
    if (this.config.sortKeys) {
      const before = JSON.stringify(obj);
      obj = this.sortKeysRecursive(obj);
      const after = JSON.stringify(obj);
      keysReordered = before !== after;
    }

    // 4. Stringify with consistent formatting
    let normalized: string;
    if (this.config.compact) {
      normalized = JSON.stringify(obj);
    } else {
      normalized = JSON.stringify(obj, null, this.config.indent);
    }

    const normalizedSize = normalized.length;

    // 5. Generate content ID
    const content_id = generateContentId(normalized);

    return {
      normalized,
      content_id,
      removedFields,
      originalSize,
      normalizedSize,
      keysReordered,
    };
  }

  /**
   * Normalize a parsed object (skips initial parse)
   */
  normalizeObject(obj: any): JsonNormalizationResult {
    const originalJson = JSON.stringify(obj);
    return this.normalize(originalJson);
  }

  /**
   * Remove volatile fields from object recursively
   *
   * Supports dot notation: "user.id" removes obj.user.id
   */
  private stripVolatileFields(
    obj: any,
    volatileFields: string[],
    removedFields: string[],
    path: string = ''
  ): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      // Process array elements
      return obj.map((item, index) =>
        this.stripVolatileFields(item, volatileFields, removedFields, `${path}[${index}]`)
      );
    }

    // Process object
    const result: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check if this field should be removed
      const shouldRemove = volatileFields.some(pattern => {
        // Exact match
        if (pattern === currentPath || pattern === key) return true;

        // Wildcard match (e.g., "*.id" matches "user.id", "post.id")
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          return regex.test(currentPath);
        }

        return false;
      });

      if (shouldRemove) {
        removedFields.push(currentPath);
        continue;
      }

      // Recursively process nested objects/arrays
      result[key] = this.stripVolatileFields(value, volatileFields, removedFields, currentPath);
    }

    return result;
  }

  /**
   * Sort object keys recursively
   *
   * Ensures {"b":1,"a":2} becomes {"a":2,"b":1}
   */
  private sortKeysRecursive(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      // Process array elements (maintain order, but sort nested objects)
      return obj.map(item => this.sortKeysRecursive(item));
    }

    // Sort object keys
    const sorted: any = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = this.sortKeysRecursive(obj[key]);
    }

    return sorted;
  }
}

/**
 * Quick normalize function with default config
 *
 * @param json - JSON string
 * @returns Content ID
 */
export function normalizeJson(json: string): string {
  const normalizer = new JsonNormalizer();
  const result = normalizer.normalize(json);
  return result.content_id;
}

/**
 * Batch normalize multiple JSON strings
 *
 * @param jsonStrings - Array of JSON strings
 * @param config - Optional normalizer config
 * @returns Array of normalization results
 */
export function normalizeJsonBatch(
  jsonStrings: string[],
  config?: JsonNormalizerConfig
): JsonNormalizationResult[] {
  const normalizer = new JsonNormalizer(config);
  return jsonStrings.map(json => normalizer.normalize(json));
}

/**
 * Compare two JSON objects for semantic equality after normalization
 *
 * @param jsonA - First JSON string
 * @param jsonB - Second JSON string
 * @param config - Optional normalizer config
 * @returns true if normalized forms are identical
 */
export function jsonEquals(
  jsonA: string,
  jsonB: string,
  config?: JsonNormalizerConfig
): boolean {
  const normalizer = new JsonNormalizer(config);
  const resultA = normalizer.normalize(jsonA);
  const resultB = normalizer.normalize(jsonB);
  return resultA.content_id === resultB.content_id;
}

/**
 * Create a normalizer for a specific domain (e.g., API responses, database records)
 *
 * Presets for common use cases:
 * - 'api': Remove id, timestamp, etag, request_id
 * - 'database': Remove _id, updated_at, created_at, __v (Mongoose)
 * - 'analytics': Remove timestamp, session_id, user_id, event_id
 */
export function createNormalizerPreset(preset: 'api' | 'database' | 'analytics'): JsonNormalizer {
  const presetConfigs: Record<string, Partial<JsonNormalizerConfig>> = {
    api: {
      volatileFields: ['id', 'timestamp', 'etag', 'request_id', 'trace_id'],
    },
    database: {
      volatileFields: ['_id', 'id', 'updated_at', 'created_at', '__v', 'version'],
    },
    analytics: {
      volatileFields: ['timestamp', 'session_id', 'user_id', 'event_id', 'trace_id'],
    },
  };

  const config = { ...DEFAULT_CONFIG, ...presetConfigs[preset] };
  return new JsonNormalizer(config);
}
