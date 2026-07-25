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

    // Chunk array helper
    const chunk = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // Delete edges first, then nodes to keep FK constraints satisfied.
    if (edgeIds.length > 0) {
      for (const edgeChunk of chunk(edgeIds, 500)) {
        const placeholders = edgeChunk.map(() => '?').join(',');
        sqliteDb
          .prepare(`DELETE FROM edges WHERE id IN (${placeholders}) AND account_id = ?`)
          .run(...edgeChunk, accountId);
      }
    }

    if (nodeIds.length > 0) {
      for (const nodeChunk of chunk(nodeIds, 500)) {
        const placeholders = nodeChunk.map(() => '?').join(',');
        sqliteDb
          .prepare(`DELETE FROM nodes WHERE id IN (${placeholders}) AND account_id = ?`)
          .run(...nodeChunk, accountId);
      }
    }
  }
}
