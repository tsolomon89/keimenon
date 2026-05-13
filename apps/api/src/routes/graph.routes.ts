import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { requireAuth, isolateByAccount } from '../middleware/auth.middleware';
import { getDbClient } from '../utils/get-db-client';
import {
  buildGraphSnapshotResponse,
  DEFAULT_EDGE_BUDGET,
  DEFAULT_NODE_BUDGET,
  HARD_EDGE_BUDGET_MAX,
  HARD_NODE_BUDGET_MAX,
  type SnapshotEdgeRecord,
  type SnapshotNodeRecord,
} from '../services/graph-snapshot.service';
import type {
  GraphReadModelResponse,
  GraphReadModelNode,
  GraphReadModelEdge,
} from '@keimenon/types';

function parseIntegerParam(value: unknown, fallback: number): number {
  const parsed = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseSeedNodeIds(query: Request['query']): string[] {
  const collected: string[] = [];
  const candidateValues = [query.seed_node_id, query.seed_node_ids];

  for (const value of candidateValues) {
    if (typeof value === 'string' && value.trim().length > 0) {
      collected.push(...value.split(',').map((entry) => entry.trim()));
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== 'string') continue;
        collected.push(...item.split(',').map((entry) => entry.trim()));
      }
    }
  }

  const deduped = new Set<string>();
  for (const candidate of collected) {
    if (!candidate) continue;
    deduped.add(candidate);
    if (deduped.size >= 300) {
      break;
    }
  }

  return Array.from(deduped.values());
}

function parseProperties(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function createGraphRoutes(authService: AuthService): Router {
  const router = Router();

  router.get(
    '/snapshot',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const db = await getDbClient(req);
        const accountId = req.operating?.accountId || req.user?.accountId;

        if (!accountId) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Cannot resolve active account for graph snapshot',
          });
        }

        const nodeBudget = Math.min(
          parseIntegerParam(req.query.node_budget, DEFAULT_NODE_BUDGET),
          HARD_NODE_BUDGET_MAX
        );
        const edgeBudget = Math.min(
          parseIntegerParam(req.query.edge_budget, DEFAULT_EDGE_BUDGET),
          HARD_EDGE_BUDGET_MAX
        );
        const seedNodeIds = parseSeedNodeIds(req.query);

        const [nodeCountResult, edgeCountResult, nodeRowsResult, edgeRowsResult] =
          await Promise.all([
            db.execute('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?', [accountId]),
            db.execute('SELECT COUNT(*) as count FROM edges WHERE account_id = ?', [accountId]),
            db.execute(
              `SELECT id, kind, properties, created_at, updated_at
               FROM nodes
               WHERE account_id = ?`,
              [accountId]
            ),
            db.execute(
              `SELECT id, kind, from_id, to_id, properties, created_at
               FROM edges
               WHERE account_id = ?`,
              [accountId]
            ),
          ]);

        const totalNodes = Number(nodeCountResult.records?.[0]?.count || 0);
        const totalEdges = Number(edgeCountResult.records?.[0]?.count || 0);

        const nodes: SnapshotNodeRecord[] = (nodeRowsResult.records || []).map((row: any) => ({
          id: String(row.id),
          kind: String(row.kind),
          properties: parseProperties(row.properties),
          created_at: row.created_at ? Number(row.created_at) : undefined,
          updated_at: row.updated_at ? Number(row.updated_at) : undefined,
        }));

        const edges: SnapshotEdgeRecord[] = (edgeRowsResult.records || []).map((row: any) => ({
          id: String(row.id),
          kind: String(row.kind),
          from: String(row.from_id),
          to: String(row.to_id),
          properties: parseProperties(row.properties),
          created_at: row.created_at ? Number(row.created_at) : undefined,
        }));

        const snapshot = buildGraphSnapshotResponse({
          nodes,
          edges,
          totalNodes,
          totalEdges,
          nodeBudget,
          edgeBudget,
          seedNodeIds,
        });

        return res.json(snapshot);
      } catch (error: any) {
        return res.status(500).json({
          error: 'Failed to build graph snapshot',
          message: error?.message || 'Unknown error',
        });
      }
    }
  );

  router.get(
    '/read-model',
    requireAuth(authService),
    isolateByAccount,
    async (req: Request, res: Response) => {
      try {
        const db = await getDbClient(req);
        const accountId = req.operating?.accountId || req.user?.accountId;

        if (!accountId) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Cannot resolve active account for graph read model',
          });
        }

        const nodeBudget = Math.min(
          parseIntegerParam(req.query.node_budget, DEFAULT_NODE_BUDGET),
          HARD_NODE_BUDGET_MAX
        );
        const edgeBudget = Math.min(
          parseIntegerParam(req.query.edge_budget, DEFAULT_EDGE_BUDGET),
          HARD_EDGE_BUDGET_MAX
        );
        const seedNodeIds = parseSeedNodeIds(req.query);

        // Step 1: Count totals
        const [nodeCountResult, edgeCountResult] = await Promise.all([
          db.execute('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?', [accountId]),
          db.execute('SELECT COUNT(*) as count FROM edges WHERE account_id = ?', [accountId]),
        ]);

        const totalNodes = Number(nodeCountResult.records?.[0]?.count || 0);
        const totalEdges = Number(edgeCountResult.records?.[0]?.count || 0);

        // Step 2: Validate seeds (account isolation)
        const verifiedSeedIds: string[] = [];
        if (seedNodeIds.length > 0) {
          const placeholders = seedNodeIds.map(() => '?').join(',');
          const seedResult = await db.execute(
            `SELECT id FROM nodes WHERE account_id = ? AND id IN (${placeholders})`,
            [accountId, ...seedNodeIds]
          );
          for (const row of seedResult.records || []) {
            verifiedSeedIds.push(String(row.id));
          }
        }

        // Step 3: Candidate Selection (fetch metadata only, under budget)
        const allCandidatesResult = await db.execute(
          `SELECT id, kind, created_at FROM nodes WHERE account_id = ?`,
          [accountId]
        );

        const candidateRows = allCandidatesResult.records || [];

        const structuralKinds = new Set(['AccountNode', 'Principal', 'Source', 'Group']);
        const verifiedSeedSet = new Set(verifiedSeedIds);

        candidateRows.sort((a: any, b: any) => {
          const aIsStructural = structuralKinds.has(a.kind);
          const bIsStructural = structuralKinds.has(b.kind);
          if (aIsStructural !== bIsStructural) return aIsStructural ? -1 : 1;

          const aIsSeed = verifiedSeedSet.has(String(a.id));
          const bIsSeed = verifiedSeedSet.has(String(b.id));
          if (aIsSeed !== bIsSeed) return aIsSeed ? -1 : 1;

          const aCreated = a.created_at ? Number(a.created_at) : 0;
          const bCreated = b.created_at ? Number(b.created_at) : 0;
          if (aCreated !== bCreated) return bCreated - aCreated; // Descending

          return String(a.id).localeCompare(String(b.id));
        });

        const selectedNodes = candidateRows.slice(0, nodeBudget);
        const selectedNodeIds = selectedNodes.map((r: any) => String(r.id));
        const selectedNodeSet = new Set(selectedNodeIds);

        let structuralAnchorsRequested = 0;
        let structuralAnchorsReturned = 0;

        for (const r of candidateRows) {
          if (structuralKinds.has(r.kind)) {
            structuralAnchorsRequested++;
            if (selectedNodeSet.has(String(r.id))) {
              structuralAnchorsReturned++;
            }
          }
        }

        const structuralAnchorsPreserved = structuralAnchorsReturned === structuralAnchorsRequested;

        // Step 4: Payload Hydration
        let hydratedNodes: GraphReadModelNode[] = [];
        if (selectedNodeIds.length > 0) {
          const CHUNK_SIZE = 999;
          for (let i = 0; i < selectedNodeIds.length; i += CHUNK_SIZE) {
            const chunk = selectedNodeIds.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '?').join(',');

            const query = `
              SELECT 
                n.id, n.kind, n.properties, n.created_at, n.updated_at,
                p.text as phrase_text, p.normalized_text as phrase_normalized_text, p.type as phrase_type, p.entity_type as phrase_entity_type, p.frequency as phrase_frequency,
                ss.text as span_text, ss.normalized_text as span_normalized_text, ss.start_char as span_start_char, ss.end_char as span_end_char, ss.boundary_kind as span_boundary_kind, ss.span_hash as span_span_hash, ss.source_id as span_source_id,
                pk.text as packet_text, pk.normalized_text as packet_normalized_text, pk.occurrences as packet_occurrences, pk.mass as packet_mass, pk.coverage as packet_coverage, pk.idf as packet_idf, pk.entropy_factor as packet_entropy_factor, pk.packet_hash as packet_packet_hash,
                au.unit_type as atomic_unit_type, au.value as atomic_value, au.normalized_value as atomic_normalized_value, au.unit_hash as atomic_unit_hash
              FROM nodes n
              LEFT JOIN phrases p ON n.id = p.id
              LEFT JOIN source_spans ss ON n.id = ss.id
              LEFT JOIN packets pk ON n.id = pk.id
              LEFT JOIN atomic_units au ON n.id = au.id
              WHERE n.account_id = ? AND n.id IN (${placeholders})
            `;
            const result = await db.execute(query, [accountId, ...chunk]);

            const nodesPart = (result.records || []).map((row: any) => {
              const props = parseProperties(row.properties);

              if (row.kind === 'Phrase') {
                if (row.phrase_text != null) props.text = row.phrase_text;
                if (row.phrase_normalized_text != null)
                  props.normalized_text = row.phrase_normalized_text;
                if (row.phrase_type != null) props.type = row.phrase_type;
                if (row.phrase_entity_type != null) props.entity_type = row.phrase_entity_type;
                if (row.phrase_frequency != null) props.frequency = row.phrase_frequency;
              } else if (row.kind === 'SourceSpan') {
                if (row.span_text != null) props.text = row.span_text;
                if (row.span_normalized_text != null)
                  props.normalized_text = row.span_normalized_text;
                if (row.span_start_char != null) props.start_char = row.span_start_char;
                if (row.span_end_char != null) props.end_char = row.span_end_char;
                if (row.span_boundary_kind != null) props.boundary_kind = row.span_boundary_kind;
                if (row.span_span_hash != null) props.span_hash = row.span_span_hash;
                if (row.span_source_id != null) props.source_id = row.span_source_id;
              } else if (row.kind === 'Packet') {
                if (row.packet_text != null) props.text = row.packet_text;
                if (row.packet_normalized_text != null)
                  props.normalized_text = row.packet_normalized_text;
                if (row.packet_occurrences != null) props.occurrences = row.packet_occurrences;
                if (row.packet_mass != null) props.mass = row.packet_mass;
                if (row.packet_coverage != null) props.coverage = row.packet_coverage;
                if (row.packet_idf != null) props.idf = row.packet_idf;
                if (row.packet_entropy_factor != null)
                  props.entropy_factor = row.packet_entropy_factor;
                if (row.packet_packet_hash != null) props.packet_hash = row.packet_packet_hash;
              } else if (row.kind === 'AtomicUnit') {
                if (row.atomic_unit_type != null) props.unit_type = row.atomic_unit_type;
                if (row.atomic_value != null) props.value = row.atomic_value;
                if (row.atomic_normalized_value != null)
                  props.normalized_value = row.atomic_normalized_value;
                if (row.atomic_unit_hash != null) props.unit_hash = row.atomic_unit_hash;
              }

              return {
                id: String(row.id),
                kind: String(row.kind),
                properties: props,
                created_at: row.created_at ? Number(row.created_at) : undefined,
                updated_at: row.updated_at ? Number(row.updated_at) : undefined,
              };
            });
            hydratedNodes.push(...nodesPart);
          }
        }

        // Preserve sort order
        hydratedNodes.sort((a, b) => {
          const aIdx = selectedNodeIds.indexOf(a.id);
          const bIdx = selectedNodeIds.indexOf(b.id);
          return aIdx - bIdx;
        });

        // Step 5: Edge Extraction
        let fetchedEdges: GraphReadModelEdge[] = [];
        if (selectedNodeIds.length > 0) {
          // Edges are small enough to fetch and filter in memory, but we'll still only fetch within account bounds
          const edgeResult = await db.execute(
            `SELECT id, kind, from_id, to_id, properties, created_at
             FROM edges
             WHERE account_id = ?`,
            [accountId]
          );

          const edgeCandidates = (edgeResult.records || [])
            .filter(
              (row: any) =>
                selectedNodeSet.has(String(row.from_id)) && selectedNodeSet.has(String(row.to_id))
            )
            .map((row: any) => {
              const edgeProps = parseProperties(row.properties);
              return {
                id: String(row.id),
                kind: String(row.kind),
                from: String(row.from_id),
                to: String(row.to_id),
                properties: edgeProps,
                created_at: row.created_at ? Number(row.created_at) : undefined,
              };
            });

          const EXCLUDED_DEFAULT_EDGE_KINDS = new Set(['HAS_SPAN', 'OCCURS_IN_SPAN']);
          const HIERARCHY_EDGE_KINDS = new Set([
            'OWNED_BY',
            'CREATED_BY',
            'IN_GROUP',
            'FOLDS_INTO_FOLDER',
            'HAS_MESSAGE',
            'CONTAINS',
          ]);

          const filteredEdgeCandidates = edgeCandidates.filter(
            (e: any) => !EXCLUDED_DEFAULT_EDGE_KINDS.has(e.kind)
          );

          filteredEdgeCandidates.sort((a: any, b: any) => {
            const aPriority = HIERARCHY_EDGE_KINDS.has(a.kind) ? 1 : 0;
            const bPriority = HIERARCHY_EDGE_KINDS.has(b.kind) ? 1 : 0;
            if (aPriority !== bPriority) return bPriority - aPriority;

            const getStrength = (props: any) => {
              if (!props) return 0;
              const meta = props.metadata || {};
              return Number(
                props.strength ??
                  props.score ??
                  props.similarity ??
                  props.weight ??
                  meta.strength ??
                  meta.score ??
                  meta.similarity ??
                  meta.weight ??
                  0
              );
            };
            const aStrength = getStrength(a.properties);
            const bStrength = getStrength(b.properties);
            if (aStrength !== bStrength) return bStrength - aStrength;

            const aCreated = a.created_at ?? 0;
            const bCreated = b.created_at ?? 0;
            if (aCreated !== bCreated) return bCreated - aCreated;

            return a.id.localeCompare(b.id);
          });

          fetchedEdges = filteredEdgeCandidates.slice(0, edgeBudget);
        }

        const isTruncated = candidateRows.length > nodeBudget || fetchedEdges.length < totalEdges;

        const response: GraphReadModelResponse = {
          nodes: hydratedNodes,
          edges: fetchedEdges,
          metadata: {
            total_nodes: totalNodes,
            total_edges: totalEdges,
            selected_node_count: hydratedNodes.length,
            selected_edge_count: fetchedEdges.length,
            truncated: isTruncated,
            readModel: {
              requestedNodeBudget: nodeBudget,
              effectiveNodeBudget: hydratedNodes.length,
              requestedEdgeBudget: edgeBudget,
              effectiveEdgeBudget: fetchedEdges.length,
              totalNodes,
              returnedNodes: hydratedNodes.length,
              totalEdges,
              returnedEdges: fetchedEdges.length,
              structuralAnchorsRequested,
              structuralAnchorsReturned,
              structuralAnchorsPreserved,
              truncated: isTruncated,
            },
          },
        };

        return res.json(response);
      } catch (error: any) {
        return res.status(500).json({
          error: 'Failed to build graph read model',
          message: error?.message || 'Unknown error',
        });
      }
    }
  );

  return router;
}
