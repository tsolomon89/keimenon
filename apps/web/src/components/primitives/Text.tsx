'use client';

import React from 'react';

/**
 * Text Role: Semantic typography tokens
 * Extracted from existing components to ensure visual consistency
 */
export type TextRole =
  | 'title' // Large headings (e.g., SettingsCard line 66, GroupCard 104)
  | 'subtitle' // Secondary headings (e.g., GroupCard 110)
  | 'label' // Form labels, metadata keys (e.g., SettingsCard 75, AccountInspector 82)
  | 'value' // Data values, body text (e.g., SettingsCard 245, AccountInspector 83)
  | 'hint' // Helper text, descriptions (e.g., SettingsCard 75, AccountInspector 91)
  | 'badge'; // Status indicators (e.g., SettingsCard 213, CRMDashboard 56)

/**
 * Surface Context: Where the text appears
 * Affects subtle color adjustments
 */
export type TextSurface =
  | 'sidebar' // Navigation/inspector bars
  | 'viewer' // Main content area
  | 'card' // Within cards
  | 'modal' // Dialog overlays
  | 'header'; // Top app bar

/**
 * Text Mode: Visual weight/emphasis
 */
export type TextMode =
  | 'normal' // Default state
  | 'muted' // De-emphasized
  | 'emphasized' // Highlighted
  | 'error' // Error state
  | 'success'; // Success state

export interface TextProps {
  /** Semantic role determining typography */
  role: TextRole;

  /** Content to render */
  children: React.ReactNode;

  /** Optional surface context for color adjustments */
  surface?: TextSurface;

  /** Optional mode for emphasis */
  mode?: TextMode;

  /** Optional additional classes */
  className?: string;

  /** Optional HTML element override */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'label' | 'div';
}

/**
 * Token lookup tables extracted from existing components
 * These preserve the exact visual design while centralizing definitions
 */
const roleStyles: Record<TextRole, string> = {
  // From SettingsCard:66, CRMDashboard:165, GroupCard:104
  title: 'text-lg font-semibold',

  // From GroupCard:110, AccountInspector:66
  subtitle: 'text-sm',

  // From SettingsCard:75, AccountInspector:79,82
  label: 'text-xs font-semibold uppercase',

  // From SettingsCard:245, AccountInspector:83,87
  value: 'text-sm',

  // From SettingsCard:75, CRMDashboard:64
  hint: 'text-xs',

  // From SettingsCard:213, CRMDashboard:56
  badge: 'text-xs font-medium',
};

const modeColors: Record<TextMode, string> = {
  normal: 'text-white',
  muted: 'text-slate-400',
  emphasized: 'text-purple-300',
  error: 'text-red-300',
  success: 'text-green-300',
};

// Special handling for labels (always muted)
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
    normal: 'text-slate-300', // Badges have specific colors handled elsewhere
  },
};

/**
 * Text Primitive - Foundation for all typography
 *
 * Usage Examples (extracted from existing components):
 *
 * ```tsx
 * // SettingsCard title
 * <Text role="title">{control.label}</Text>
 *
 * // SettingsCard description
 * <Text role="hint" mode="muted">{control.description}</Text>
 *
 * // AccountInspector label
 * <Text role="label">Account Type</Text>
 *
 * // AccountInspector value
 * <Text role="value">{account.account_type}</Text>
 *
 * // GroupCard subtitle
 * <Text role="subtitle" mode="muted">{node.data.subtitle}</Text>
 *
 * // Badge
 * <Text role="badge" mode="emphasized">Business</Text>
 * ```
 */
export function Text({
  role,
  children,
  surface = 'viewer',
  mode = 'normal',
  className = '',
  as,
}: TextProps) {
  // Determine base styles from role
  const baseStyles = roleStyles[role];

  // Determine color from mode, with role-specific overrides
  const colorStyles = roleModeOverrides[role]?.[mode] || modeColors[mode];

  // Combine all styles
  const combinedClassName = `${baseStyles} ${colorStyles} ${className}`.trim();

  // Default HTML element based on role
  const defaultElement: Record<TextRole, TextProps['as']> = {
    title: 'h3',
    subtitle: 'p',
    label: 'label',
    value: 'span',
    hint: 'p',
    badge: 'span',
  };

  const Component = as || defaultElement[role] || 'span';

  return <Component className={combinedClassName}>{children}</Component>;
}
