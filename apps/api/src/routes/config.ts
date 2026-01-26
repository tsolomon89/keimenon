/**
 * Configuration API Routes
 * Manages application configuration
 */

import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  AppConfigSchema,
  DEFAULT_IMPORT_CONFIGURATION,
  type AppConfig,
  type ImportConfiguration,
} from '@keimenon/types';

const router = Router();

// Default config path
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.canvas-memory', 'config.json');

/**
 * Get config file path
 */
function getConfigPath(): string {
  return process.env.CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

/**
 * Load configuration from file
 */
async function loadConfig(): Promise<AppConfig> {
  const configPath = getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    return AppConfigSchema.parse(parsed);
  } catch (error) {
    // Return default config if file doesn't exist
    return getDefaultConfig();
  }
}

/**
 * Save configuration to file
 */
async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();

  // Ensure directory exists
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  // Write config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get default configuration
 */
function getDefaultConfig(): AppConfig {
  const homeDir = os.homedir();
  const basePath = path.join(homeDir, '.canvas-memory');

  return {
    version: '1.0',
    storageMode: 'local',
    database: {
      local: {
        path: path.join(basePath, 'graph.db'),
        autoBackup: true,
        verbose: false,
      },
      cloud: {
        enabled: false,
        neo4jUri: null,
        neo4jUser: null,
        neo4jPassword: null,
      },
    },
    documentStore: {
      path: basePath,
      enableDeduplication: true,
    },
    defaults: DEFAULT_IMPORT_CONFIGURATION,
  };
}

/**
 * GET /api/v1/config
 * Get current configuration
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const config = await loadConfig();

    // Sanitize sensitive data
    const sanitized = {
      ...config,
      database: {
        ...config.database,
        cloud: {
          ...config.database.cloud,
          neo4jPassword: config.database.cloud.neo4jPassword ? '***' : null,
        },
      },
    };

    return res.json({
      success: true,
      config: sanitized,
      configPath: getConfigPath(),
    });
  } catch (error: any) {
    console.error('Get config error:', error);
    return res.status(500).json({
      error: 'Failed to load configuration',
      message: error.message,
    });
  }
});

/**
 * PUT /api/v1/config
 * Update configuration
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Load current config
    const currentConfig = await loadConfig();

    // Merge updates
    const newConfig: AppConfig = {
      ...currentConfig,
      ...updates,
      database: {
        ...currentConfig.database,
        ...(updates.database || {}),
      },
      documentStore: {
        ...currentConfig.documentStore,
        ...(updates.documentStore || {}),
      },
      defaults: {
        ...currentConfig.defaults,
        ...(updates.defaults || {}),
      },
    };

    // Validate
    const validated = AppConfigSchema.parse(newConfig);

    // Save
    await saveConfig(validated);

    return res.json({
      success: true,
      message: 'Configuration updated',
      config: validated,
    });
  } catch (error: any) {
    console.error('Update config error:', error);
    return res.status(400).json({
      error: 'Failed to update configuration',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/config/reset
 * Reset configuration to defaults
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    const defaultConfig = getDefaultConfig();

    await saveConfig(defaultConfig);

    return res.json({
      success: true,
      message: 'Configuration reset to defaults',
      config: defaultConfig,
    });
  } catch (error: any) {
    console.error('Reset config error:', error);
    return res.status(500).json({
      error: 'Failed to reset configuration',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/config/defaults
 * Get default import configuration
 */
router.get('/defaults', (req: Request, res: Response) => {
  return res.json({
    success: true,
    defaults: DEFAULT_IMPORT_CONFIGURATION,
  });
});

/**
 * GET /api/v1/config/import
 * Get import-specific configuration
 */
router.get('/import', async (req: Request, res: Response) => {
  try {
    const config = await loadConfig();

    return res.json({
      success: true,
      importConfig: config.defaults || DEFAULT_IMPORT_CONFIGURATION,
    });
  } catch (error: any) {
    console.error('Get import config error:', error);
    return res.status(500).json({
      error: 'Failed to load import configuration',
      message: error.message,
    });
  }
});

/**
 * PUT /api/v1/config/import
 * Update import configuration
 */
router.put('/import', async (req: Request, res: Response) => {
  try {
    const importConfig: Partial<ImportConfiguration> = req.body;

    // Load current config
    const currentConfig = await loadConfig();

    // Update import defaults
    const newConfig: AppConfig = {
      ...currentConfig,
      defaults: {
        ...currentConfig.defaults,
        ...importConfig,
      } as ImportConfiguration,
    };

    // Save
    await saveConfig(newConfig);

    return res.json({
      success: true,
      message: 'Import configuration updated',
      importConfig: newConfig.defaults,
    });
  } catch (error: any) {
    console.error('Update import config error:', error);
    return res.status(400).json({
      error: 'Failed to update import configuration',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/config/storage-mode
 * Get current storage mode
 */
router.get('/storage-mode', async (req: Request, res: Response) => {
  try {
    const config = await loadConfig();

    return res.json({
      success: true,
      storageMode: config.storageMode,
      database: {
        local: {
          enabled: true,
          path: config.database.local.path,
        },
        cloud: {
          enabled: config.database.cloud.enabled,
          uri: config.database.cloud.neo4jUri,
        },
      },
    });
  } catch (error: any) {
    console.error('Get storage mode error:', error);
    return res.status(500).json({
      error: 'Failed to get storage mode',
      message: error.message,
    });
  }
});

/**
 * PUT /api/v1/config/storage-mode
 * Change storage mode
 */
router.put('/storage-mode', async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;

    if (!mode || !['local', 'canvas', 'hybrid'].includes(mode)) {
      return res.status(400).json({
        error: 'Invalid storage mode. Must be: local, canvas, or hybrid',
      });
    }

    // Load current config
    const currentConfig = await loadConfig();

    // Update mode
    const newConfig: AppConfig = {
      ...currentConfig,
      storageMode: mode,
    };

    // Save
    await saveConfig(newConfig);

    return res.json({
      success: true,
      message: `Storage mode changed to: ${mode}`,
      storageMode: mode,
      requiresRestart: mode === 'canvas', // Canvas mode may need Neo4j setup
    });
  } catch (error: any) {
    console.error('Update storage mode error:', error);
    return res.status(500).json({
      error: 'Failed to update storage mode',
      message: error.message,
    });
  }
});

export default router;
