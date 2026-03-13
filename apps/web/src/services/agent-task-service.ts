import { api } from '@/lib/api-client';

export type AgentTaskType =
  | 'GROUP_SUMMARY_BUILD'
  | 'DUPLICATE_SUGGEST'
  | 'VERIFY_SOURCE_CHAIN'
  | 'ANALYZE_SOURCE'
  | 'VERIFY_TOPIC';

export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentTaskSummary {
  id: string;
  type: AgentTaskType | string;
  status: AgentTaskStatus;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error?: string;
}

export interface AgentTaskRun {
  id: string;
  task_id: string;
  attempt: number;
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  completed_at?: number;
  error?: string;
  metrics?: Record<string, number>;
  output?: unknown;
}

export interface AgentTaskArtifact {
  id: string;
  run_id: string;
  type: string;
  content_hash: string;
  storage_path: string;
  created_at: number;
  metadata?: Record<string, unknown>;
}

export interface AgentTaskDetails {
  task: AgentTaskSummary;
  runs: AgentTaskRun[];
  artifacts: AgentTaskArtifact[];
}

const TERMINAL_STATUSES = new Set<AgentTaskStatus>(['completed', 'failed', 'cancelled']);

export async function createAgentTask(input: {
  type: AgentTaskType | string;
  input: Record<string, unknown>;
  config?: Record<string, unknown>;
}): Promise<AgentTaskSummary> {
  const response = await api.post<{ task: AgentTaskSummary }>('/agent/tasks', input);
  return response.data.task;
}

export async function getAgentTask(taskId: string): Promise<AgentTaskDetails> {
  const response = await api.get<AgentTaskDetails>(`/agent/tasks/${taskId}`);
  return response.data;
}

export async function waitForAgentTask(
  taskId: string,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    onUpdate?: (details: AgentTaskDetails) => void;
  }
): Promise<AgentTaskDetails> {
  const timeoutMs = options?.timeoutMs ?? 120000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const details = await getAgentTask(taskId);
    options?.onUpdate?.(details);
    if (TERMINAL_STATUSES.has(details.task.status)) {
      return details;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`Task ${taskId} timed out after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
