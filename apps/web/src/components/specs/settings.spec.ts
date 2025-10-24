/**
 * Settings View Spec - Configuration interface specification
 *
 * Extracted from existing SETTINGS_REGISTRY in packages/types/src/settings.ts
 * Provides declarative configuration for settings views
 */

import { Globe, Eye, Bell, Palette, Database } from 'lucide-react';
import { ViewSpec } from './users.spec';

/**
 * Settings View Spec
 *
 * Defines how settings are organized and displayed
 */
export const SETTINGS_SPEC: ViewSpec = {
  type: 'settings',
  displayName: 'Settings',
  icon: Database,

  list: {
    fields: ['label', 'description'],
    layout: 'vertical',
  },

  inspector: {
    groups: [
      {
        title: 'General',
        fields: ['language', 'timezone', 'dateFormat'],
      },
      {
        title: 'Privacy',
        fields: ['analytics', 'dataSharingOptIn', 'visibilityLevel'],
      },
      {
        title: 'Notifications',
        fields: ['emailNotifications', 'pushNotifications', 'notificationFrequency'],
      },
      {
        title: 'Appearance',
        fields: ['theme', 'primaryColor', 'fontSize'],
      },
      {
        title: 'Data & Storage',
        fields: ['autoSave', 'defaultFileFormat', 'cacheSize'],
      },
    ],
  },

  fields: {
    // General
    language: {
      label: 'Language',
      type: 'string',
      icon: Globe,
    },
    timezone: {
      label: 'Timezone',
      type: 'string',
    },
    dateFormat: {
      label: 'Date Format',
      type: 'string',
    },

    // Privacy
    analytics: {
      label: 'Analytics',
      type: 'boolean',
      icon: Eye,
    },
    dataSharingOptIn: {
      label: 'Data Sharing',
      type: 'boolean',
    },
    visibilityLevel: {
      label: 'Visibility Level',
      type: 'string',
    },

    // Notifications
    emailNotifications: {
      label: 'Email Notifications',
      type: 'boolean',
      icon: Bell,
    },
    pushNotifications: {
      label: 'Push Notifications',
      type: 'boolean',
    },
    notificationFrequency: {
      label: 'Notification Frequency',
      type: 'string',
    },

    // Appearance
    theme: {
      label: 'Theme',
      type: 'string',
      icon: Palette,
    },
    primaryColor: {
      label: 'Primary Color',
      type: 'string',
    },
    fontSize: {
      label: 'Font Size',
      type: 'number',
    },

    // Data & Storage
    autoSave: {
      label: 'Auto Save',
      type: 'boolean',
      icon: Database,
    },
    defaultFileFormat: {
      label: 'Default File Format',
      type: 'string',
    },
    cacheSize: {
      label: 'Cache Size',
      type: 'number',
    },
  },
};

/**
 * Settings sections configuration
 * Maps to existing SETTINGS_REGISTRY structure
 */
export const SETTINGS_SECTIONS = {
  general: {
    id: 'general',
    label: 'General',
    icon: Globe,
    fields: ['language', 'timezone', 'dateFormat'],
  },
  privacy: {
    id: 'privacy',
    label: 'Privacy',
    icon: Eye,
    fields: ['analytics', 'dataSharingOptIn', 'visibilityLevel'],
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    fields: ['emailNotifications', 'pushNotifications', 'notificationFrequency'],
  },
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    fields: ['theme', 'primaryColor', 'fontSize'],
  },
  dataStorage: {
    id: 'dataStorage',
    label: 'Data & Storage',
    icon: Database,
    fields: ['autoSave', 'defaultFileFormat', 'cacheSize'],
  },
};
