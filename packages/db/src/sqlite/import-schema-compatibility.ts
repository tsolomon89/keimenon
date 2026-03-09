import Database from 'better-sqlite3';

export const REQUIRED_IMPORT_NODE_KINDS = [
  'UploadItem',
  'Source',
  'SourceSpan',
  'Packet',
  'AtomicUnit',
  'Group',
  'CodeBlock',
  'Message',
  'Lexeme',
  'Phrase',
  'Topic',
  'Principal',
  'ConversationThread',
] as const;

export const REQUIRED_IMPORT_EDGE_KINDS = [
  'CONTAINS',
  'HAS_SPAN',
  'OCCURS_IN_SPAN',
  'COMPOSED_OF_ATOMIC',
  'EXTRACTED_FROM',
  'HAS_MESSAGE',
  'COMPILED_FROM',
  'IN_GROUP',
  'DUP_OF',
  'MENTIONS',
  'BELONGS_TO_TOPIC',
  'CREATED_BY',
  'INITIATED_BY',
  'PARTICIPATED_IN',
] as const;

export interface ImportSchemaCompatibilityResult {
  compatible: boolean;
  missingNodeKinds: string[];
  missingEdgeKinds: string[];
  nodesSql: string;
  edgesSql: string;
}

export class ImportSchemaCompatibilityError extends Error {
  readonly code = 'SCHEMA_MISMATCH';
  readonly missingNodeKinds: string[];
  readonly missingEdgeKinds: string[];

  constructor(result: ImportSchemaCompatibilityResult) {
    const parts: string[] = [];
    if (result.missingNodeKinds.length > 0) {
      parts.push(`missing node kinds: ${result.missingNodeKinds.join(', ')}`);
    }
    if (result.missingEdgeKinds.length > 0) {
      parts.push(`missing edge kinds: ${result.missingEdgeKinds.join(', ')}`);
    }

    super(
      `Database schema is not compatible with the current import pipeline (${parts.join('; ')}). ` +
        'Database migration required.'
    );

    this.name = 'ImportSchemaCompatibilityError';
    this.missingNodeKinds = result.missingNodeKinds;
    this.missingEdgeKinds = result.missingEdgeKinds;
  }
}

function getTableSql(db: Database.Database, tableName: string): string {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName) as { sql?: string } | undefined;

  return row?.sql ?? '';
}

function findMissingKinds(sql: string, requiredKinds: readonly string[]): string[] {
  return requiredKinds.filter((kind) => !sql.includes(`'${kind}'`));
}

export function getImportSchemaCompatibility(
  db: Database.Database
): ImportSchemaCompatibilityResult {
  const nodesSql = getTableSql(db, 'nodes');
  const edgesSql = getTableSql(db, 'edges');

  const missingNodeKinds = findMissingKinds(nodesSql, REQUIRED_IMPORT_NODE_KINDS);
  const missingEdgeKinds = findMissingKinds(edgesSql, REQUIRED_IMPORT_EDGE_KINDS);

  return {
    compatible: missingNodeKinds.length === 0 && missingEdgeKinds.length === 0,
    missingNodeKinds,
    missingEdgeKinds,
    nodesSql,
    edgesSql,
  };
}

export function assertImportSchemaCompatibility(
  db: Database.Database
): ImportSchemaCompatibilityResult {
  const result = getImportSchemaCompatibility(db);

  if (!result.compatible) {
    throw new ImportSchemaCompatibilityError(result);
  }

  return result;
}
