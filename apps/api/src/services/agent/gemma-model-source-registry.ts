export interface GemmaModelSourceCandidate {
  id: string;
  model_family: 'gemma';
  model_generation?: 'gemma-4';
  model_id: string | null;
  display_name: string;
  variant?: 'e2b' | 'e4b' | '26b' | '31b' | string;
  runtime_format?: 'litert' | 'tflite' | 'task' | 'unknown';
  source_kind: 'official_google' | 'official_huggingface' | 'official_kaggle' | 'manual';
  source_url: string;
  terms_url?: string;
  source_verified: boolean;
  artifact_verified: boolean;
  runtime_compatibility_verified: boolean;
  verification_notes: string;
  local_runtime_supported: boolean | 'unknown';
  requires_auth?: boolean | 'unknown';
  requires_terms_acceptance?: boolean | 'unknown';
  expected_size_bytes?: number;
  checksum?: string;
  download_url?: string | null;
}

const COMMON_NOTES =
  'Official Gemma 4 variant verified from Google DeepMind. Exact native/LiteRT artifact URL pending verification.';

export const GEMMA_MODEL_SOURCES: GemmaModelSourceCandidate[] = [
  {
    id: 'gemma-4-e2b-source-pending',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: null,
    display_name: 'Gemma 4 E2B',
    variant: 'e2b',
    runtime_format: 'unknown',
    source_kind: 'official_google',
    source_url: 'https://deepmind.google/models/gemma/',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes: COMMON_NOTES,
    local_runtime_supported: 'unknown',
    requires_auth: 'unknown',
    requires_terms_acceptance: true,
    download_url: null,
  },
  {
    id: 'gemma-4-e4b-source-pending',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: null,
    display_name: 'Gemma 4 E4B',
    variant: 'e4b',
    runtime_format: 'unknown',
    source_kind: 'official_google',
    source_url: 'https://deepmind.google/models/gemma/',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes: COMMON_NOTES,
    local_runtime_supported: 'unknown',
    requires_auth: 'unknown',
    requires_terms_acceptance: true,
    download_url: null,
  },
  {
    id: 'gemma-4-26b-source-pending',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: null,
    display_name: 'Gemma 4 26B',
    variant: '26b',
    runtime_format: 'unknown',
    source_kind: 'official_google',
    source_url: 'https://deepmind.google/models/gemma/',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes: COMMON_NOTES,
    local_runtime_supported: 'unknown',
    requires_auth: 'unknown',
    requires_terms_acceptance: true,
    download_url: null,
  },
  {
    id: 'gemma-4-31b-source-pending',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: null,
    display_name: 'Gemma 4 31B',
    variant: '31b',
    runtime_format: 'unknown',
    source_kind: 'official_google',
    source_url: 'https://deepmind.google/models/gemma/',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes: COMMON_NOTES,
    local_runtime_supported: 'unknown',
    requires_auth: 'unknown',
    requires_terms_acceptance: true,
    download_url: null,
  },
];

export class GemmaModelSourceRegistry {
  public async getCandidates(): Promise<GemmaModelSourceCandidate[]> {
    return GEMMA_MODEL_SOURCES;
  }
}

export const gemmaModelSourceRegistry = new GemmaModelSourceRegistry();
