import { DatabaseClient, SQLiteClient } from '@keimenon/db';

export interface ImportPipelineCompensationInput {
  accountId: string;
  createdNodeIds: string[];
  createdEdgeIds: string[];
}

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
}

export class ImportPipelineCompensationService {
  constructor(private readonly dbClient: DatabaseClient) {}

  async rollback(input: ImportPipelineCompensationInput): Promise<void> {
    const accountId = input.accountId;
    if (!accountId) {
      return;
    }

    const nodeIds = unique(input.createdNodeIds);
    const edgeIds = unique(input.createdEdgeIds);
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      return;
    }

    const sqliteDb = (this.dbClient as SQLiteClient).getDatabase();

    // Delete edges first, then nodes to keep FK constraints satisfied.
    if (edgeIds.length > 0) {
      const placeholders = edgeIds.map(() => '?').join(',');
      sqliteDb
        .prepare(`DELETE FROM edges WHERE id IN (${placeholders}) AND account_id = ?`)
        .run(...edgeIds, accountId);
    }

    if (nodeIds.length > 0) {
      const placeholders = nodeIds.map(() => '?').join(',');
      sqliteDb
        .prepare(`DELETE FROM nodes WHERE id IN (${placeholders}) AND account_id = ?`)
        .run(...nodeIds, accountId);
    }
  }
}
