export type LocalInferenceBackend = 'native-gemma' | 'openai-compatible';

export type LocalInferenceState =
  | 'runtime_unimplemented'
  | 'runtime_missing'
  | 'model_missing'
  | 'license_required'
  | 'ready'
  | 'unsupported_hardware'
  | 'error';

export type LocalModelAcquisitionState =
  | 'source_pending'
  | 'terms_required'
  | 'ready_to_download'
  | 'downloading'
  | 'downloaded'
  | 'verified'
  | 'failed';

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
  license_accepted_at?: number;
  terms_source?: string;
  installed: boolean;
  size_bytes?: number;
  source_kind?: 'official_google' | 'official_huggingface' | 'official_kaggle' | 'manual';
  download_status?: 'not_started' | 'pending' | 'downloading' | 'complete' | 'failed';
  verification_status?: 'unchecked' | 'verified' | 'failed';
}

export interface LocalInferenceNextAction {
  id: string;
  label: string;
  description: string;
  requires_user_confirmation: boolean;
  action_type: 'download' | 'install' | 'accept_terms' | 'run_check' | 'open_external';
  disabled?: boolean;
  disabled_reason?: string;
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

export interface ModelDownloadPlan {
  model_id: string | null;
  source_kind: 'official_google' | 'official_huggingface' | 'official_kaggle' | 'manual';
  can_download: boolean;
  blocked_reason?: string;
  expected_size_bytes?: number;
  terms_url?: string;
  download_instructions?: string;
}
