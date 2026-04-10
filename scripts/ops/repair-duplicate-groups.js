#!/usr/bin/env node

const Database = require('better-sqlite3');
const { resolveRuntimePaths } = require('./runtime-paths');

const CATCH_ALL_LABEL_KEYS = new Set([
  'other',
  'uncategorized',
  'other / uncategorized',
  'other/uncategorized',
]);

function normalizeGroupLabelKey(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseProperties(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function mergeKeywordLists(primary, secondary) {
  const merged = new Set();
  const append = (value) => {
    if (Array.isArray(value)) {
      for (const keyword of value) {
        if (typeof keyword === 'string' && keyword.trim().length > 0) {
          merged.add(keyword.trim());
        }
      }
    }
  };
  append(primary);
  append(secondary);
  return Array.from(merged).sort((left, right) => left.localeCompare(right));
}

function dedupeAccountEdges(db, accountId) {
  const duplicateRows = db
    .prepare(
      `
      SELECT kind, from_id, to_id, MIN(id) as keep_id, COUNT(*) as duplicate_count
      FROM edges
      WHERE account_id = ?
      GROUP BY kind, from_id, to_id
      HAVING COUNT(*) > 1
    `
    )
    .all(accountId);

  let removed = 0;
  for (const row of duplicateRows) {
    const result = db
      .prepare(
        `
        DELETE FROM edges
        WHERE account_id = ?
          AND kind = ?
          AND from_id = ?
          AND to_id = ?
          AND id <> ?
      `
      )
      .run(accountId, row.kind, row.from_id, row.to_id, row.keep_id);
    removed += result.changes || 0;
  }
  return removed;
}

function updateGroupNodeProperties(db, accountId, groupId, properties) {
  const now = Date.now();
  const next = {
    ...properties,
    metadata:
      typeof properties.metadata === 'object' && properties.metadata
        ? { ...properties.metadata }
        : {},
  };
  const labelKey = normalizeGroupLabelKey(next.normalized_label_key || next.name || groupId);
  next.normalized_label_key = labelKey;
  next.metadata.normalized_label_key = labelKey;
  const memberCountRow = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM edges
      WHERE kind = 'IN_GROUP' AND to_id = ? AND account_id = ?
    `
    )
    .get(groupId, accountId);
  next.member_count = memberCountRow?.count || 0;
  next.updated_at = now;

  db.prepare(
    `
    UPDATE nodes
    SET properties = ?, updated_at = ?
    WHERE id = ? AND account_id = ? AND kind = 'Group'
  `
  ).run(JSON.stringify(next), now, groupId, accountId);
}

function main() {
  const runtimePaths = resolveRuntimePaths();
  const db = new Database(runtimePaths.dbPath);
  db.pragma('foreign_keys = ON');

  const accountRows = db
    .prepare(
      `
      SELECT DISTINCT account_id
      FROM nodes
      WHERE kind = 'Group'
      ORDER BY account_id
    `
    )
    .all();

  const summary = {
    dbPath: runtimePaths.dbPath,
    accountCount: accountRows.length,
    mergedDuplicateNodes: 0,
    removedCatchAllNodes: 0,
    rewiredEdges: 0,
    dedupedEdges: 0,
    updatedCanonicalNodes: 0,
  };

  const runForAccount = db.transaction((accountId) => {
    const groupRows = db
      .prepare(
        `
        SELECT id, properties, created_at
        FROM nodes
        WHERE kind = 'Group' AND account_id = ?
        ORDER BY created_at ASC, id ASC
      `
      )
      .all(accountId);

    const groupedByLabelKey = new Map();
    for (const row of groupRows) {
      const props = parseProperties(row.properties);
      const label = typeof props.name === 'string' ? props.name : row.id;
      const key = normalizeGroupLabelKey(props.normalized_label_key || label);
      if (!key) {
        continue;
      }
      const bucket = groupedByLabelKey.get(key) || [];
      bucket.push({
        id: row.id,
        createdAt: row.created_at || 0,
        properties: props,
      });
      groupedByLabelKey.set(key, bucket);
    }

    for (const [labelKey, rows] of groupedByLabelKey.entries()) {
      if (rows.length === 0) {
        continue;
      }

      if (CATCH_ALL_LABEL_KEYS.has(labelKey)) {
        for (const row of rows) {
          const edgeDelete = db
            .prepare('DELETE FROM edges WHERE account_id = ? AND (from_id = ? OR to_id = ?)')
            .run(accountId, row.id, row.id);
          db.prepare('DELETE FROM nodes WHERE id = ? AND account_id = ? AND kind = ?').run(
            row.id,
            accountId,
            'Group'
          );
          summary.removedCatchAllNodes += 1;
          summary.rewiredEdges += edgeDelete.changes || 0;
        }
        continue;
      }

      const canonical = rows[0];
      const canonicalKeywords = mergeKeywordLists(
        canonical.properties?.metadata?.keywords,
        canonical.properties?.keywords
      );

      for (const duplicate of rows.slice(1)) {
        const duplicateKeywords = mergeKeywordLists(
          duplicate.properties?.metadata?.keywords,
          duplicate.properties?.keywords
        );
        const mergedKeywords = mergeKeywordLists(canonicalKeywords, duplicateKeywords);
        if (mergedKeywords.length > 0) {
          canonical.properties.metadata = {
            ...(canonical.properties.metadata || {}),
            keywords: mergedKeywords,
          };
          canonical.properties.keywords = mergedKeywords;
        }

        const fromResult = db
          .prepare('UPDATE edges SET from_id = ? WHERE account_id = ? AND from_id = ?')
          .run(canonical.id, accountId, duplicate.id);
        const toResult = db
          .prepare('UPDATE edges SET to_id = ? WHERE account_id = ? AND to_id = ?')
          .run(canonical.id, accountId, duplicate.id);
        const deleteNodeResult = db
          .prepare('DELETE FROM nodes WHERE id = ? AND account_id = ? AND kind = ?')
          .run(duplicate.id, accountId, 'Group');

        summary.rewiredEdges += (fromResult.changes || 0) + (toResult.changes || 0);
        summary.mergedDuplicateNodes += deleteNodeResult.changes || 0;
      }

      updateGroupNodeProperties(db, accountId, canonical.id, canonical.properties);
      summary.updatedCanonicalNodes += 1;
    }

    const deduped = dedupeAccountEdges(db, accountId);
    summary.dedupedEdges += deduped;

    const canonicalRows = db
      .prepare(
        `
        SELECT id, properties
        FROM nodes
        WHERE kind = 'Group' AND account_id = ?
      `
      )
      .all(accountId);

    for (const row of canonicalRows) {
      updateGroupNodeProperties(db, accountId, row.id, parseProperties(row.properties));
    }
  });

  for (const row of accountRows) {
    runForAccount(row.account_id);
  }

  console.log('[repair-duplicate-groups] complete');
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(
    `[repair-duplicate-groups] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
