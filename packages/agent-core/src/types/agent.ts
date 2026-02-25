/**
 * Agent Types
 *
 * AgentNode represents the "AI agent user" on the graph.
 * Created per-account to track agent operations and capabilities.
 */

/**
 * Agent capabilities
 */
export type AgentCapability =
  | 'summarize'
  | 'dedupe'
  | 'verify'
  | 'extract'
  | 'cluster';

/**
 * AgentNode represents an AI agent operating on behalf of an account
 *
 * Unlike user nodes, agent nodes are system-created and have
 * limited, well-defined capabilities.
 */
export interface AgentNode {
  /** Unique agent identifier */
  id: string;
  /** Node kind - always 'AgentNode' */
  kind: 'AgentNode';
  /** Account this agent operates for */
  account_id: string;
  /** Human-readable agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Whether the agent is currently active */
  is_active: boolean;
  /** Creation timestamp */
  created_at: number;
  /** Last update timestamp */
  updated_at: number;
  /** Agent metadata */
  metadata: AgentMetadata;
}

/**
 * Agent metadata configuration
 */
export interface AgentMetadata {
  /** List of enabled capabilities */
  capabilities: AgentCapability[];
  /** Agent version */
  version?: string;
  /** Model preference (if any) */
  preferred_model?: string;
  /** Last activity timestamp */
  last_active_at?: number;
  /** Total tasks executed */
  total_tasks?: number;
  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Agent configuration for creation/updates
 */
export interface AgentConfig {
  /** Agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Enabled capabilities */
  capabilities: AgentCapability[];
  /** Preferred model for LLM operations */
  preferred_model?: string;
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: 'Keimenon Agent',
  description: 'Default AI agent for automated tasks',
  capabilities: ['summarize', 'dedupe', 'extract', 'cluster'],
};

/**
 * Create a new AgentNode with defaults
 */
export function createAgentNode(
  id: string,
  accountId: string,
  config: Partial<AgentConfig> = {}
): AgentNode {
  const finalConfig = { ...DEFAULT_AGENT_CONFIG, ...config };
  const now = Date.now();

  return {
    id,
    kind: 'AgentNode',
    account_id: accountId,
    name: finalConfig.name,
    description: finalConfig.description,
    is_active: true,
    created_at: now,
    updated_at: now,
    metadata: {
      capabilities: finalConfig.capabilities,
      preferred_model: finalConfig.preferred_model,
      version: '1.0.0',
      total_tasks: 0,
    },
  };
}
