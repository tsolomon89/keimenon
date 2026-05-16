import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelManager } from '../services/agent/model-manager';
import fs from 'fs';
import path from 'path';

describe('ModelManager', () => {
  let manager: ModelManager;
  const originalEnv = process.env.KEIMENON_MODELS_DIR;
  const testDir = path.resolve(process.cwd(), '.data/test-models');
  const manifestPath = path.join(testDir, 'models.json');

  beforeEach(() => {
    manager = new ModelManager();
    process.env.KEIMENON_MODELS_DIR = testDir;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    process.env.KEIMENON_MODELS_DIR = originalEnv;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return license_required initially', async () => {
    const status = await manager.getModelStatus();
    expect(status).toBe('license_required');
  });

  it('should return model_missing after accepting license but model not installed', async () => {
    // Write a stub
    await manager.writeInstalledModels([
      {
        model_family: 'gemma',
        model_id: null,
        license_required: true,
        license_accepted: true,
        installed: false,
      },
    ]);
    const status = await manager.getModelStatus();
    expect(status).toBe('model_missing');
  });

  it('should return model_missing if license is accepted but not installed', async () => {
    await manager.acceptLicense('gemma');
    const status = await manager.getModelStatus();
    expect(status).toBe('model_missing');

    // Read the file to verify
    const models = await manager.getInstalledModels();
    expect(models[0].license_accepted).toBe(true);
    expect(models[0].installed).toBe(false);
  });

  it('should return ready if license accepted and installed', async () => {
    await manager.writeInstalledModels([
      {
        model_family: 'gemma',
        model_id: 'gemma-4-e2b-cpu',
        license_required: true,
        license_accepted: true,
        installed: true,
      },
    ]);
    const status = await manager.getModelStatus();
    expect(status).toBe('ready');
  });
});
