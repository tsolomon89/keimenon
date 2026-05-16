import { LocalModelManifest } from '@keimenon/types';
import path from 'path';
import fs from 'fs';

export class ModelManager {
  public getModelDirectory(): string {
    if (process.env.KEIMENON_MODELS_DIR) {
      return process.env.KEIMENON_MODELS_DIR;
    }
    // For API dev mode, use a safe local data directory.
    return path.resolve(process.cwd(), '.data/models/gemma');
  }

  public async ensureModelDirectory(): Promise<void> {
    const dir = this.getModelDirectory();
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  public async getInstalledModels(): Promise<LocalModelManifest[]> {
    const dir = this.getModelDirectory();
    const manifestPath = path.join(dir, 'models.json');

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
    const dir = this.getModelDirectory();
    const manifestPath = path.join(dir, 'models.json');
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

  public async acceptLicense(modelFamily: string): Promise<void> {
    let models = await this.getInstalledModels();
    let model = models.find((m) => m.model_family === modelFamily);

    if (!model) {
      model = {
        model_family: 'gemma',
        model_id: null,
        license_required: true,
        license_accepted: true,
        installed: false,
      };
      models.push(model);
    } else {
      model.license_accepted = true;
    }

    await this.writeInstalledModels(models);
  }

  public async getModelStatus(): Promise<'model_missing' | 'license_required' | 'ready'> {
    const model = await this.getRequiredGemmaModel();
    if (model.license_required && !model.license_accepted) {
      return 'license_required';
    }
    if (!model.installed) {
      return 'model_missing';
    }
    return 'ready';
  }
}

export const modelManager = new ModelManager();
