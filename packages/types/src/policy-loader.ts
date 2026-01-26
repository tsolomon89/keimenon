/**
 * Policy Loader: Load clustering policy from YAML files
 *
 * Supports:
 * - Loading from file system
 * - Loading from string (for Admin UI)
 * - Validation
 * - Signature computation
 * - Merging with defaults
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ClusteringPolicy, DEFAULT_POLICY, validatePolicy, signPolicy } from './policy';

/**
 * Load policy from YAML file
 */
export function loadPolicyFromFile(filePath: string): ClusteringPolicy {
  const content = fs.readFileSync(filePath, 'utf8');
  return loadPolicyFromString(content);
}

/**
 * Load policy from YAML string
 */
export function loadPolicyFromString(yamlContent: string): ClusteringPolicy {
  const parsed = yaml.load(yamlContent) as Partial<ClusteringPolicy>;

  // Merge with defaults (deep merge)
  const policy = deepMerge(DEFAULT_POLICY, parsed) as ClusteringPolicy;

  // Validate
  const errors = validatePolicy(policy);
  if (errors.length > 0) {
    throw new Error(`Policy validation failed:\n${errors.join('\n')}`);
  }

  // Sign
  return signPolicy(policy);
}

/**
 * Load policy from default location (repo root policy.yaml)
 */
export function loadDefaultPolicy(): ClusteringPolicy {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const policyPath = path.join(repoRoot, 'policy.yaml');

  if (fs.existsSync(policyPath)) {
    return loadPolicyFromFile(policyPath);
  }

  // Fallback to hardcoded defaults
  return signPolicy(DEFAULT_POLICY);
}

/**
 * Save policy to YAML file
 */
export function savePolicyToFile(policy: ClusteringPolicy, filePath: string): void {
  const yamlContent = yaml.dump(policy, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });

  fs.writeFileSync(filePath, yamlContent, 'utf8');
}

/**
 * Deep merge two objects (policy merge)
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  if (!target) return source;

  const output = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;

    if (isObject(source[key]) && isObject(target[key])) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

function isObject(obj: any): boolean {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * Get policy diff (for Admin UI)
 */
export function getPolicyDiff(
  oldPolicy: ClusteringPolicy,
  newPolicy: ClusteringPolicy
): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};

  const flattenedOld = flattenObject(oldPolicy);
  const flattenedNew = flattenObject(newPolicy);

  const allKeys = new Set([...Object.keys(flattenedOld), ...Object.keys(flattenedNew)]);

  for (const key of Array.from(allKeys)) {
    if (JSON.stringify(flattenedOld[key]) !== JSON.stringify(flattenedNew[key])) {
      diff[key] = {
        old: flattenedOld[key],
        new: flattenedNew[key],
      };
    }
  }

  return diff;
}

/**
 * Flatten nested object to dot notation
 */
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (isObject(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Export policy as JSON (for manifest bundling)
 */
export function exportPolicyAsJson(policy: ClusteringPolicy): string {
  return JSON.stringify(policy, null, 2);
}

/**
 * Import policy from JSON
 */
export function importPolicyFromJson(json: string): ClusteringPolicy {
  const parsed = JSON.parse(json) as ClusteringPolicy;
  const errors = validatePolicy(parsed);

  if (errors.length > 0) {
    throw new Error(`Policy validation failed:\n${errors.join('\n')}`);
  }

  return signPolicy(parsed);
}
