import { LocalModelManifest } from './local-inference-types';
import path from 'path';

export class ModelManager {
  public getModelDirectory(): string {
    // In Electron, this will map to app.getPath('userData')/models/gemma
    // For API dev mode, use a safe local data directory.
    return path.resolve(process.cwd(), '.data/models/gemma');
  }

  public async getInstalledModels(): Promise<LocalModelManifest[]> {
    return [];
  }

  public async getRequiredGemmaModel(): Promise<LocalModelManifest> {
    return {
      model_family: 'gemma',
      model_id: null, // Pending official runtime verification
      license_required: true,
      license_accepted: false,
      installed: false,
    };
  }

  public async getModelStatus(): Promise<'model_missing' | 'ready'> {
    return 'model_missing';
  }
}

export const modelManager = new ModelManager();
