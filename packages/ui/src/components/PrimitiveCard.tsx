'use client';

import React from 'react';
import { Text } from './Text';

/**
 * Card Variant - Visual style
 */
export type PrimitiveCardVariant =
  | 'default' // Standard card
  | 'subtle' // Lower contrast
  | 'info' // Informational (blue tint)
  | 'success' // Success state (green tint)
  | 'warning' // Warning state (yellow tint)
  | 'error'; // Error state (red tint)

export interface PrimitiveCardProps {
  /** Card title */
  title?: string;

  /** Card subtitle/description */
  subtitle?: string;

  /** Visual variant */
  variant?: PrimitiveCardVariant;

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
 */
const variantStyles: Record<PrimitiveCardVariant, string> = {
  default: 'bg-slate-800 border-slate-700',
  subtle: 'bg-slate-800/50 border-slate-700',
  info: 'bg-blue-600/10 border-blue-500/30',
  success: 'bg-green-600/10 border-green-500/30',
  warning: 'bg-yellow-600/10 border-yellow-500/30',
  error: 'bg-red-600/10 border-red-500/30',
};

/**
 * PrimitiveCard - Logical grouping container
 * Renamed to avoid conflict with generic Card
 */
import { cn } from '../utils/cn';

// ... (imports)

// ... (PrimitiveCardProps definition)

/**
 * PrimitiveCard - Logical grouping container
 * Renamed to avoid conflict with generic Card
 */
export function PrimitiveCard({
  title,
  subtitle,
  variant = 'default',
  children,
  className = '',
  onClick,
  hoverable = false,
  headerActions,
}: PrimitiveCardProps) {
  const variantClasses = variantStyles[variant];

  const hoverClasses =
    hoverable || onClick ? 'hover:border-slate-600 transition-colors cursor-pointer' : '';

  const combinedClassName = cn(
    'border rounded-lg p-6',
    variantClasses,
    hoverClasses,
    className
  );

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
