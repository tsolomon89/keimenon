// apps/web/src/utils/gemma-status-helper.ts

export interface GemmaLocalStatus {
  configured: boolean;
  status: 'online' | 'offline' | 'unavailable';
  error_code?: string;
  error?: string;
  modelAvailable?: boolean;
  runtimeKind?: string;
  modelName?: string;
  timeoutMs?: number;
  thinkingEnabled?: boolean;
  guidance?: {
    title: string;
    explanation: string;
    next_steps: string[];
    expected_runtime_endpoint: string;
    model_requirement: string;
    exact_match_required: boolean;
    advanced_examples?: Array<{
      label: string;
      base_url: string;
      note: string;
    }>;
  };
}

export function getGemmaStatusLabel(status: GemmaLocalStatus | null | undefined): {
  label: string;
  tone: 'online' | 'warning' | 'error' | 'neutral';
} {
  if (!status) {
    return { label: 'Checking...', tone: 'neutral' };
  }

  if (!status.configured) {
    return { label: 'Gemma Not Configured', tone: 'neutral' };
  }

  if (status.error_code === 'GEMMA_MODEL_NOT_FOUND') {
    return { label: 'Gemma Model Missing', tone: 'warning' };
  }

  if (status.error_code === 'GEMMA_LOCAL_RUNTIME_UNAVAILABLE') {
    return { label: 'Gemma Runtime Offline', tone: 'error' };
  }

  if (status.status === 'unavailable') {
    return { label: 'Gemma Unavailable', tone: 'error' };
  }

  if (status.status === 'online' && status.modelAvailable !== false) {
    return { label: 'Gemma Online', tone: 'online' };
  }

  if (status.status === 'offline') {
    return { label: 'Gemma Runtime Offline', tone: 'error' };
  }

  return { label: 'Gemma Runtime Offline', tone: 'error' };
}
