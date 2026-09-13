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
    id: 'gemma-4-e2b-it-litert',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: 'google/gemma-4-e2b-it',
    display_name: 'Gemma 4 E2B (LiteRT)',
    variant: 'e2b',
    runtime_format: 'litert',
    source_kind: 'official_huggingface',
    source_url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: true,
    runtime_compatibility_verified: true,
    verification_notes:
      'Official litert-community artifact hosted on Hugging Face. Ready for LiteRT-LM deployment.',
    local_runtime_supported: true,
    requires_auth: false,
    requires_terms_acceptance: true,
    expected_size_bytes: 2588147712,
    checksum: '181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c',
    download_url:
      'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1/gemma-4-E2B-it.litertlm',
  },
  {
    id: 'gemma-4-e4b-it-litert',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: 'google/gemma-4-e4b-it',
    display_name: 'Gemma 4 E4B (LiteRT)',
    variant: 'e4b',
    runtime_format: 'litert',
    source_kind: 'official_huggingface',
    source_url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: true,
    runtime_compatibility_verified: true,
    verification_notes:
      'Official litert-community artifact hosted on Hugging Face. Ready for LiteRT-LM deployment.',
    local_runtime_supported: true,
    requires_auth: false,
    requires_terms_acceptance: true,
    expected_size_bytes: 3659530240,
    checksum: '0b2a8980ce155fd97673d8e820b4d29d9c7d99b8fa6806f425d969b145bd52e0',
    download_url:
      'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/2eee7ac325f20eb8c9ac1d0e972f7c84663062da/gemma-4-E4B-it.litertlm',
  },
  {
    id: 'gemma-4-26b-a4b-it-huggingface',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: 'google/gemma-4-26b-a4b-it',
    display_name: 'Gemma 4 26B A4B IT (MoE)',
    variant: '26b',
    runtime_format: 'unknown',
    source_kind: 'official_huggingface',
    source_url: 'https://huggingface.co/google/gemma-4-26b-a4b-it',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes:
      'Official Google Mixture-of-Experts instruction-tuned model repository. Native on-device LiteRT-LM compilation pending.',
    local_runtime_supported: 'unknown',
    requires_auth: true,
    requires_terms_acceptance: true,
    download_url: null,
  },
  {
    id: 'gemma-4-31b-it-huggingface',
    model_family: 'gemma',
    model_generation: 'gemma-4',
    model_id: 'google/gemma-4-31b-it',
    display_name: 'Gemma 4 31B IT (Dense)',
    variant: '31b',
    runtime_format: 'unknown',
    source_kind: 'official_huggingface',
    source_url: 'https://huggingface.co/google/gemma-4-31b-it',
    terms_url: 'https://ai.google.dev/gemma/terms',
    source_verified: true,
    artifact_verified: false,
    runtime_compatibility_verified: false,
    verification_notes:
      'Official Google Dense instruction-tuned frontier model repository. Native on-device LiteRT-LM compilation pending.',
    local_runtime_supported: 'unknown',
    requires_auth: true,
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
