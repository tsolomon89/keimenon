/**
 * Users View Spec - Declarative view configuration
 *
 * Specs define HOW data should be displayed without writing
 * component code. They describe:
 * - Which fields to show in lists
 * - Which fields to show in detail/inspector views
 * - How to badge/tag items
 * - What actions are available
 *
 * This allows new views to be created with just configuration,
 * no new components needed.
 */

import { Users, Mail, Shield, Building2, Calendar } from 'lucide-react';

/**
 * ViewSpec interface - Common structure for all specs
 */
export interface ViewSpec {
  /** Type identifier */
  type: string;

  /** Display name */
  displayName: string;

  /** Icon component */
  icon?: any;

  /** List view configuration */
  list: {
    /** Primary fields to show in tiles/cards */
    fields: string[];
    /** Fields to show as badges */
    badges?: string[];
    /** Field to use as subtitle */
    subtitle?: string;
    /** Layout mode */
    layout?: 'vertical' | 'grid-2' | 'grid-3' | 'grid-4';
  };

  /** Detail/Inspector view configuration */
  inspector: {
    /** Grouped sections */
    groups: Array<{
      title: string;
      fields: string[];
    }>;
    /** Available actions */
    actions?: Array<{
      id: string;
      label: string;
      icon?: string;
      color?: string;
    }>;
  };

  /** Field display configuration */
  fields: Record<
    string,
    {
      label: string;
      type?: 'string' | 'number' | 'boolean' | 'date' | 'email';
      format?: (value: any) => string;
      icon?: any;
    }
  >;

  /** Badge configuration */
  badgeConfig?: {
    field: string;
    colorMap?: Record<string, string>;
  };
}

/**
 * Users View Spec
 *
 * Defines how users are displayed throughout the application
 */
export const USERS_SPEC: ViewSpec = {
  type: 'user',
  displayName: 'User',
  icon: Users,

  list: {
    fields: ['email', 'permissionLevel', 'accountType'],
    badges: ['accountType', 'permissionLevel'],
    subtitle: 'email',
    layout: 'vertical',
  },

  inspector: {
    groups: [
      {
        title: 'Account Information',
        fields: ['email', 'accountId', 'userId'],
      },
      {
        title: 'Permissions',
        fields: ['permissionLevel', 'accountType'],
      },
      {
        title: 'Metadata',
        fields: ['createdAt', 'lastLogin'],
      },
    ],
    actions: [
      {
        id: 'edit',
        label: 'Edit User',
        icon: 'Edit',
      },
      {
        id: 'resetPassword',
        label: 'Reset Password',
        icon: 'Key',
      },
      {
        id: 'delete',
        label: 'Delete User',
        icon: 'Trash',
        color: 'red',
      },
    ],
  },

  fields: {
    email: {
      label: 'Email',
      type: 'email',
      icon: Mail,
    },
    userId: {
      label: 'User ID',
      type: 'string',
      format: (value) => value.slice(0, 8) + '...',
    },
    accountId: {
      label: 'Account ID',
      type: 'string',
      format: (value) => value.slice(0, 8) + '...',
    },
    permissionLevel: {
      label: 'Permission Level',
      type: 'string',
      icon: Shield,
      format: (value) => value.charAt(0).toUpperCase() + value.slice(1),
    },
    accountType: {
      label: 'Account Type',
      type: 'string',
      icon: Building2,
      format: (value) => value.charAt(0).toUpperCase() + value.slice(1),
    },
    createdAt: {
      label: 'Created',
      type: 'date',
      icon: Calendar,
      format: (value) => new Date(value).toLocaleDateString(),
    },
    lastLogin: {
      label: 'Last Login',
      type: 'date',
      format: (value) => (value ? new Date(value).toLocaleDateString() : 'Never'),
    },
  },

  badgeConfig: {
    field: 'accountType',
    colorMap: {
      admin: 'red',
      client: 'blue',
    },
  },
};
