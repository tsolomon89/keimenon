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

  return router;
}
