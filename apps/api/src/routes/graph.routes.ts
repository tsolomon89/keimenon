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

        // We fetch raw count for metadata
        const [nodeCountResult, edgeCountResult, edgeRowsResult] = await Promise.all([
          db.execute('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?', [accountId]),
          db.execute('SELECT COUNT(*) as count FROM edges WHERE account_id = ?', [accountId]),
          db.execute(
            `SELECT id, kind, from_id, to_id, properties, created_at
             FROM edges
             WHERE account_id = ?`,
            [accountId]
          ),
        ]);

        const totalNodes = Number(nodeCountResult.records?.[0]?.count || 0);
        const totalEdges = Number(edgeCountResult.records?.[0]?.count || 0);

        let query = `
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
          WHERE n.account_id = ?
        `;
        const params: any[] = [accountId];

        // The SnapshotService handles truncating node_budget, but since we are doing LEFT JOINS here,
        // it's safer to just fetch everything if we are within the budget, or if we have seeds, fetch everything.
        // The actual snapshot filtering handles edges correctly.
        // We'll trust the memory boundary of ~5000 limit in development.
        const result = await db.execute(query, params);

        const nodes: SnapshotNodeRecord[] = (result.records || []).map((row: any) => {
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
            if (row.span_normalized_text != null) props.normalized_text = row.span_normalized_text;
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
            if (row.packet_entropy_factor != null) props.entropy_factor = row.packet_entropy_factor;
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
          error: 'Failed to build graph read model',
          message: error?.message || 'Unknown error',
        });
      }
    }
  );

  return router;
}
