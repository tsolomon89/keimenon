'use client';

import React from 'react';
import { Text } from './Text';

/**
 * Card Variant - Visual style
 * Extracted from existing components
 */
export type CardVariant =
  | 'default' // Standard card (SettingsCard:61, CRMDashboard:50)
  | 'subtle' // Lower contrast (AccountInspector:80)
  | 'info' // Informational (blue tint)
  | 'success' // Success state (green tint)
  | 'warning' // Warning state (yellow tint)
  | 'error'; // Error state (red tint)

export interface CardProps {
  /** Card title */
  title?: string;

  /** Card subtitle/description */
  subtitle?: string;

  /** Visual variant */
  variant?: CardVariant;

  /** Child content */
  children: React.ReactNode;

  /** Additional CSS classes */
  className?: string;

  /** Click handler */
  onClick?: () => void;

  /** Hover effect */
  hoverable?: boolean;

  /** Header actions (e.g., buttons, icons) */
  headerActions?: React.ReactNode;
}

/**
 * Variant style mappings
 * Extracted from SettingsCard, CRMDashboard, AccountInspector
 */
const variantStyles: Record<CardVariant, string> = {
  // From SettingsCard:61, CRMDashboard:50
  default: 'bg-slate-800 border-slate-700',

  // From AccountInspector:80
  subtle: 'bg-slate-800/50 border-slate-700',

  // Info state
  info: 'bg-blue-600/10 border-blue-500/30',

  // Success state
  success: 'bg-green-600/10 border-green-500/30',

  // Warning state
  warning: 'bg-yellow-600/10 border-yellow-500/30',

  // Error state (from CRMDashboard:401-406)
  error: 'bg-red-600/10 border-red-500/30',
};

/**
 * Card Primitive - Logical grouping container
 *
 * Extracted from:
 * - SettingsCard.tsx:61 (main card container)
 * - CRMDashboard.tsx:50 (MetricCard)
 * - AccountInspector.tsx:80 (detail sections)
 *
 * Usage:
 * ```tsx
 * // Basic card
 * <Card title="Account Details">
 *   <Field type="string" label="Name" value={name} mode="read" />
 *   <Field type="string" label="Email" value={email} mode="read" />
 * </Card>
 *
 * // Card with actions
 * <Card
 *   title="Settings"
 *   headerActions={<Button size="sm">Edit</Button>}
 * >
 *   {content}
 * </Card>
 *
 * // Clickable card
 * <Card hoverable onClick={() => navigate('/details')}>
 *   {content}
 * </Card>
 * ```
 */
export function Card({
  title,
  subtitle,
  variant = 'default',
  children,
  className = '',
  onClick,
  hoverable = false,
  headerActions,
}: CardProps) {
  const variantClasses = variantStyles[variant];

  const hoverClasses =
    hoverable || onClick ? 'hover:border-slate-600 transition-colors cursor-pointer' : '';

  const combinedClassName = `
    border rounded-lg p-6
    ${variantClasses}
    ${hoverClasses}
    ${className}
  `.trim();

  return (
    <div className={combinedClassName} onClick={onClick}>
      {/* Header */}
      {(title || subtitle || headerActions) && (
        <div className="mb-4">
          {(title || headerActions) && (
            <div className="flex items-start justify-between mb-1">
              {title && <Text role="title">{title}</Text>}
              {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
            </div>
          )}
          {subtitle && (
            <Text role="hint" mode="muted">
              {subtitle}
            </Text>
          )}
        </div>
      )}

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
