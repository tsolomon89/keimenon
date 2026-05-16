export type LocalInferenceBackend = 'native-gemma' | 'openai-compatible';

export type LocalInferenceState =
  | 'runtime_unimplemented'
  | 'runtime_missing'
  | 'model_missing'
  | 'license_required'
  | 'ready'
  | 'unsupported_hardware'
  | 'error';

export interface LocalModelManifest {
  model_family: 'gemma';
  model_id: string | null;
  variant?: string;
  version?: string;
  source_url?: string;
  local_path?: string;
  checksum?: string;
  license_required: boolean;
  license_accepted: boolean;
  installed: boolean;
  size_bytes?: number;
}

export interface LocalInferenceNextAction {
  id: string;
  label: string;
  description: string;
  requires_user_confirmation: boolean;
  action_type: 'download' | 'install' | 'accept_terms' | 'run_check' | 'open_external';
}

export interface LocalInferenceStatus {
  model_family: 'gemma';
  preferred_backend: LocalInferenceBackend;
  active_backend?: LocalInferenceBackend;
  state: LocalInferenceState;
  can_run_offline: boolean;
  requires_admin: boolean;
  model_id?: string | null;
  model_path?: string;
  error_code?: string;
  message?: string;
  next_actions: LocalInferenceNextAction[];
}
