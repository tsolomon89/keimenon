import { LocalModelManifest, LocalModelAcquisitionState } from '@keimenon/types';
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
    terms_source?: string;
  }): Promise<LocalModelManifest> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.model_family === input.model_family);

    if (!model) {
      model = {
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
      model.model_id = candidate.model_id;
      model.variant = candidate.variant;
      model.source_url = candidate.source_url;
      model.terms_source = candidate.terms_url;
      model.source_kind = candidate.source_kind;
      model.download_status = 'not_started';
      model.verification_status = 'unchecked';
    } else {
      model = {
        model_family: 'gemma',
        model_id: candidate.model_id,
        variant: candidate.variant,
        source_url: candidate.source_url,
        terms_source: candidate.terms_url,
        source_kind: candidate.source_kind,
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

  public async markModelDownloadPending(model_id: string | null): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.model_family === 'gemma' && m.model_id === model_id);
    if (model) {
      model.download_status = 'pending';
      await this.writeInstalledModels(models);
    }
  }

  public async markModelInstalled(input: {
    model_id: string | null;
    local_path: string;
    size_bytes?: number;
  }): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.model_family === 'gemma' && m.model_id === input.model_id);
    if (model) {
      model.installed = true;
      model.local_path = input.local_path;
      model.size_bytes = input.size_bytes;
      model.download_status = 'complete';
      await this.writeInstalledModels(models);
    }
  }

  public async verifyModelFile(input: {
    model_id: string | null;
  }): Promise<{ verified: boolean; message: string }> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.model_family === 'gemma' && m.model_id === input.model_id);

    if (!model) {
      return { verified: false, message: 'Manifest not found' };
    }
    if (!model.local_path) {
      return { verified: false, message: 'No local path in manifest' };
    }

    const absolutePath = path.resolve(this.getModelDirectory(), model.local_path);
    if (!fs.existsSync(absolutePath)) {
      model.verification_status = 'failed';
      model.installed = false;
      await this.writeInstalledModels(models);
      return { verified: false, message: 'Model file missing from disk' };
    }

    model.verification_status = 'verified';
    await this.writeInstalledModels(models);
    return { verified: true, message: 'Model file verified' };
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
    if (model.verification_status === 'failed') {
      return 'failed';
    }

    return 'downloaded';
  }
}

export const modelManager = new ModelManager();
