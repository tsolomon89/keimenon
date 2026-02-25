'use client';

import React from 'react';
import { PrimitiveCard as Card } from './PrimitiveCard';
import { List } from './List';
import { Field } from './Field';
import { Text } from './Text';
import { cn } from '../utils/cn';

/**
 * ViewerMode - How the data should be displayed
 */
export type ViewerMode =
  | 'keimenon' // Graph visualization (special case)
  | 'dashboard' // Metrics and analytics
  | 'settings' // Configuration forms
  | 'detail' // Single object detail view
  | 'list'; // Collection of objects

/**
 * BoundObject - Data with metadata for rendering
 * This is what adapters return
 */
export interface BoundObject {
  /** The actual data */
  data: any;

  /** Object type for spec lookup */
  type: string;

  /** Capabilities (what actions are available) */
  _capabilities?: {
    canEdit?: boolean;
    canDelete?: boolean;
    canCreate?: boolean;
  };

  /** Available actions */
  _actions?: Array<{
    id: string;
    label: string;
    icon?: string;
    handler: () => void;
  }>;
}

export interface ViewerProps {
  /** Mode determines rendering strategy */
  mode: ViewerMode;

  /** Data to render (can be object, array, or BoundObject) */
  data?: any | BoundObject | BoundObject[];

  /** Loading state */
  loading?: boolean;

  /** Error message */
  error?: string;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Viewer Primitive - Grammar-based object walker
 *
import { cn } from '../utils/cn';

// ... (imports)

// ...

/**
 * Viewer Primitive - Grammar-based object walker
 *
 * Core Principle: "Arrays → List, Objects → Card, Scalars → Field"
 */
export function Viewer({ mode, data, loading = false, error, className = '' }: ViewerProps) {
  // Loading state
  if (loading) {
    return (
      <div className={cn('flex-1 flex items-center justify-center p-12', className)}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <Text role="hint" mode="muted">
            Loading...
          </Text>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex-1 flex items-center justify-center p-12', className)}>
        <Card variant="error" className="max-w-md">
          <Text role="title" mode="error">
            Error
          </Text>
          <Text role="hint" className="mt-2">
            {error}
          </Text>
        </Card>
      </div>
    );
  }

  // No data
  if (!data) {
    return (
      <div className={cn('flex-1 flex items-center justify-center p-12', className)}>
        <Text role="hint" mode="muted">
          No data available
        </Text>
      </div>
    );
  }

  // Render based on mode
  return (
    <div className={cn('flex-1 overflow-auto', className)}>
      <div className="p-6">{renderByMode(mode, data)}</div>
    </div>
  );
}

/**
 * Mode-specific rendering strategies
 */
function renderByMode(mode: ViewerMode, data: any): React.ReactNode {
  switch (mode) {
    case 'keimenon':
      return renderKeimenonMode(data);
    case 'dashboard':
      return renderDashboardMode(data);
    case 'settings':
      return renderSettingsMode(data);
    case 'detail':
      return renderDetailMode(data);
    case 'list':
      return renderListMode(data);
    default:
      return renderAutoMode(data);
  }
}

/**
 * Keimenon mode - Special case for graph visualization
 */
function renderKeimenonMode(data: any): React.ReactNode {
  return (
    <Card variant="info" className="max-w-4xl mx-auto">
      <Text role="title">Keimenon View</Text>
      <Text role="hint" mode="muted" className="mt-2">
        Graph keimenon visualization will be integrated here.
      </Text>
      <Text role="hint" mode="muted" className="mt-4">
        For now, this delegates to the existing KeimenonViewport component.
      </Text>
    </Card>
  );
}

/**
 * Dashboard mode - Array of metric cards
 */
function renderDashboardMode(data: any): React.ReactNode {
  if (!Array.isArray(data)) {
    return (
      <Text role="hint" mode="error">
        Dashboard mode expects an array of metrics
      </Text>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <Text role="title" className="text-2xl">
          Dashboard
        </Text>
        <Text role="hint" mode="muted" className="mt-1">
          System overview and metrics
        </Text>
      </div>

      <List
        items={data}
        layout="grid-3"
        gap="lg"
        renderItem={(metric) => (
          <Card variant="default">
            <div className="space-y-3">
              <Text role="label">{metric.title}</Text>
              <Text role="title" className="text-3xl">
                {metric.value}
              </Text>
              {metric.subtitle && (
                <Text role="hint" mode="muted">
                  {metric.subtitle}
                </Text>
              )}
            </div>
          </Card>
        )}
      />
    </div>
  );
}

/**
 * Settings mode - Nested object structure
 */
function renderSettingsMode(data: any): React.ReactNode {
  if (typeof data !== 'object' || Array.isArray(data)) {
    return (
      <Text role="hint" mode="error">
        Settings mode expects an object
      </Text>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Text role="title" className="text-2xl">
          Settings
        </Text>
        <Text role="hint" mode="muted" className="mt-1">
          Configure your preferences
        </Text>
      </div>

      {Object.entries(data).map(([sectionKey, sectionValue]) => (
        <Card key={sectionKey} title={sectionKey}>
          {renderObjectAsFields(sectionValue)}
        </Card>
      ))}
    </div>
  );
}

/**
 * Detail mode - Single object with fields
 */
function renderDetailMode(data: any): React.ReactNode {
  const boundObject = data as BoundObject;
  const actualData = boundObject.data || data;

  return (
    <div className="max-w-2xl mx-auto">
      <Card
        title={boundObject.type ? `${boundObject.type} Details` : 'Details'}
        headerActions={boundObject._actions?.map((action) => (
          <button
            key={action.id}
            onClick={action.handler}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
          >
            {action.label}
          </button>
        ))}
      >
        {renderObjectAsFields(actualData)}
      </Card>
    </div>
  );
}

/**
 * List mode - Array of objects
 */
function renderListMode(data: any): React.ReactNode {
  if (!Array.isArray(data)) {
    return (
      <Text role="hint" mode="error">
        List mode expects an array
      </Text>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <List
        items={data}
        renderItem={(item) => <Card>{renderObjectAsFields(item)}</Card>}
        emptyState={{
          message: 'No items to display',
        }}
      />
    </div>
  );
}

/**
 * Auto mode - Infer from data structure
 */
function renderAutoMode(data: any): React.ReactNode {
  if (Array.isArray(data)) {
    return renderListMode(data);
  }
  if (typeof data === 'object') {
    return renderDetailMode(data);
  }
  return <Text role="value">{String(data)}</Text>;
}

/**
 * Render object as fields
 */
function renderObjectAsFields(obj: any): React.ReactNode {
  if (typeof obj !== 'object' || obj === null) {
    return <Text role="value">{String(obj)}</Text>;
  }

  return (
    <div className="space-y-4">
      {Object.entries(obj).map(([key, value]) => {
        // Skip metadata fields
        if (key.startsWith('_')) {
          return null;
        }

        // Scalar values → Field
        if (typeof value === 'boolean') {
          return <Field key={key} type="boolean" label={key} value={value} mode="read" />;
        }

        if (typeof value === 'number') {
          return <Field key={key} type="number" label={key} value={value} mode="read" />;
        }

        if (typeof value === 'string') {
          return <Field key={key} type="string" label={key} value={value} mode="read" />;
        }

        // Arrays → List
        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <Text role="label" className="mb-2">
                {key}
              </Text>
              <div className="pl-4">
                {value.length === 0 ? (
                  <Text role="hint" mode="muted">
                    Empty
                  </Text>
                ) : (
                  <Text role="value">{value.join(', ')}</Text>
                )}
              </div>
            </div>
          );
        }

        // Nested objects → Recursive
        if (typeof value === 'object') {
          return (
            <div key={key}>
              <Text role="label" className="mb-2">
                {key}
              </Text>
              <div className="pl-4">{renderObjectAsFields(value)}</div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
