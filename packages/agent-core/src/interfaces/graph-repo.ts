/**
 * GraphRepo Interface
 *
 * Provides read/write access to the knowledge graph.
 * Agents use this interface to query and create nodes/edges.
 *
 * Key principle: Agents create NEW nodes, never edit existing sources.
 */

import type { Task, Run, Artifact, AgentNode } from '../types/index.js';

/**
 * Node status for agent-created nodes
 */
export type NodeStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';

/**
 * Source filters for querying
 */
export interface SourceFilters {
  /** Filter by node kinds */
  kinds?: string[];
  /** Filter by creation date range */
  created_after?: number;
  created_before?: number;
  /** Filter by content match */
  content_match?: string;
  /** Pagination limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * Generic node interface for graph operations
 */
export interface GraphNode {
  id: string;
  kind: string;
  account_id?: string;
  created_at: number;
  updated_at: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Generic edge interface for graph operations
 */
export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  kind: string;
  weight?: number;
  metadata?: Record<string, unknown>;
  created_at: number;
}

/**
 * Group node with sources
 */
export interface GroupNode extends GraphNode {
  kind: 'Group';
  name: string;
  description?: string;
  board_id?: string;
}

/**
 * Source node with content reference
 */
export interface SourceNode extends GraphNode {
  kind: 'Source';
  title?: string;
  content_hash?: string;
  content_location?: string;
}

/**
 * GraphRepo interface for agent graph access
 *
 * Implements the read/write pattern where:
 * - Read: Query existing nodes and edges
 * - Write: Create new nodes (never edit sources)
 */
export interface GraphRepo {
  // ============================================
  // Read Operations
  // ============================================

  /**
   * List groups for a board
   */
  listGroups(boardId: string, accountId: string): Promise<GroupNode[]>;

  /**
   * List sources in a group
   */
  listSources(groupId: string, accountId: string, filters?: SourceFilters): Promise<SourceNode[]>;

  /**
   * Get a single source with its content
   */
  getSource(
    sourceId: string,
    accountId: string
  ): Promise<{ node: SourceNode; content: string } | null>;

  /**
   * Get multiple sources by IDs
   */
  getSources(
    sourceIds: string[],
    accountId: string
  ): Promise<Array<{ node: SourceNode; content: string }>>;

  /**
   * Get a node by ID
   */
  getNode<T extends GraphNode = GraphNode>(nodeId: string, accountId: string): Promise<T | null>;

  /**
   * Query nodes by kind
   */
  getNodesByKind<T extends GraphNode = GraphNode>(
    kind: string,
    accountId: string,
    filters?: SourceFilters
  ): Promise<T[]>;

  /**
   * Get edges connected to a node
   */
  getEdges(
    nodeId: string,
    accountId: string,
    direction?: 'incoming' | 'outgoing' | 'both'
  ): Promise<GraphEdge[]>;

  // ============================================
  // Write Operations (Creates only, no edits to sources)
  // ============================================

  /**
   * Create a new node
   * Returns the created node with any server-generated fields
   */
  createNode<T extends GraphNode>(node: T): Promise<T>;

  /**
   * Create multiple nodes in a batch
   */
  createNodes<T extends GraphNode>(nodes: T[]): Promise<T[]>;

  /**
   * Create a new edge
   */
  createEdge(edge: Omit<GraphEdge, 'id' | 'created_at'>): Promise<GraphEdge>;

  /**
   * Create multiple edges in a batch
   */
  createEdges(edges: Array<Omit<GraphEdge, 'id' | 'created_at'>>): Promise<GraphEdge[]>;

  /**
   * Set status on an agent-created node
   * Only works for nodes created by agents (not user sources)
   */
  setNodeStatus(nodeId: string, accountId: string, status: NodeStatus): Promise<void>;

  // ============================================
  // Task/Run/Artifact Storage
  // ============================================

  /**
   * Save a task record
   */
  saveTask(task: Task): Promise<Task>;

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: Task['status'], error?: string): Promise<void>;

  /**
   * Get a task by ID
   */
  getTask(taskId: string): Promise<Task | null>;

  /**
   * List tasks for an account
   */
  listTasks(
    accountId: string,
    filters?: { status?: Task['status']; type?: string; limit?: number }
  ): Promise<Task[]>;

  /**
   * Save a run record
   */
  saveRun(run: Run): Promise<Run>;

  /**
   * Update run status and metrics
   */
  updateRun(
    runId: string,
    updates: Partial<Pick<Run, 'status' | 'completed_at' | 'error' | 'metrics' | 'output'>>
  ): Promise<void>;

  /**
   * Get runs for a task
   */
  getRuns(taskId: string): Promise<Run[]>;

  /**
   * Save an artifact record
   */
  saveArtifact(artifact: Artifact): Promise<Artifact>;

  /**
   * Get artifacts for a run
   */
  getArtifacts(runId: string): Promise<Artifact[]>;

  // ============================================
  // Agent Management
  // ============================================

  /**
   * Get or create the agent for an account
   */
  getOrCreateAgent(accountId: string): Promise<AgentNode>;

  /**
   * Update agent metadata
   */
  updateAgent(
    agentId: string,
    updates: Partial<Pick<AgentNode, 'name' | 'is_active' | 'metadata'>>
  ): Promise<void>;
}
