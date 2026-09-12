import * as React from 'react';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

/**
 * Text Role: Semantic typography tokens
 * Extracted from existing components to ensure visual consistency
 */
export type TextRole =
  | 'title' // Large headings
  | 'subtitle' // Secondary headings
  | 'label' // Form labels, metadata keys
  | 'value' // Data values, body text
  | 'hint' // Helper text, descriptions
  | 'badge'; // Status indicators

/**
 * Surface Context: Where the text appears
 */
export type TextSurface = 'sidebar' | 'viewer' | 'card' | 'modal' | 'header';

/**
 * Text Mode: Visual weight/emphasis
 */
export type TextMode = 'normal' | 'muted' | 'emphasized' | 'error' | 'success';

export interface TextOwnProps {
  /** Semantic role determining typography */
  role: TextRole;

  /** Optional surface context for color adjustments */
  surface?: TextSurface;

  /** Optional mode for emphasis */
  mode?: TextMode;

  /** Optional additional classes */
  className?: string;
}

export type TextProps<C extends React.ElementType = 'span'> = PolymorphicComponentPropsWithRef<
  C,
  TextOwnProps
>;

const roleStyles: Record<TextRole, string> = {
  title: 'text-lg font-semibold',
  subtitle: 'text-sm',
  label: 'text-xs font-semibold uppercase',
  value: 'text-sm',
  hint: 'text-xs',
  badge: 'text-xs font-medium',
};

const modeColors: Record<TextMode, string> = {
  normal: 'text-white',
  muted: 'text-slate-400',
  emphasized: 'text-purple-300',
  error: 'text-red-300',
  success: 'text-green-300',
};

const roleModeOverrides: Partial<Record<TextRole, Partial<Record<TextMode, string>>>> = {
  label: {
    normal: 'text-slate-400',
    muted: 'text-slate-500',
  },
  hint: {
    normal: 'text-slate-400',
    muted: 'text-slate-500',
  },
  badge: {
    normal: 'text-slate-300',
  },
};

const defaultElements: Record<TextRole, React.ElementType> = {
  title: 'h3',
  subtitle: 'p',
  label: 'label',
  value: 'span',
  hint: 'p',
  badge: 'span',
};

/**
 * Text Primitive - Foundation for all typography
 */
export const Text: PolymorphicForwardRef<'span', TextOwnProps> = React.forwardRef(
  (
    { role, children, surface = 'viewer', mode = 'normal', className = '', as, ...props }: any,
    ref: any
  ) => {
    const baseStyles = roleStyles[role as TextRole] || '';
    const colorStyles =
      roleModeOverrides[role as TextRole]?.[mode as TextMode] ||
      modeColors[mode as TextMode] ||
      modeColors.normal;
    const combinedClassName = `${baseStyles} ${colorStyles} ${className}`.trim();

    const Component = as || defaultElements[role as TextRole] || 'span';

    return (
      <Component className={combinedClassName} ref={ref} {...props}>
        {children}
      </Component>
    );
  }
) as any;

Text.displayName = 'Text';
