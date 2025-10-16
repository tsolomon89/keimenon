/**
 * Policy Version Management
 *
 * Handles:
 * - Storing policy snapshots
 * - Loading historical policies
 * - Policy diffs and comparison
 */

import Database from 'better-sqlite3';
import * as yaml from 'js-yaml';
import { ClusteringPolicy, computePolicySignature } from './policy';

export interface PolicyVersion {
  id: string; // SHA-256 signature
  version: string; // Semantic version
  yaml_content: string;
  created_at: number;
  created_by?: string;
  notes?: string;
}

export interface PolicyVersionSummary {
  id: string;
  version: string;
  created_at: number;
  created_by?: string;
  notes?: string;
}

/**
 * Save a policy version to the database
 */
export function savePolicyVersion(
  db: Database.Database,
  policy: ClusteringPolicy,
  yamlContent: string,
  createdBy?: string,
  notes?: string
): string {
  const signature = policy.signature || computePolicySignature(policy);
  const now = Date.now();

  // Check if already exists
  const existing = db
    .prepare('SELECT id FROM policy_versions WHERE id = ?')
    .get(signature);

  if (existing) {
    return signature; // Already saved
  }

  // Insert new version
  const stmt = db.prepare(`
    INSERT INTO policy_versions (id, version, yaml_content, created_at, created_by, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(signature, policy.version, yamlContent, now, createdBy || null, notes || null);

  return signature;
}

/**
 * Load a policy version by ID
 */
export function loadPolicyVersion(
  db: Database.Database,
  policyId: string
): PolicyVersion | null {
  const stmt = db.prepare('SELECT * FROM policy_versions WHERE id = ?');
  const row = stmt.get(policyId) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    version: row.version,
    yaml_content: row.yaml_content,
    created_at: row.created_at,
    created_by: row.created_by,
    notes: row.notes,
  };
}

/**
 * Load a policy version and parse to ClusteringPolicy
 */
export function loadPolicyById(
  db: Database.Database,
  policyId: string
): ClusteringPolicy | null {
  const version = loadPolicyVersion(db, policyId);
  if (!version) {
    return null;
  }

  const policy = yaml.load(version.yaml_content) as ClusteringPolicy;
  return policy;
}

/**
 * List all policy versions
 */
export function listPolicyVersions(
  db: Database.Database,
  limit = 50
): PolicyVersionSummary[] {
  const stmt = db.prepare(`
    SELECT id, version, created_at, created_by, notes
    FROM policy_versions
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    created_at: row.created_at,
    created_by: row.created_by,
    notes: row.notes,
  }));
}

/**
 * Get the latest policy version
 */
export function getLatestPolicyVersion(db: Database.Database): PolicyVersion | null {
  const stmt = db.prepare(`
    SELECT * FROM policy_versions
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const row = stmt.get() as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    version: row.version,
    yaml_content: row.yaml_content,
    created_at: row.created_at,
    created_by: row.created_by,
    notes: row.notes,
  };
}

/**
 * Compare two policy versions
 */
export function comparePolicyVersions(
  db: Database.Database,
  policyIdA: string,
  policyIdB: string
): {
  policy_a: PolicyVersionSummary | null;
  policy_b: PolicyVersionSummary | null;
  differences: string[];
} {
  const policyA = loadPolicyVersion(db, policyIdA);
  const policyB = loadPolicyVersion(db, policyIdB);

  if (!policyA || !policyB) {
    return {
      policy_a: policyA
        ? {
            id: policyA.id,
            version: policyA.version,
            created_at: policyA.created_at,
            created_by: policyA.created_by,
            notes: policyA.notes,
          }
        : null,
      policy_b: policyB
        ? {
            id: policyB.id,
            version: policyB.version,
            created_at: policyB.created_at,
            created_by: policyB.created_by,
            notes: policyB.notes,
          }
        : null,
      differences: policyA && !policyB ? ['Policy B not found'] : ['Policy A not found'],
    };
  }

  const differences: string[] = [];

  // Parse policies
  const parsedA = yaml.load(policyA.yaml_content) as any;
  const parsedB = yaml.load(policyB.yaml_content) as any;

  // Compare key fields
  if (parsedA.version !== parsedB.version) {
    differences.push(`Version: ${parsedA.version} → ${parsedB.version}`);
  }

  // Compare gray_band thresholds
  const modalities = ['prose', 'code', 'math', 'json', 'markdown'];
  const levels = ['sentence', 'block', 'section'];

  modalities.forEach((mod) => {
    levels.forEach((lvl) => {
      const pathA = parsedA.gray_band?.[mod]?.[lvl];
      const pathB = parsedB.gray_band?.[mod]?.[lvl];

      if (pathA && pathB) {
        if (pathA.attach !== pathB.attach) {
          differences.push(`gray_band.${mod}.${lvl}.attach: ${pathA.attach} → ${pathB.attach}`);
        }
        if (pathA.review_lower !== pathB.review_lower) {
          differences.push(
            `gray_band.${mod}.${lvl}.review_lower: ${pathA.review_lower} → ${pathB.review_lower}`
          );
        }
        if (pathA.reject_below !== pathB.reject_below) {
          differences.push(
            `gray_band.${mod}.${lvl}.reject_below: ${pathA.reject_below} → ${pathB.reject_below}`
          );
        }
      }
    });
  });

  // Compare evidence weights
  const evidenceFields = [
    'freq_weight',
    'diversity_weight',
    'role_weight',
    'temporal_weight',
    'modality_weight',
    'coherence_weight',
  ];

  evidenceFields.forEach((field) => {
    const valA = parsedA.evidence?.[field];
    const valB = parsedB.evidence?.[field];

    if (valA !== valB) {
      differences.push(`evidence.${field}: ${valA} → ${valB}`);
    }
  });

  return {
    policy_a: {
      id: policyA.id,
      version: policyA.version,
      created_at: policyA.created_at,
      created_by: policyA.created_by,
      notes: policyA.notes,
    },
    policy_b: {
      id: policyB.id,
      version: policyB.version,
      created_at: policyB.created_at,
      created_by: policyB.created_by,
      notes: policyB.notes,
    },
    differences,
  };
}

/**
 * Delete old policy versions (keep last N)
 */
export function cleanOldPolicyVersions(db: Database.Database, keepLast = 20): number {
  const stmt = db.prepare(`
    DELETE FROM policy_versions
    WHERE id NOT IN (
      SELECT id FROM policy_versions
      ORDER BY created_at DESC
      LIMIT ?
    )
  `);

  const result = stmt.run(keepLast);
  return result.changes;
}
