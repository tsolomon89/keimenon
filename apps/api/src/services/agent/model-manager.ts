import { LocalModelManifest, LocalModelAcquisitionState, ModelDownloadPlan } from '@keimenon/types';
import path from 'path';
import fs from 'fs';
import { gemmaModelSourceRegistry, GemmaModelSourceCandidate } from './gemma-model-source-registry';

export class ModelManager {
  public getModelDirectory(): string {
    if (process.env.KEIMENON_MODELS_DIR) {
      return process.env.KEIMENON_MODELS_DIR;
    }
    // For API dev mode, use a safe local data directory.
    return path.resolve(process.cwd(), '.data/models/gemma');
  }

  public getManifestPath(): string {
    return path.join(this.getModelDirectory(), 'models.json');
  }

  public async getModelDirectoryInfo(): Promise<{
    path: string;
    exists: boolean;
    manifest_path: string;
    manifest_exists: boolean;
  }> {
    const dir = this.getModelDirectory();
    const manifestPath = this.getManifestPath();
    const dirExists = fs.existsSync(dir);
    const manifestExists = fs.existsSync(manifestPath);

    return {
      path: dir,
      exists: dirExists,
      manifest_path: manifestPath,
      manifest_exists: manifestExists,
    };
  }

  public async ensureModelDirectory(): Promise<void> {
    const dir = this.getModelDirectory();
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  public async getSourceCandidates(): Promise<GemmaModelSourceCandidate[]> {
    return gemmaModelSourceRegistry.getCandidates();
  }

  public async getInstalledModels(): Promise<LocalModelManifest[]> {
    const manifestPath = this.getManifestPath();

    if (!fs.existsSync(manifestPath)) {
      return [];
    }

    try {
      const data = await fs.promises.readFile(manifestPath, 'utf-8');
      return JSON.parse(data) as LocalModelManifest[];
    } catch (err) {
      console.error('[ModelManager] Failed to read models.json', err);
      return [];
    }
  }

  public async writeInstalledModels(models: LocalModelManifest[]): Promise<void> {
    await this.ensureModelDirectory();
    const manifestPath = this.getManifestPath();
    await fs.promises.writeFile(manifestPath, JSON.stringify(models, null, 2), 'utf-8');
  }

  public async getActiveGemmaManifest(): Promise<LocalModelManifest | null> {
    const models = await this.getInstalledModels();
    const active = models.find((m) => m.model_family === 'gemma' && m.candidate_id);
    return active || null;
  }

  public async getManifestByCandidateId(candidateId: string): Promise<LocalModelManifest | null> {
    const models = await this.getInstalledModels();
    const manifest = models.find((m) => m.candidate_id === candidateId);
    return manifest || null;
  }

  public async getRequiredGemmaModel(): Promise<LocalModelManifest> {
    const models = await this.getInstalledModels();
    const existing = models.find((m) => m.model_family === 'gemma');

    if (existing) {
      return existing;
    }

    // Default required stub if none installed
    return {
      model_family: 'gemma',
      model_id: null, // Pending official runtime verification
      license_required: true,
      license_accepted: false,
      installed: false,
    };
  }

  public async recordLicenseAcceptance(input: {
    model_family: 'gemma';
    model_id?: string | null;
    candidate_id?: string;
    terms_source?: string;
  }): Promise<LocalModelManifest> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => {
      if (input.candidate_id) {
        return m.model_family === input.model_family && m.candidate_id === input.candidate_id;
      }
      return m.model_family === input.model_family;
    });

    if (!model) {
      model = {
        candidate_id: input.candidate_id,
        model_family: 'gemma',
        model_id: input.model_id || null,
        license_required: true,
        license_accepted: true,
        license_accepted_at: Date.now(),
        terms_source: input.terms_source,
        installed: false,
      };
      models.push(model);
    } else {
      model.license_accepted = true;
      model.license_accepted_at = Date.now();
      if (input.terms_source) {
        model.terms_source = input.terms_source;
      }
      if (input.candidate_id) {
        model.candidate_id = input.candidate_id;
      }
    }

    await this.writeInstalledModels(models);
    return model;
  }

  public async createPendingModelManifest(
    candidate: GemmaModelSourceCandidate
  ): Promise<LocalModelManifest> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.model_family === 'gemma');

    if (model) {
      model.candidate_id = candidate.id;
      model.model_id = candidate.model_id;
      model.model_generation = candidate.model_generation;
      model.variant = candidate.variant;
      model.source_url = candidate.source_url;
      model.terms_source = candidate.terms_url;
      model.source_kind = candidate.source_kind;
      model.source_verified = candidate.source_verified;
      model.artifact_verified = candidate.artifact_verified;
      model.runtime_compatibility_verified = candidate.runtime_compatibility_verified;
      model.download_status = 'not_started';
      model.verification_status = 'unchecked';
    } else {
      model = {
        candidate_id: candidate.id,
        model_family: 'gemma',
        model_generation: candidate.model_generation,
        model_id: candidate.model_id,
        variant: candidate.variant,
        source_url: candidate.source_url,
        terms_source: candidate.terms_url,
        source_kind: candidate.source_kind,
        source_verified: candidate.source_verified,
        artifact_verified: candidate.artifact_verified,
        runtime_compatibility_verified: candidate.runtime_compatibility_verified,
        license_required: true,
        license_accepted: false,
        installed: false,
        download_status: 'not_started',
        verification_status: 'unchecked',
      };
      models.push(model);
    }

    await this.writeInstalledModels(models);
    return model;
  }

  public async markModelDownloadPending(candidate_id: string): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.candidate_id === candidate_id);
    if (model) {
      model.download_status = 'pending';
      await this.writeInstalledModels(models);
    }
  }

  public async markModelInstalled(input: {
    candidate_id: string;
    local_path: string;
    size_bytes?: number;
  }): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.candidate_id === input.candidate_id);
    if (model) {
      model.installed = false;
      model.local_path = input.local_path;
      model.size_bytes = input.size_bytes;
      model.download_status = 'complete';
      model.verification_status = 'unchecked';
      await this.writeInstalledModels(models);
    }
  }

  public async verifyModelFile(input: { candidate_id: string }): Promise<{
    verified: boolean;
    verification_status: 'unchecked' | 'presence_verified' | 'verified' | 'failed';
    message: string;
  }> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.candidate_id === input.candidate_id);

    if (!model) {
      return { verified: false, verification_status: 'failed', message: 'Manifest not found' };
    }
    if (!model.local_path) {
      return {
        verified: false,
        verification_status: 'failed',
        message: 'No local path in manifest',
      };
    }

    const modelDir = this.getModelDirectory();

    // Path traversal block
    const absolutePath = path.resolve(modelDir, model.local_path);
    const rel = path.relative(modelDir, absolutePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { verified: false, verification_status: 'failed', message: 'Path traversal detected' };
    }

    if (!fs.existsSync(absolutePath)) {
      model.verification_status = 'failed';
      model.installed = false;
      await this.writeInstalledModels(models);
      return {
        verified: false,
        verification_status: 'failed',
        message: 'Model file missing from disk',
      };
    }

    const candidates = await this.getSourceCandidates();
    const candidate = candidates.find((c) => c.id === input.candidate_id);

    // Check size if expected
    if (candidate && candidate.expected_size_bytes) {
      try {
        const stats = await fs.promises.stat(absolutePath);
        if (stats.size !== candidate.expected_size_bytes) {
          model.verification_status = 'failed';
          model.installed = false;
          await this.writeInstalledModels(models);
          return {
            verified: false,
            verification_status: 'failed',
            message: 'Model file size mismatch',
          };
        }
      } catch (err) {
        return {
          verified: false,
          verification_status: 'failed',
          message: 'Failed to read file size',
        };
      }
    }

    // Checksum check would go here, if available it would be 'verified'. For now we only verify presence.
    model.verification_status = 'presence_verified';
    model.installed = true;
    await this.writeInstalledModels(models);
    return {
      verified: true,
      verification_status: 'presence_verified',
      message: 'Model file presence verified',
    };
  }

  public async getModelStatus(): Promise<LocalModelAcquisitionState> {
    const model = await this.getRequiredGemmaModel();
    if (model.license_required && !model.license_accepted) {
      return 'terms_required';
    }
    if (!model.source_kind) {
      return 'source_pending';
    }
    if (!model.installed) {
      if (model.download_status === 'pending' || model.download_status === 'downloading') {
        return 'downloading';
      }
      return 'ready_to_download';
    }
    if (model.verification_status === 'verified') {
      return 'verified';
    }
    if (model.verification_status === 'presence_verified') {
      return 'presence_verified';
    }
    if (model.verification_status === 'failed') {
      return 'failed';
    }

    return 'downloaded';
  }
  public async getModelDownloadPlan(candidateId: string): Promise<ModelDownloadPlan> {
    const candidates = await this.getSourceCandidates();
    const candidate = candidates.find((c) => c.id === candidateId);

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    if (candidate.model_family !== 'gemma') {
      throw new Error('Only Gemma family models are supported');
    }

    if (candidate.id.toLowerCase().includes('legacy-generation')) {
      throw new Error('Legacy generations are no longer supported in the active acquisition flow');
    }

    if (!candidate.artifact_verified) {
      return {
        candidate_id: candidate.id,
        display_name: candidate.display_name,
        model_generation: candidate.model_generation,
        variant: candidate.variant,
        source_url: candidate.source_url,
        source_verified: candidate.source_verified,
        artifact_verified: candidate.artifact_verified,
        runtime_compatibility_verified: candidate.runtime_compatibility_verified,
        model_id: candidate.model_id,
        source_kind: candidate.source_kind,
        can_download: false,
        blocked_reason: 'Exact Gemma 4 native/LiteRT artifact pending verification.',
        terms_url: candidate.terms_url,
        download_instructions: `Please visit ${candidate.source_url} to accept the terms of use and acquire the LiteRT compatible model manually once verified.`,
      };
    }

    if (candidate.requires_auth) {
      return {
        candidate_id: candidate.id,
        display_name: candidate.display_name,
        model_generation: candidate.model_generation,
        variant: candidate.variant,
        source_url: candidate.source_url,
        source_verified: candidate.source_verified,
        artifact_verified: candidate.artifact_verified,
        runtime_compatibility_verified: candidate.runtime_compatibility_verified,
        model_id: candidate.model_id,
        source_kind: candidate.source_kind,
        can_download: false,
        blocked_reason: 'Manual model acquisition bridge: source requires authentication.',
        terms_url: candidate.terms_url,
        download_instructions: `Please visit ${candidate.source_url} to accept the terms of use and download the LiteRT compatible model manually. Place the downloaded file in your models directory.`,
      };
    }

    return {
      candidate_id: candidate.id,
      display_name: candidate.display_name,
      model_generation: candidate.model_generation,
      variant: candidate.variant,
      source_url: candidate.source_url,
      source_verified: candidate.source_verified,
      artifact_verified: candidate.artifact_verified,
      runtime_compatibility_verified: candidate.runtime_compatibility_verified,
      model_id: candidate.model_id,
      source_kind: candidate.source_kind,
      can_download: !!candidate.download_url,
      expected_size_bytes: candidate.expected_size_bytes,
      terms_url: candidate.terms_url,
    };
  }

  public async prepareModelDownload(candidateId: string): Promise<LocalModelManifest> {
    const candidates = await this.getSourceCandidates();
    const candidate = candidates.find((c) => c.id === candidateId);

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    return this.createPendingModelManifest(candidate);
  }

  public async recordDownloadStarted(candidate_id: string): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.candidate_id === candidate_id);
    if (model) {
      model.download_status = 'downloading';
      await this.writeInstalledModels(models);
    }
  }

  public async recordDownloadFailed(candidate_id: string, reason: string): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.candidate_id === candidate_id);
    if (model) {
      model.download_status = 'failed';
      model.verification_status = 'failed';
      console.error(`[ModelManager] Download failed for ${candidate_id}: ${reason}`);
      await this.writeInstalledModels(models);
    }
  }

  public async recordDownloadComplete(input: {
    candidate_id: string;
    local_path: string;
    size_bytes?: number;
  }): Promise<void> {
    await this.markModelInstalled(input);
  }
}

export const modelManager = new ModelManager();
