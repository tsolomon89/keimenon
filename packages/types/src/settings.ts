/**
 * Settings Configuration Types - JSON-Driven Settings System
 * Keimenon
 */

/**
 * Configuration Scope Hierarchy
 * defaults → org → workspace → role → user → view → component
 */
export type ConfigScope = 'defaults' | 'org' | 'workspace' | 'role' | 'user' | 'view' | 'component';

/**
 * Setting Value Types
 */
export type SettingValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'color'
  | 'slider'
  | 'json';

/**
 * Setting Control Definition
 */
export interface SettingControl {
  id: string;
  label: string;
  description?: string;
  type: SettingValueType;
  defaultValue: any;

  // Validation
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number; label: string }>;
  pattern?: string;
  required?: boolean;

  // UI hints
  unit?: string; // "px", "ms", "%"
  placeholder?: string;
  helpUrl?: string;

  // Permissions
  editableBy?: ('junior' | 'senior' | 'leader' | 'admin')[];
  visibleTo?: ('junior' | 'senior' | 'leader' | 'admin')[];
  adminOnly?: boolean;

  // Scope
  scope: ConfigScope;

  // Preview
  previewable?: boolean;
  requiresRestart?: boolean;
}

/**
 * Setting Section Definition
 */
export interface SettingSection {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  order: number;
  visible?: boolean;
  adminOnly?: boolean;
  controls: SettingControl[];
  subsections?: SettingSection[];
}

/**
 * Setting Category Definition
 */
export interface SettingCategory {
  id: string;
  label: string;
  icon: string;
  order: number;
  visible?: boolean;
  adminOnly?: boolean;
  sections: SettingSection[];
}

/**
 * Effective Setting Value with Source Tracking
 */
export interface EffectiveSettingValue {
  value: any;
  source: ConfigScope;
  effectiveScope: ConfigScope;
  overriddenBy?: ConfigScope[];
  canEdit: boolean;
  canReset: boolean;
  isDefault: boolean;
}

/**
 * Setting Change Record
 */
export interface SettingChange {
  id: string;
  controlId: string;
  scope: ConfigScope;
  scopeId?: string; // org_id, workspace_id, user_id, etc.
  oldValue: any;
  newValue: any;
  changedBy: string; // user_id
  changedAt: number; // timestamp
  reason?: string;
}

/**
 * Settings Configuration Store
 */
export interface SettingsConfig {
  version: string;
  scope: ConfigScope;
  scopeId?: string;
  values: Record<string, any>;
  metadata?: {
    lastModified: number;
    modifiedBy: string;
    environment?: 'dev' | 'stage' | 'prod';
  };
}

/**
 * Settings Definition Registry
 */
export const SETTINGS_REGISTRY: SettingCategory[] = [
  {
    id: 'general',
    label: 'General',
    icon: 'Settings',
    order: 1,
    sections: [
      {
        id: 'language',
        label: 'Language & Region',
        order: 1,
        controls: [
          {
            id: 'language',
            label: 'Language',
            type: 'select',
            defaultValue: 'en',
            options: [
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Español' },
              { value: 'fr', label: 'Français' },
            ],
            scope: 'user',
          },
          {
            id: 'timezone',
            label: 'Timezone',
            type: 'select',
            defaultValue: 'UTC',
            options: [
              { value: 'UTC', label: 'UTC' },
              { value: 'America/New_York', label: 'Eastern Time' },
              { value: 'America/Los_Angeles', label: 'Pacific Time' },
            ],
            scope: 'user',
          },
        ],
      },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: 'Palette',
    order: 2,
    sections: [
      {
        id: 'theme',
        label: 'Theme',
        order: 1,
        controls: [
          {
            id: 'theme_mode',
            label: 'Theme Mode',
            description: 'Choose between light, dark, or auto theme',
            type: 'select',
            defaultValue: 'dark',
            options: [
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'auto', label: 'Auto (System)' },
            ],
            scope: 'user',
            previewable: true,
          },
          {
            id: 'accent_color',
            label: 'Accent Color',
            type: 'color',
            defaultValue: '#9333ea',
            scope: 'user',
            previewable: true,
          },
        ],
      },
      {
        id: 'typography',
        label: 'Typography',
        order: 2,
        controls: [
          {
            id: 'font_family',
            label: 'Font Family',
            type: 'select',
            defaultValue: 'inter',
            options: [
              { value: 'inter', label: 'Inter' },
              { value: 'system', label: 'System' },
              { value: 'mono', label: 'Monospace' },
            ],
            scope: 'user',
            previewable: true,
          },
          {
            id: 'font_size',
            label: 'Font Size',
            type: 'slider',
            defaultValue: 14,
            min: 12,
            max: 18,
            step: 1,
            unit: 'px',
            scope: 'user',
            previewable: true,
          },
        ],
      },
      {
        id: 'density',
        label: 'Density & Spacing',
        order: 3,
        controls: [
          {
            id: 'ui_density',
            label: 'UI Density',
            type: 'select',
            defaultValue: 'comfortable',
            options: [
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'spacious', label: 'Spacious' },
            ],
            scope: 'user',
            previewable: true,
          },
        ],
      },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    icon: 'LayoutGrid',
    order: 3,
    sections: [
      {
        id: 'keimenon',
        label: 'Keimenon View',
        order: 1,
        controls: [
          {
            id: 'keimenon_grid',
            label: 'Show Grid',
            type: 'boolean',
            defaultValue: true,
            scope: 'user',
            previewable: true,
          },
          {
            id: 'keimenon_minimap',
            label: 'Show Minimap',
            type: 'boolean',
            defaultValue: true,
            scope: 'user',
            previewable: true,
          },
        ],
      },
      {
        id: 'sidebars',
        label: 'Sidebars',
        order: 2,
        controls: [
          {
            id: 'sidebar_left_default',
            label: 'Left Sidebar Default State',
            type: 'select',
            defaultValue: 'open',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ],
            scope: 'user',
          },
          {
            id: 'sidebar_right_default',
            label: 'Right Sidebar Default State',
            type: 'select',
            defaultValue: 'closed',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ],
            scope: 'user',
          },
        ],
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    icon: 'Building2',
    order: 4,
    sections: [
      {
        id: 'profile',
        label: 'Profile',
        order: 1,
        controls: [
          {
            id: 'display_name',
            label: 'Display Name',
            type: 'string',
            defaultValue: '',
            scope: 'user',
            required: true,
          },
          {
            id: 'email',
            label: 'Email',
            type: 'string',
            defaultValue: '',
            scope: 'user',
            required: true,
            pattern: '^[^@]+@[^@]+\\.[^@]+$',
          },
        ],
      },
      {
        id: 'billing',
        label: 'Billing & Limits',
        order: 2,
        controls: [
          {
            id: 'account_name',
            label: 'Account Name',
            type: 'string',
            defaultValue: '',
            scope: 'workspace',
            editableBy: ['admin'],
          },
          {
            id: 'account_class',
            label: 'Account Tier',
            type: 'select',
            defaultValue: 'free',
            options: [
              { value: 'free', label: 'Free' },
              { value: 'professional', label: 'Professional' },
              { value: 'business', label: 'Business' },
            ],
            scope: 'workspace',
            editableBy: ['admin'],
          },
          {
            id: 'max_nodes',
            label: 'Max Nodes',
            type: 'number',
            defaultValue: 10000,
            min: 100,
            max: 1000000,
            scope: 'workspace',
            editableBy: ['admin'],
          },
        ],
      },
      {
        id: 'members',
        label: 'Team Members',
        order: 3,
        controls: [
          {
            id: 'allow_invites',
            label: 'Allow Team Invites',
            type: 'boolean',
            defaultValue: true,
            scope: 'workspace',
            editableBy: ['admin'],
          },
        ],
      },
      {
        id: 'users',
        label: 'Users',
        description: 'Manage users in your account',
        order: 4,
        controls: [
          {
            id: 'user_management',
            label: 'User Management',
            description: 'View and manage users in your account',
            type: 'string',
            defaultValue: '',
            scope: 'workspace',
            visibleTo: ['junior', 'senior', 'leader', 'admin'],
            editableBy: ['admin'],
          },
        ],
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    icon: 'Database',
    order: 5,
    sections: [
      {
        id: 'retention',
        label: 'Data Retention',
        order: 1,
        controls: [
          {
            id: 'retention_days',
            label: 'Retention Period',
            description: 'Days to keep deleted items before permanent deletion',
            type: 'number',
            defaultValue: 30,
            min: 7,
            max: 365,
            unit: 'days',
            scope: 'workspace',
            editableBy: ['admin'],
          },
        ],
      },
      {
        id: 'management',
        label: 'Data Management',
        order: 2,
        controls: [
          {
            id: 'clear_keimenon_data',
            label: 'Clear Keimenon Data',
            description:
              'Delete all imported conversations, sources, code blocks, folders, and groups. Your account and settings will NOT be affected.',
            type: 'string',
            defaultValue: '',
            scope: 'user',
            helpUrl: '/docs/data-management',
          },
        ],
      },
      {
        id: 'admin_management',
        label: 'Admin Data Management',
        description: 'Administrative data clearing options',
        order: 3,
        adminOnly: true,
        controls: [
          {
            id: 'clear_all_client_data',
            label: 'Clear All Client Data',
            description:
              'Delete keimenon data for ALL client accounts (preserves admin data, user accounts, and settings). Use with extreme caution!',
            type: 'string',
            defaultValue: '',
            scope: 'workspace',
            editableBy: ['admin'],
            adminOnly: true,
          },
        ],
      },
      {
        id: 'deduplication',
        label: 'Content Deduplication',
        description: 'Automatic duplicate detection and storage optimization',
        order: 4,
        controls: [
          {
            id: 'deduplication_enabled',
            label: 'Enable Automatic Deduplication',
            description: 'Automatically detect and track duplicate content using SHA-256 hashing',
            type: 'boolean',
            defaultValue: true,
            scope: 'workspace',
            editableBy: ['admin'],
          },
          {
            id: 'deduplication_auto_merge',
            label: 'Auto-Merge Duplicates',
            description: 'Automatically merge duplicate nodes (requires manual approval)',
            type: 'boolean',
            defaultValue: false,
            scope: 'workspace',
            editableBy: ['admin'],
          },
        ],
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'Plug',
    order: 6,
    sections: [
      {
        id: 'api',
        label: 'API Access',
        order: 1,
        controls: [
          {
            id: 'api_enabled',
            label: 'Enable API Access',
            type: 'boolean',
            defaultValue: false,
            scope: 'workspace',
            editableBy: ['admin'],
          },
        ],
      },
      {
        id: 'api_keys',
        label: 'API Keys (BYOK)',
        description: 'Manage your own AI provider API keys',
        order: 2,
        controls: [
          {
            id: 'byok_management',
            label: 'API Key Management',
            description: 'Store and manage your AI provider API keys securely',
            type: 'string',
            defaultValue: '',
            scope: 'workspace',
            editableBy: ['admin'],
          },
        ],
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'Bell',
    order: 7,
    sections: [
      {
        id: 'email',
        label: 'Email Notifications',
        order: 1,
        controls: [
          {
            id: 'notifications_enabled',
            label: 'Enable Email Notifications',
            type: 'boolean',
            defaultValue: true,
            scope: 'user',
          },
          {
            id: 'notification_frequency',
            label: 'Notification Frequency',
            type: 'select',
            defaultValue: 'realtime',
            options: [
              { value: 'realtime', label: 'Real-time' },
              { value: 'daily', label: 'Daily Digest' },
              { value: 'weekly', label: 'Weekly Digest' },
            ],
            scope: 'user',
          },
        ],
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'Shield',
    order: 8,
    sections: [
      {
        id: 'password',
        label: 'Password',
        order: 1,
        controls: [
          {
            id: 'password_change',
            label: 'Change Password',
            type: 'string',
            defaultValue: '',
            scope: 'user',
          },
        ],
      },
      {
        id: 'privacy',
        label: 'Privacy & Error Tracking',
        description: 'Control how your data is used to improve the product',
        order: 2,
        controls: [
          {
            id: 'error_tracking_consent',
            label: 'Error Tracking',
            description: 'Help improve Keimenon by sending anonymous error reports via Sentry',
            type: 'boolean',
            defaultValue: false,
            scope: 'user',
          },
        ],
      },
    ],
  },
  {
    id: 'import_export',
    label: 'Import / Export',
    icon: 'Download',
    order: 9,
    sections: [
      {
        id: 'export',
        label: 'Export Options',
        order: 1,
        controls: [
          {
            id: 'export_format',
            label: 'Default Export Format',
            type: 'select',
            defaultValue: 'json',
            options: [
              { value: 'json', label: 'JSON' },
              { value: 'csv', label: 'CSV' },
              { value: 'graphml', label: 'GraphML' },
            ],
            scope: 'user',
          },
        ],
      },
      {
        id: 'import_workflow',
        label: 'Import Workflow',
        order: 2,
        controls: [
          {
            id: 'import_auto_switch_processing',
            label: 'Auto-Switch to Processing View',
            description: 'Automatically switch to Processing view when an import starts',
            type: 'boolean',
            defaultValue: true,
            scope: 'user',
          },
        ],
      },
    ],
  },
  {
    id: 'debug',
    label: 'Debug',
    icon: 'Bug',
    order: 10,
    adminOnly: true,
    sections: [
      {
        id: 'modals',
        label: 'Modals',
        description: 'Reference for modal components and their wiring status',
        order: 1,
        adminOnly: true,
        controls: [],
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'Wrench',
    order: 11,
    adminOnly: true,
    sections: [
      {
        id: 'global_defaults',
        label: 'Global Defaults',
        description: 'System-wide defaults for all accounts',
        order: 1,
        adminOnly: true,
        controls: [
          {
            id: 'global_default_tier',
            label: 'Default Account Tier',
            type: 'select',
            defaultValue: 'free',
            options: [
              { value: 'free', label: 'Free' },
              { value: 'professional', label: 'Professional' },
              { value: 'business', label: 'Business' },
            ],
            scope: 'defaults',
            editableBy: ['admin'],
            adminOnly: true,
          },
          {
            id: 'global_max_upload_size',
            label: 'Max Upload Size',
            type: 'number',
            defaultValue: 10,
            min: 1,
            max: 100,
            unit: 'MB',
            scope: 'defaults',
            editableBy: ['admin'],
            adminOnly: true,
          },
        ],
      },
      {
        id: 'global_policies',
        label: 'Global Policies',
        description: 'System-wide policies',
        order: 2,
        adminOnly: true,
        controls: [
          {
            id: 'global_enable_registration',
            label: 'Enable User Registration',
            type: 'boolean',
            defaultValue: false,
            scope: 'defaults',
            editableBy: ['admin'],
            adminOnly: true,
          },
          {
            id: 'global_require_email_verification',
            label: 'Require Email Verification',
            type: 'boolean',
            defaultValue: true,
            scope: 'defaults',
            editableBy: ['admin'],
            adminOnly: true,
          },
        ],
      },
    ],
  },
];

/**
 * Helper Functions
 */

export function getSettingById(id: string): SettingControl | undefined {
  for (const category of SETTINGS_REGISTRY) {
    for (const section of category.sections) {
      const control = section.controls.find((c) => c.id === id);
      if (control) return control;

      // Check subsections
      if (section.subsections) {
        for (const subsection of section.subsections) {
          const subControl = subsection.controls.find((c) => c.id === id);
          if (subControl) return subControl;
        }
      }
    }
  }
  return undefined;
}

export function getSettingsByCategory(categoryId: string): SettingSection[] {
  const category = SETTINGS_REGISTRY.find((c) => c.id === categoryId);
  return category?.sections || [];
}

export function canEditSetting(
  control: SettingControl,
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin'
): boolean {
  if (control.adminOnly && permissionLevel !== 'admin') {
    return false;
  }

  if (control.editableBy) {
    const ranks = { junior: 0, senior: 1, leader: 2, admin: 3 };
    const userRank = ranks[permissionLevel];
    const minRank = Math.min(...control.editableBy.map((r) => ranks[r]));
    return userRank >= minRank;
  }

  return true;
}

export function canViewSetting(
  control: SettingControl,
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin'
): boolean {
  if (control.adminOnly && permissionLevel !== 'admin') {
    return false;
  }

  if (control.visibleTo) {
    return control.visibleTo.includes(permissionLevel);
  }

  return true;
}
