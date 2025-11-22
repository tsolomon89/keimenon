import { Router, Request, Response } from 'express';
import { SQLiteClient } from '@canvas-memory/db';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import {
  SettingsConfig,
  ConfigScope,
  EffectiveSettingValue,
  SettingChange,
  SETTINGS_REGISTRY,
  getSettingById,
  canEditSetting,
  canViewSetting,
} from '@canvas-memory/types/src/settings';

/**
 * Settings Routes - JSON-Driven Configuration Management
 * Handles scoped settings with inheritance: defaults → org → workspace → role → user → view → component
 */
export function createSettingsRoutes(db: SQLiteClient, authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/v1/settings - Get all settings for current user
   * Returns effective values with source tracking
   */
  router.get('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const user = (req as any).user;
      const accountId = user.accountId;
      const userId = user.userId;
      const permissionLevel = user.permissionLevel;
      const accountType = user.accountType;

      // Load settings from all scopes
      const settingsData: Record<string, EffectiveSettingValue> = {};

      for (const category of SETTINGS_REGISTRY) {
        // Filter by admin-only (check accountType, not permissionLevel)
        if (category.adminOnly && accountType !== 'admin') {
          continue;
        }

        for (const section of category.sections) {
          if (section.adminOnly && accountType !== 'admin') {
            continue;
          }

          for (const control of section.controls) {
            // Check if user can view this setting (this checks permissionLevel for control-level permissions)
            if (!canViewSetting(control, permissionLevel)) {
              continue;
            }

            // Get effective value
            const effectiveValue = await getEffectiveValue(
              database,
              control.id,
              control.scope,
              accountId,
              userId,
              control.defaultValue
            );

            // Check if user can edit
            const canEdit = canEditSetting(control, permissionLevel);

            settingsData[control.id] = {
              value: effectiveValue.value,
              source: effectiveValue.source,
              effectiveScope: control.scope,
              canEdit,
              canReset: effectiveValue.source !== 'defaults',
              isDefault: effectiveValue.source === 'defaults',
            };
          }
        }
      }

      return res.json({
        success: true,
        settings: settingsData,
        metadata: {
          accountId,
          userId,
          permissionLevel,
          timestamp: Date.now(),
        },
      });
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  /**
   * GET /api/v1/settings/:id - Get specific setting with full details
   */
  router.get('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const user = (req as any).user;
      const settingId = req.params.id;
      const accountId = user.accountId;
      const userId = user.userId;
      const permissionLevel = user.permissionLevel;

      const control = getSettingById(settingId);
      if (!control) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      // Check permission
      if (!canViewSetting(control, permissionLevel)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get effective value
      const effectiveValue = await getEffectiveValue(
        database,
        control.id,
        control.scope,
        accountId,
        userId,
        control.defaultValue
      );

      // Get change history
      const history = await getSettingHistory(database, control.id, accountId, userId);

      return res.json({
        success: true,
        setting: {
          control,
          effectiveValue: effectiveValue.value,
          source: effectiveValue.source,
          canEdit: canEditSetting(control, permissionLevel),
          canReset: effectiveValue.source !== 'defaults',
          isDefault: effectiveValue.source === 'defaults',
        },
        history,
      });
    } catch (error: any) {
      console.error('Error fetching setting:', error);
      return res.status(500).json({ error: 'Failed to fetch setting' });
    }
  });

  /**
   * PATCH /api/v1/settings/:id - Update setting value
   */
  router.patch('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const user = (req as any).user;
      const settingId = req.params.id;
      const { value, scope } = req.body;
      const accountId = user.accountId;
      const userId = user.userId;
      const permissionLevel = user.permissionLevel;

      const control = getSettingById(settingId);
      if (!control) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      // Check edit permission
      if (!canEditSetting(control, permissionLevel)) {
        return res.status(403).json({
          error: 'Insufficient permissions to edit this setting',
          reason: `Requires ${control.editableBy?.join(' or ')} permission`,
        });
      }

      // Validate value type
      if (!validateSettingValue(control, value)) {
        return res.status(400).json({
          error: 'Invalid value type or format',
          expected: control.type,
        });
      }

      // Get current value for history
      const currentValue = await getEffectiveValue(
        database,
        control.id,
        control.scope,
        accountId,
        userId,
        control.defaultValue
      );

      // Save setting
      const effectiveScope = scope || control.scope;
      const scopeId = getScopeId(effectiveScope, accountId, userId);

      await saveSetting(database, control.id, value, effectiveScope, scopeId);

      // Log change
      await logSettingChange(
        database,
        control.id,
        effectiveScope,
        scopeId,
        currentValue.value,
        value,
        userId
      );

      // Audit log
      await logAudit(database, 'update', 'Setting', control.id, userId, accountId, true);

      return res.json({
        success: true,
        setting: {
          id: control.id,
          value,
          scope: effectiveScope,
          scopeId,
        },
      });
    } catch (error: any) {
      console.error('Error updating setting:', error);
      return res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  /**
   * DELETE /api/v1/settings/:id - Reset setting to default/inherited value
   */
  router.delete('/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const user = (req as any).user;
      const settingId = req.params.id;
      const accountId = user.accountId;
      const userId = user.userId;
      const permissionLevel = user.permissionLevel;

      const control = getSettingById(settingId);
      if (!control) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      // Check edit permission
      if (!canEditSetting(control, permissionLevel)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Delete setting from current scope
      const scopeId = getScopeId(control.scope, accountId, userId);

      database
        .prepare(
          `
        DELETE FROM settings_config
        WHERE control_id = ? AND scope = ? AND scope_id = ?
      `
        )
        .run(control.id, control.scope, scopeId);

      // Get new effective value
      const newValue = await getEffectiveValue(
        database,
        control.id,
        control.scope,
        accountId,
        userId,
        control.defaultValue
      );

      // Audit log
      await logAudit(database, 'reset', 'Setting', control.id, userId, accountId, true);

      return res.json({
        success: true,
        setting: {
          id: control.id,
          value: newValue.value,
          source: newValue.source,
          reset: true,
        },
      });
    } catch (error: any) {
      console.error('Error resetting setting:', error);
      return res.status(500).json({ error: 'Failed to reset setting' });
    }
  });

  /**
   * GET /api/v1/settings/history/:id - Get change history for setting
   */
  router.get('/history/:id', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const user = (req as any).user;
      const settingId = req.params.id;
      const accountId = user.accountId;
      const userId = user.userId;
      const permissionLevel = user.permissionLevel;

      const control = getSettingById(settingId);
      if (!control) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      if (!canViewSetting(control, permissionLevel)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const history = await getSettingHistory(database, settingId, accountId, userId);

      return res.json({
        success: true,
        history,
      });
    } catch (error: any) {
      console.error('Error fetching history:', error);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  /**
   * GET /api/v1/settings/registry - Get settings registry (definitions)
   */
  router.get('/registry/all', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // CRITICAL FIX: Get per-request database client for test isolation
      const { getDbClient } = await import('../utils/get-db-client');
      const dbClient = await getDbClient(req);
      const database = dbClient.getDatabase();

      const user = (req as any).user;
      const permissionLevel = user.permissionLevel;
      const accountType = user.accountType;

      // Filter registry based on permissions (use accountType for admin-only sections)
      const filteredRegistry = SETTINGS_REGISTRY.filter((category) => {
        if (category.adminOnly && accountType !== 'admin') {
          return false;
        }
        return true;
      }).map((category) => ({
        ...category,
        sections: category.sections
          .filter((section) => {
            if (section.adminOnly && accountType !== 'admin') {
              return false;
            }
            return true;
          })
          .map((section) => ({
            ...section,
            controls: section.controls.filter((control) =>
              canViewSetting(control, permissionLevel)
            ),
          })),
      }));

      return res.json({
        success: true,
        registry: filteredRegistry,
        permission: permissionLevel,
      });
    } catch (error: any) {
      console.error('Error fetching registry:', error);
      return res.status(500).json({ error: 'Failed to fetch settings registry' });
    }
  });

  return router;
}

/**
 * Helper: Get effective value for a setting with scope inheritance
 */
async function getEffectiveValue(
  database: any,
  controlId: string,
  scope: ConfigScope,
  accountId: string,
  userId: string,
  defaultValue: any
): Promise<{ value: any; source: ConfigScope }> {
  // Scope hierarchy: component → view → user → role → workspace → org → defaults
  const scopeHierarchy: ConfigScope[] = [
    'component',
    'view',
    'user',
    'role',
    'workspace',
    'org',
    'defaults',
  ];

  for (const checkScope of scopeHierarchy) {
    const scopeId = getScopeId(checkScope, accountId, userId);

    const result = database
      .prepare(
        `
      SELECT value FROM settings_config
      WHERE control_id = ? AND scope = ? AND scope_id = ?
    `
      )
      .get(controlId, checkScope, scopeId);

    if (result) {
      return {
        value: JSON.parse(result.value),
        source: checkScope,
      };
    }
  }

  // Return default value
  return {
    value: defaultValue,
    source: 'defaults',
  };
}

/**
 * Helper: Save setting value
 */
async function saveSetting(
  database: any,
  controlId: string,
  value: any,
  scope: ConfigScope,
  scopeId: string
): Promise<void> {
  database
    .prepare(
      `
    INSERT OR REPLACE INTO settings_config (control_id, scope, scope_id, value, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(controlId, scope, scopeId, JSON.stringify(value), Date.now());
}

/**
 * Helper: Get scope ID based on scope type
 */
function getScopeId(scope: ConfigScope, accountId: string, userId: string): string {
  switch (scope) {
    case 'defaults':
      return 'global';
    case 'org':
      return 'global';
    case 'workspace':
      return accountId;
    case 'role':
      return accountId;
    case 'user':
      return userId;
    case 'view':
      return userId;
    case 'component':
      return userId;
    default:
      return 'global';
  }
}

/**
 * Helper: Validate setting value
 */
function validateSettingValue(control: any, value: any): boolean {
  switch (control.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      if (typeof value !== 'number') return false;
      if (control.min !== undefined && value < control.min) return false;
      if (control.max !== undefined && value > control.max) return false;
      return true;
    case 'string':
      if (typeof value !== 'string') return false;
      if (control.pattern) {
        const regex = new RegExp(control.pattern);
        return regex.test(value);
      }
      return true;
    case 'select':
      if (control.options) {
        return control.options.some((opt: any) => opt.value === value);
      }
      return true;
    default:
      return true;
  }
}

/**
 * Helper: Get setting change history
 */
async function getSettingHistory(
  database: any,
  controlId: string,
  accountId: string,
  userId: string
): Promise<SettingChange[]> {
  const results = database
    .prepare(
      `
    SELECT * FROM settings_changes
    WHERE control_id = ? AND (scope_id = ? OR scope_id = ?)
    ORDER BY changed_at DESC
    LIMIT 50
  `
    )
    .all(controlId, accountId, userId);

  return results.map((row: any) => ({
    id: row.id,
    controlId: row.control_id,
    scope: row.scope,
    scopeId: row.scope_id,
    oldValue: JSON.parse(row.old_value || 'null'),
    newValue: JSON.parse(row.new_value || 'null'),
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    reason: row.reason,
  }));
}

/**
 * Helper: Log setting change
 */
async function logSettingChange(
  database: any,
  controlId: string,
  scope: ConfigScope,
  scopeId: string,
  oldValue: any,
  newValue: any,
  userId: string
): Promise<void> {
  const id = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  database
    .prepare(
      `
    INSERT INTO settings_changes (id, control_id, scope, scope_id, old_value, new_value, changed_by, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      id,
      controlId,
      scope,
      scopeId,
      JSON.stringify(oldValue),
      JSON.stringify(newValue),
      userId,
      Date.now()
    );
}

/**
 * Helper: Audit log
 */
async function logAudit(
  database: any,
  action: string,
  resourceType: string,
  resourceId: string,
  userId: string,
  accountId: string,
  success: boolean
): Promise<void> {
  const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  database
    .prepare(
      `
    INSERT INTO audit_log (id, actor_user_id, actor_account_id, target_account_id, action, resource_type, resource_id, mode, success, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      id,
      userId,
      accountId,
      accountId,
      action,
      resourceType,
      resourceId,
      'native',
      success ? 1 : 0,
      Date.now()
    );
}
