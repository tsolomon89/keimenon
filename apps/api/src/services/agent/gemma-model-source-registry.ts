export interface GemmaModelSourceCandidate {
  id: string;
  model_family: 'gemma';
  model_id: string | null;
  display_name: string;
  variant?: string;
  runtime_format?: 'litert' | 'tflite' | 'task' | 'unknown';
  source_kind: 'official_google' | 'official_huggingface' | 'official_kaggle' | 'manual';
  source_url: string;
  terms_url?: string;
  source_verified: boolean;
  artifact_verified: boolean;
  runtime_compatibility_verified: boolean;
  verification_notes: string;
  local_runtime_supported: boolean | 'unknown';
  requires_auth?: boolean;
  requires_terms_acceptance?: boolean;
  expected_size_bytes?: number;
  checksum?: string;
  download_url?: string | null;
}

export const GEMMA_MODEL_SOURCES: GemmaModelSourceCandidate[] = [
  {
    id: 'gemma-2-2b-it-kaggle',
    model_family: 'gemma',
    model_id: null,
    display_name: 'Gemma 2 2B IT (Kaggle)',
    variant: '2b-it',
    runtime_format: 'unknown',
    source_kind: 'official_kaggle',
    source_url: 'https://www.kaggle.com/models/google/gemma-2/tfLite',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes:
      'Candidate LiteRT-compatible artifact path pending exact official file verification.',
    local_runtime_supported: 'unknown',
    requires_auth: true,
    requires_terms_acceptance: true,
    download_url: null,
  },
  {
    id: 'gemma-2-2b-it-hf',
    model_family: 'gemma',
    model_id: null,
    display_name: 'Gemma 2 2B IT (Hugging Face)',
    variant: '2b-it',
    runtime_format: 'unknown',
    source_kind: 'official_huggingface',
    source_url: 'https://huggingface.com/google/gemma-2-2b-it',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes:
      'Candidate LiteRT-compatible artifact path pending exact official file verification.',
    local_runtime_supported: 'unknown',
    requires_auth: true,
    requires_terms_acceptance: true,
    download_url: null,
  },
];

export class GemmaModelSourceRegistry {
  public async getCandidates(): Promise<GemmaModelSourceCandidate[]> {
    // In the future, this could fetch dynamically or filter based on hardware.
    // For now, it returns the static list of official targets.
    return GEMMA_MODEL_SOURCES;
  }
}

export const gemmaModelSourceRegistry = new GemmaModelSourceRegistry();
