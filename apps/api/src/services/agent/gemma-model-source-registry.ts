export interface GemmaModelSourceCandidate {
  model_family: 'gemma';
  model_id: string | null;
  display_name: string;
  variant?: string;
  runtime_format?: 'litert' | 'tflite' | 'task' | 'unknown';
  source_kind: 'official_google' | 'official_huggingface' | 'official_kaggle' | 'manual';
  source_url: string;
  terms_url?: string;
  verified: boolean;
  verification_notes: string;
  local_runtime_supported: boolean | 'unknown';
}

export const GEMMA_MODEL_SOURCES: GemmaModelSourceCandidate[] = [
  {
    model_family: 'gemma',
    model_id: null,
    display_name: 'Gemma 2 2B IT (Kaggle)',
    variant: '2b-it',
    runtime_format: 'unknown',
    source_kind: 'official_kaggle',
    source_url: 'https://www.kaggle.com/models/google/gemma-2',
    terms_url: 'https://ai.google.dev/gemma/terms',
    verified: false,
    verification_notes: 'Final Kaggle LiteRT artifact URL pending verification.',
    local_runtime_supported: 'unknown',
  },
  {
    model_family: 'gemma',
    model_id: null,
    display_name: 'Gemma 2 2B IT (Hugging Face)',
    variant: '2b-it',
    runtime_format: 'unknown',
    source_kind: 'official_huggingface',
    source_url: 'https://huggingface.com/google/gemma-2-2b-it',
    terms_url: 'https://ai.google.dev/gemma/terms',
    verified: false,
    verification_notes: 'Final Hugging Face LiteRT artifact URL pending verification.',
    local_runtime_supported: 'unknown',
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
