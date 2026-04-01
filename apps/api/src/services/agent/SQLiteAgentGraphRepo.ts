import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  createAgentNode,
  type AgentNode,
  type Artifact,
  type GraphEdge,
  type GraphNode,
  type GraphRepo,
  type GroupNode,
  type NodeStatus,
  type Run,
  type SourceFilters,
  type SourceNode,
  type Task,
} from '@keimenon/agent-core';

type NodeRow = {
  id: string;
  kind: string;
  properties: string;
  account_id: string;
  created_by: string;
  created_at: number;
  updated_at: number;
};

type EdgeRow = {
  id: string;
  kind: string;
  from_id: string;
  to_id: string;
  properties: string | null;
  account_id: string;
  created_by: string;
  created_at: number;
};

type TaskRow = {
  id: string;
  type: string;
  account_id: string;
  agent_id: string;
  status: Task['status'];
  input: string;
  config: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  metadata: string | null;
};

type RunRow = {
  id: string;
  task_id: string;
  attempt: number;
  status: Run['status'];
  started_at: number;
  completed_at: number | null;
  error: string | null;
  metrics: string | null;
  output: string | null;
};

type ArtifactRow = {
  id: string;
  run_id: string;
  type: Artifact['type'];
  content_hash: string;
  storage_path: string;
  created_at: number;
  metadata: string | null;
};

const SOURCE_KINDS = ['Source', 'SourceDoc', 'Message', 'Chat'];
const AGENT_NODE_KINDS = [
  'AgentNode',
  'CanonicalDoc',
  'DuplicateCluster',
  'Evidence',
  'ObjectiveClaim',
  'UnifiedDoc',
];

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class SQLiteAgentGraphRepo implements GraphRepo {
  private readonly createdByCache = new Map<string, string>();

  constructor(private readonly db: Database.Database) {
    this.ensureAgentTables();
  }

  async listGroups(boardId: string, accountId: string): Promise<GroupNode[]> {
    const rows = this.db
      .prepare(
        `
          SELECT n.id, n.kind, n.properties, n.account_id, n.created_by, n.created_at, n.updated_at
          FROM nodes n
          JOIN edges e ON e.to_id = n.id
          WHERE n.account_id = @accountId
            AND n.kind = 'Group'
            AND e.from_id = @boardId
            AND e.account_id = @accountId
          ORDER BY n.created_at DESC
        `
      )
      .all({ boardId, accountId }) as NodeRow[];

    if (rows.length > 0) {
      return rows.map((row) => this.toGroupNode(row));
    }

    const fallbackRows = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE account_id = @accountId
            AND kind = 'Group'
          ORDER BY created_at DESC
          LIMIT 200
        `
      )
      .all({ accountId }) as NodeRow[];

    return fallbackRows.map((row) => this.toGroupNode(row));
  }

  async listSources(
    groupId: string,
    accountId: string,
    filters?: SourceFilters
  ): Promise<SourceNode[]> {
    const kinds = filters?.kinds?.length ? filters.kinds : SOURCE_KINDS;
    const limit = filters?.limit ?? 1000;
    const offset = filters?.offset ?? 0;
    const createdAfter = filters?.created_after ?? null;
    const createdBefore = filters?.created_before ?? null;
    const contentMatch = filters?.content_match ? `%${filters.content_match}%` : null;

    const query = `
      SELECT n.id, n.kind, n.properties, n.account_id, n.created_by, n.created_at, n.updated_at
      FROM nodes n
      JOIN edges e ON e.to_id = n.id
      WHERE e.from_id = ?
        AND e.account_id = ?
        AND n.account_id = ?
        AND n.kind IN (${kinds.map(() => '?').join(', ')})
        AND (? IS NULL OR n.created_at >= ?)
        AND (? IS NULL OR n.created_at <= ?)
        AND (? IS NULL OR n.properties LIKE ?)
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(
      groupId,
      accountId,
      accountId,
      ...kinds,
      createdAfter,
      createdAfter,
      createdBefore,
      createdBefore,
      contentMatch,
      contentMatch,
      limit,
      offset
    ) as NodeRow[];

    return rows.map((row) => this.toSourceNode(row));
  }

  async getSource(
    sourceId: string,
    accountId: string
  ): Promise<{ node: SourceNode; content: string } | null> {
    const row = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE id = ? AND account_id = ?
        `
      )
      .get(sourceId, accountId) as NodeRow | undefined;

    if (!row) {
      return null;
    }

    const sourceNode = this.toSourceNode(row);
    return {
      node: sourceNode,
      content: this.extractNodeContent(sourceNode),
    };
  }

  async getSources(
    sourceIds: string[],
    accountId: string
  ): Promise<Array<{ node: SourceNode; content: string }>> {
    if (sourceIds.length === 0) {
      return [];
    }

    const placeholders = sourceIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE account_id = ?
            AND id IN (${placeholders})
        `
      )
      .all(accountId, ...sourceIds) as NodeRow[];

    return rows.map((row) => {
      const node = this.toSourceNode(row);
      return { node, content: this.extractNodeContent(node) };
    });
  }

  async getNode<T extends GraphNode = GraphNode>(
    nodeId: string,
    accountId: string
  ): Promise<T | null> {
    const row = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE id = ? AND account_id = ?
        `
      )
      .get(nodeId, accountId) as NodeRow | undefined;

    if (!row) {
      return null;
    }

    return this.toGraphNode(row) as T;
  }

  async getNodesByKind<T extends GraphNode = GraphNode>(
    kind: string,
    accountId: string,
    filters?: SourceFilters
  ): Promise<T[]> {
    const limit = filters?.limit ?? 200;
    const offset = filters?.offset ?? 0;
    const rows = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE kind = ? AND account_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(kind, accountId, limit, offset) as NodeRow[];

    return rows.map((row) => this.toGraphNode(row) as T);
  }

  async getEdges(
    nodeId: string,
    accountId: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<GraphEdge[]> {
    let query = `
      SELECT id, kind, from_id, to_id, properties, account_id, created_by, created_at
      FROM edges
      WHERE account_id = @accountId
    `;

    if (direction === 'incoming') {
      query += ' AND to_id = @nodeId';
    } else if (direction === 'outgoing') {
      query += ' AND from_id = @nodeId';
    } else {
      query += ' AND (from_id = @nodeId OR to_id = @nodeId)';
    }

    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all({ nodeId, accountId }) as EdgeRow[];
    return rows.map((row) => this.toGraphEdge(row));
  }

  async createNode<T extends GraphNode>(node: T): Promise<T> {
    const accountId = this.requireAccountId(node.account_id);
    const createdBy = await this.resolveCreatedByUser(accountId);
    const now = Date.now();
    const payload = {
      ...node,
      created_at: node.created_at || now,
      updated_at: node.updated_at || now,
    };

    this.db
      .prepare(
        `
          INSERT OR REPLACE INTO nodes (
            id, kind, properties, account_id, created_by, created_at, updated_at, data_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
        `
      )
      .run(
        payload.id,
        payload.kind,
        JSON.stringify(payload),
        accountId,
        createdBy,
        payload.created_at,
        payload.updated_at
      );

    return payload;
  }

  async createNodes<T extends GraphNode>(nodes: T[]): Promise<T[]> {
    const created: T[] = [];
    for (const node of nodes) {
      created.push(await this.createNode(node));
    }
    return created;
  }

  async createEdge(edge: Omit<GraphEdge, 'id' | 'created_at'>): Promise<GraphEdge> {
    const accountId =
      (edge.metadata?.account_id as string | undefined) ||
      this.resolveAccountIdFromNode(edge.source_id) ||
      this.resolveAccountIdFromNode(edge.target_id);

    if (!accountId) {
      throw new Error('Unable to resolve account_id for edge creation');
    }

    const createdBy =
      (edge.metadata?.created_by as string | undefined) ||
      (await this.resolveCreatedByUser(accountId));

    const created: GraphEdge = {
      id: randomUUID(),
      source_id: edge.source_id,
      target_id: edge.target_id,
      kind: edge.kind,
      weight: edge.weight,
      metadata: edge.metadata,
      created_at: Date.now(),
    };

    const edgePayload = {
      ...created,
      account_id: accountId,
      created_by: createdBy,
    };

    this.db
      .prepare(
        `
          INSERT INTO edges (
            id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'real')
        `
      )
      .run(
        created.id,
        created.kind,
        created.source_id,
        created.target_id,
        JSON.stringify(edgePayload),
        accountId,
        createdBy,
        created.created_at
      );

    return created;
  }

  async createEdges(edges: Array<Omit<GraphEdge, 'id' | 'created_at'>>): Promise<GraphEdge[]> {
    const created: GraphEdge[] = [];
    for (const edge of edges) {
      created.push(await this.createEdge(edge));
    }
    return created;
  }

  async setNodeStatus(nodeId: string, accountId: string, status: NodeStatus): Promise<void> {
    const node = await this.getNode(nodeId, accountId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    if (!AGENT_NODE_KINDS.includes(node.kind)) {
      throw new Error(`setNodeStatus only supports agent-created kinds, got: ${node.kind}`);
    }

    const metadata = (node.metadata as Record<string, unknown> | undefined) || {};
    const updatedNode = {
      ...node,
      metadata: {
        ...metadata,
        status,
      },
      updated_at: Date.now(),
    };

    this.db
      .prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ? AND account_id = ?')
      .run(JSON.stringify(updatedNode), updatedNode.updated_at, nodeId, accountId);
  }

  async saveTask(task: Task): Promise<Task> {
    this.ensureAgentTables();

    this.db
      .prepare(
        `
          INSERT INTO agent_tasks (
            id, type, account_id, agent_id, status, input, config, created_at,
            started_at, completed_at, error, metadata, data_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'real')
        `
      )
      .run(
        task.id,
        task.type,
        task.account_id,
        task.agent_id,
        task.status,
        JSON.stringify(task.input || {}),
        JSON.stringify(task.config || {}),
        task.created_at,
        task.started_at ?? null,
        task.completed_at ?? null,
        task.error ?? null,
        JSON.stringify(task.metadata ?? {})
      );

    return task;
  }

  async updateTaskStatus(taskId: string, status: Task['status'], error?: string): Promise<void> {
    const now = Date.now();
    const setStarted = status === 'running';
    const setCompleted = status === 'completed' || status === 'failed' || status === 'cancelled';

    this.db
      .prepare(
        `
          UPDATE agent_tasks
          SET status = @status,
              error = COALESCE(@error, error),
              started_at = CASE WHEN @setStarted = 1 THEN COALESCE(started_at, @now) ELSE started_at END,
              completed_at = CASE WHEN @setCompleted = 1 THEN @now ELSE completed_at END
          WHERE id = @taskId
        `
      )
      .run({
        taskId,
        status,
        error: error ?? null,
        now,
        setStarted: setStarted ? 1 : 0,
        setCompleted: setCompleted ? 1 : 0,
      });
  }

  async getTask(taskId: string): Promise<Task | null> {
    const row = this.db
      .prepare(
        `
          SELECT id, type, account_id, agent_id, status, input, config, created_at,
                 started_at, completed_at, error, metadata
          FROM agent_tasks
          WHERE id = ?
        `
      )
      .get(taskId) as TaskRow | undefined;

    return row ? this.toTask(row) : null;
  }

  async listTasks(
    accountId: string,
    filters?: { status?: Task['status']; type?: string; limit?: number }
  ): Promise<Task[]> {
    const clauses = ['account_id = @accountId'];
    const params: Record<string, unknown> = {
      accountId,
      limit: filters?.limit ?? 100,
    };

    if (filters?.status) {
      clauses.push('status = @status');
      params.status = filters.status;
    }
    if (filters?.type) {
      clauses.push('type = @type');
      params.type = filters.type;
    }

    const rows = this.db
      .prepare(
        `
          SELECT id, type, account_id, agent_id, status, input, config, created_at,
                 started_at, completed_at, error, metadata
          FROM agent_tasks
          WHERE ${clauses.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT @limit
        `
      )
      .all(params) as TaskRow[];

    return rows.map((row) => this.toTask(row));
  }

  async saveRun(run: Run): Promise<Run> {
    this.db
      .prepare(
        `
          INSERT INTO agent_runs (
            id, task_id, attempt, status, started_at, completed_at, error, metrics, output, data_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'real')
        `
      )
      .run(
        run.id,
        run.task_id,
        run.attempt,
        run.status,
        run.started_at,
        run.completed_at ?? null,
        run.error ?? null,
        JSON.stringify(run.metrics || { duration_ms: 0 }),
        run.output ? JSON.stringify(run.output) : null
      );

    return run;
  }

  async updateRun(
    runId: string,
    updates: Partial<Pick<Run, 'status' | 'completed_at' | 'error' | 'metrics' | 'output'>>
  ): Promise<void> {
    this.db
      .prepare(
        `
          UPDATE agent_runs
          SET status = COALESCE(@status, status),
              completed_at = COALESCE(@completed_at, completed_at),
              error = COALESCE(@error, error),
              metrics = COALESCE(@metrics, metrics),
              output = COALESCE(@output, output)
          WHERE id = @runId
        `
      )
      .run({
        runId,
        status: updates.status ?? null,
        completed_at: updates.completed_at ?? null,
        error: updates.error ?? null,
        metrics: updates.metrics ? JSON.stringify(updates.metrics) : null,
        output: updates.output ? JSON.stringify(updates.output) : null,
      });
  }

  async getRuns(taskId: string): Promise<Run[]> {
    const rows = this.db
      .prepare(
        `
          SELECT id, task_id, attempt, status, started_at, completed_at, error, metrics, output
          FROM agent_runs
          WHERE task_id = ?
          ORDER BY attempt ASC
        `
      )
      .all(taskId) as RunRow[];

    return rows.map((row) => this.toRun(row));
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    this.db
      .prepare(
        `
          INSERT INTO agent_artifacts (
            id, run_id, type, content_hash, storage_path, created_at, metadata, data_tag
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'real')
        `
      )
      .run(
        artifact.id,
        artifact.run_id,
        artifact.type,
        artifact.content_hash,
        artifact.storage_path,
        artifact.created_at,
        JSON.stringify(artifact.metadata ?? {})
      );

    return artifact;
  }

  async getArtifacts(runId: string): Promise<Artifact[]> {
    const rows = this.db
      .prepare(
        `
          SELECT id, run_id, type, content_hash, storage_path, created_at, metadata
          FROM agent_artifacts
          WHERE run_id = ?
          ORDER BY created_at ASC
        `
      )
      .all(runId) as ArtifactRow[];

    return rows.map((row) => this.toArtifact(row));
  }

  async getOrCreateAgent(accountId: string): Promise<AgentNode> {
    const agentId = `agent-${accountId}`;

    const selectAgentRow = this.db.prepare(
      `
        SELECT id, kind, properties, account_id, created_by, created_at, updated_at
        FROM nodes
        WHERE id = ? AND account_id = ? AND kind = 'AgentNode'
      `
    );

    const existing = selectAgentRow.get(agentId, accountId) as NodeRow | undefined;

    if (existing) {
      return this.toAgentNode(existing, accountId);
    }

    const agent = createAgentNode(agentId, accountId);
    const createdBy = await this.resolveCreatedByUser(accountId);

    this.db
      .prepare(
        `
          INSERT OR IGNORE INTO nodes (
            id, kind, properties, account_id, created_by, created_at, updated_at, data_tag
          ) VALUES (?, 'AgentNode', ?, ?, ?, ?, ?, 'real')
        `
      )
      .run(
        agent.id,
        JSON.stringify(agent),
        accountId,
        createdBy,
        agent.created_at,
        agent.updated_at
      );

    const createdOrExisting = selectAgentRow.get(agentId, accountId) as NodeRow | undefined;
    if (!createdOrExisting) {
      throw new Error(`Failed to create or load agent node for account ${accountId}`);
    }

    return this.toAgentNode(createdOrExisting, accountId);
  }

  async updateAgent(
    agentId: string,
    updates: Partial<Pick<AgentNode, 'name' | 'is_active' | 'metadata'>>
  ): Promise<void> {
    const row = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE id = ? AND kind = 'AgentNode'
        `
      )
      .get(agentId) as NodeRow | undefined;

    if (!row) {
      throw new Error(`Agent node not found: ${agentId}`);
    }

    const agent = this.toAgentNode(row, row.account_id);
    const updated: AgentNode = {
      ...agent,
      name: updates.name ?? agent.name,
      is_active: updates.is_active ?? agent.is_active,
      metadata: {
        ...agent.metadata,
        ...(updates.metadata ?? {}),
      },
      updated_at: Date.now(),
    };

    this.db
      .prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(updated), updated.updated_at, agentId);
  }

  async getSourcesByImportBatch(
    importBatchId: string,
    accountId: string,
    filters?: { limit?: number }
  ): Promise<SourceNode[]> {
    const limit = filters?.limit ?? 1000;
    const rows = this.db
      .prepare(
        `
          SELECT id, kind, properties, account_id, created_by, created_at, updated_at
          FROM nodes
          WHERE account_id = ?
            AND kind IN (${SOURCE_KINDS.map(() => '?').join(', ')})
          ORDER BY created_at DESC
          LIMIT ?
        `
      )
      .all(accountId, ...SOURCE_KINDS, limit) as NodeRow[];

    return rows
      .map((row) => this.toSourceNode(row))
      .filter((source) => {
        const metadata = (source.metadata as Record<string, unknown> | undefined) || {};
        return (
          metadata.import_id === importBatchId ||
          metadata.importId === importBatchId ||
          (source as any).import_id === importBatchId ||
          (source as any).importId === importBatchId
        );
      });
  }

  private ensureAgentTables(): void {
    this.migrateAgentTablesForBigBang();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        account_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        input TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error TEXT,
        metadata TEXT,
        data_tag TEXT DEFAULT 'real'
      );

      CREATE INDEX IF NOT EXISTS idx_agent_tasks_account ON agent_tasks(account_id);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_type ON agent_tasks(type);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON agent_tasks(created_at);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        error TEXT,
        metrics TEXT,
        output TEXT,
        data_tag TEXT DEFAULT 'real'
      );

      CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

      CREATE TABLE IF NOT EXISTS agent_artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT,
        data_tag TEXT DEFAULT 'real'
      );

      CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run ON agent_artifacts(run_id);
      CREATE INDEX IF NOT EXISTS idx_agent_artifacts_hash ON agent_artifacts(content_hash);
      CREATE INDEX IF NOT EXISTS idx_agent_artifacts_type ON agent_artifacts(type);
    `);

    const runColumns = this.db.prepare("PRAGMA table_info('agent_runs')").all() as Array<{
      name: string;
    }>;
    const hasOutputColumn = runColumns.some((column) => column.name === 'output');
    if (!hasOutputColumn) {
      this.db.exec(`ALTER TABLE agent_runs ADD COLUMN output TEXT;`);
    }
  }

  private migrateAgentTablesForBigBang(): void {
    const tableSqlRows = this.db
      .prepare(
        `
          SELECT name, sql
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN ('agent_tasks', 'agent_artifacts')
        `
      )
      .all() as Array<{ name: string; sql: string | null }>;

    const taskSql = tableSqlRows.find((row) => row.name === 'agent_tasks')?.sql || '';
    if (
      taskSql.includes(
        "CHECK(type IN ('GROUP_SUMMARY_BUILD', 'DUPLICATE_SUGGEST', 'VERIFY_SOURCE_CHAIN'))"
      )
    ) {
      this.db.exec(`
        ALTER TABLE agent_tasks RENAME TO agent_tasks_legacy_bigbang;
        CREATE TABLE agent_tasks (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          account_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
          input TEXT NOT NULL,
          config TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          error TEXT,
          metadata TEXT,
          data_tag TEXT DEFAULT 'real'
        );
        INSERT INTO agent_tasks (
          id, type, account_id, agent_id, status, input, config, created_at,
          started_at, completed_at, error, metadata, data_tag
        )
        SELECT
          id, type, account_id, agent_id, status, input, config, created_at,
          started_at, completed_at, error, metadata, data_tag
        FROM agent_tasks_legacy_bigbang;
        DROP TABLE agent_tasks_legacy_bigbang;
      `);
    }

    const artifactSql = tableSqlRows.find((row) => row.name === 'agent_artifacts')?.sql || '';
    if (
      artifactSql.includes(
        "CHECK(type IN ('canonical_doc', 'cluster_json', 'evidence_chain', 'diff', 'log'))"
      )
    ) {
      this.db.exec(`
        ALTER TABLE agent_artifacts RENAME TO agent_artifacts_legacy_bigbang;
        CREATE TABLE agent_artifacts (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          metadata TEXT,
          data_tag TEXT DEFAULT 'real'
        );
        INSERT INTO agent_artifacts (
          id, run_id, type, content_hash, storage_path, created_at, metadata, data_tag
        )
        SELECT
          id, run_id, type, content_hash, storage_path, created_at, metadata, data_tag
        FROM agent_artifacts_legacy_bigbang;
        DROP TABLE agent_artifacts_legacy_bigbang;
      `);
    }
  }

  private toGroupNode(row: NodeRow): GroupNode {
    const graphNode = this.toGraphNode(row);
    return {
      ...graphNode,
      kind: 'Group',
      name:
        typeof (graphNode as any).name === 'string'
          ? (graphNode as any).name
          : typeof (graphNode as any).title === 'string'
            ? (graphNode as any).title
            : `Group ${graphNode.id.slice(0, 8)}`,
    };
  }

  private toSourceNode(row: NodeRow): SourceNode {
    const graphNode = this.toGraphNode(row);
    return {
      ...graphNode,
      kind: 'Source',
      title:
        typeof (graphNode as any).title === 'string'
          ? (graphNode as any).title
          : typeof (graphNode as any).name === 'string'
            ? (graphNode as any).name
            : undefined,
      content_hash:
        typeof (graphNode as any).content_hash === 'string'
          ? (graphNode as any).content_hash
          : undefined,
      content_location:
        typeof (graphNode as any).content_location === 'string'
          ? (graphNode as any).content_location
          : undefined,
    };
  }

  private toGraphNode(row: NodeRow): GraphNode {
    const parsed = parseJson<Record<string, unknown>>(row.properties, {});
    return {
      ...parsed,
      id: row.id,
      kind: row.kind,
      account_id: row.account_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: (parsed.metadata as Record<string, unknown> | undefined) || {},
    } as GraphNode;
  }

  private toGraphEdge(row: EdgeRow): GraphEdge {
    const parsed = parseJson<Record<string, unknown>>(row.properties, {});
    return {
      id: row.id,
      kind: row.kind,
      source_id: row.from_id,
      target_id: row.to_id,
      weight:
        typeof parsed.weight === 'number'
          ? parsed.weight
          : typeof (parsed.metadata as any)?.similarity === 'number'
            ? (parsed.metadata as any).similarity
            : undefined,
      metadata: (parsed.metadata as Record<string, unknown> | undefined) || {},
      created_at: row.created_at,
    };
  }

  private toTask(row: TaskRow): Task {
    return {
      id: row.id,
      type: row.type as Task['type'],
      account_id: row.account_id,
      agent_id: row.agent_id,
      status: row.status,
      input: parseJson<Record<string, unknown>>(row.input, {}),
      config: parseJson(row.config, { version: '1.0.0' }),
      created_at: row.created_at,
      started_at: row.started_at ?? undefined,
      completed_at: row.completed_at ?? undefined,
      error: row.error ?? undefined,
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    };
  }

  private toRun(row: RunRow): Run {
    return {
      id: row.id,
      task_id: row.task_id,
      attempt: row.attempt,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at ?? undefined,
      error: row.error ?? undefined,
      metrics: parseJson(row.metrics, { duration_ms: 0 }),
      output: parseJson(row.output, undefined),
    };
  }

  private toArtifact(row: ArtifactRow): Artifact {
    return {
      id: row.id,
      run_id: row.run_id,
      type: row.type,
      content_hash: row.content_hash,
      storage_path: row.storage_path,
      created_at: row.created_at,
      metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    };
  }

  private toAgentNode(row: NodeRow, accountId: string): AgentNode {
    const parsed = parseJson<Partial<AgentNode>>(row.properties, {});
    return {
      id: row.id,
      kind: 'AgentNode',
      account_id: accountId,
      name: parsed.name || 'Keimenon Agent',
      description: parsed.description,
      is_active: parsed.is_active ?? true,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: {
        capabilities: ['summarize', 'dedupe', 'extract', 'cluster'],
        ...(parsed.metadata || {}),
      },
    };
  }

  private extractNodeContent(node: SourceNode): string {
    const anyNode = node as any;
    if (typeof anyNode.content === 'string') {
      return anyNode.content;
    }
    if (typeof anyNode.text === 'string') {
      return anyNode.text;
    }
    if (typeof anyNode.body === 'string') {
      return anyNode.body;
    }

    const metadata = (node.metadata as Record<string, unknown> | undefined) || {};
    if (typeof metadata.content === 'string') {
      return metadata.content;
    }
    if (typeof metadata.text === 'string') {
      return metadata.text;
    }

    return JSON.stringify(anyNode);
  }

  private requireAccountId(accountId: string | undefined): string {
    if (!accountId) {
      throw new Error('account_id is required for graph mutations');
    }
    return accountId;
  }

  private resolveAccountIdFromNode(nodeId: string): string | null {
    const row = this.db.prepare('SELECT account_id FROM nodes WHERE id = ? LIMIT 1').get(nodeId) as
      | { account_id?: string }
      | undefined;
    return row?.account_id || null;
  }

  private async resolveCreatedByUser(accountId: string): Promise<string> {
    const cached = this.createdByCache.get(accountId);
    if (cached) {
      return cached;
    }

    const activeMembership = this.db
      .prepare(
        `
          SELECT ua.user_id
          FROM user_accounts ua
          WHERE ua.account_id = ? AND ua.status = 'active'
          ORDER BY ua.role_rank DESC, ua.joined_at ASC
          LIMIT 1
        `
      )
      .get(accountId) as { user_id?: string } | undefined;

    if (activeMembership?.user_id) {
      this.createdByCache.set(accountId, activeMembership.user_id);
      return activeMembership.user_id;
    }

    const anyMembership = this.db
      .prepare(
        `
          SELECT ua.user_id
          FROM user_accounts ua
          WHERE ua.account_id = ?
          ORDER BY ua.role_rank DESC, ua.joined_at ASC
          LIMIT 1
        `
      )
      .get(accountId) as { user_id?: string } | undefined;

    if (anyMembership?.user_id) {
      this.createdByCache.set(accountId, anyMembership.user_id);
      return anyMembership.user_id;
    }

    throw new Error(`No user membership found for account ${accountId}`);
  }
}
