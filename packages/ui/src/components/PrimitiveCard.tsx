import React from 'react';
import { Text } from './Text';
import { cn } from '../utils/cn';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

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

export interface PrimitiveCardOwnProps {
  /** Card title */
  title?: string;

  /** Card subtitle/description */
  subtitle?: string;

  /** Visual variant */
  variant?: PrimitiveCardVariant;

  /** Additional CSS classes */
  className?: string;

  /** Click handler */
  onClick?: () => void;

  /** Hover effect */
  hoverable?: boolean;

  /** Header actions (e.g., buttons, icons) */
  headerActions?: React.ReactNode;
}

export type PrimitiveCardProps<C extends React.ElementType = 'div'> =
  PolymorphicComponentPropsWithRef<C, PrimitiveCardOwnProps>;

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
 */
export const PrimitiveCard: PolymorphicForwardRef<'div', PrimitiveCardOwnProps> = React.forwardRef(
  (
    {
      title,
      subtitle,
      variant = 'default',
      children,
      className = '',
      onClick,
      hoverable = false,
      headerActions,
      as,
      ...props
    }: any,
    ref: any
  ) => {
    const Component = as || 'div';
    const variantClasses = variantStyles[variant as PrimitiveCardVariant] || variantStyles.default;

    const hoverClasses =
      hoverable || onClick ? 'hover:border-slate-600 transition-colors cursor-pointer' : '';

    const combinedClassName = cn('border rounded-lg p-6', variantClasses, hoverClasses, className);

    return (
      <Component className={combinedClassName} onClick={onClick} ref={ref} {...props}>
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
      </Component>
    );
  }
) as any;

PrimitiveCard.displayName = 'PrimitiveCard';
