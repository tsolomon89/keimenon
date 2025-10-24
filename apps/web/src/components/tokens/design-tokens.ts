/**
 * Design Tokens - Centralized design system
 *
 * Extracted from existing components to ensure visual consistency
 * across the entire application. These tokens preserve the exact
 * styling while making it reusable and maintainable.
 *
 * Sources:
 * - SettingsCard.tsx
 * - CRMDashboard.tsx
 * - GroupCard.tsx
 * - AccountInspector.tsx
 * - CanvasSidebar.tsx
 */

/**
 * Color Schemes - Semantic color palettes
 */
export const colorSchemes = {
  purple: {
    bg: 'bg-purple-600/20',
    bgSolid: 'bg-purple-600',
    bgHover: 'bg-purple-700',
    border: 'border-purple-500/30',
    text: 'text-purple-300',
    textBright: 'text-purple-200',
    icon: 'text-purple-400',
    ring: 'ring-purple-500',
  },
  blue: {
    bg: 'bg-blue-600/20',
    bgSolid: 'bg-blue-600',
    bgHover: 'bg-blue-700',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
    textBright: 'text-blue-200',
    icon: 'text-blue-400',
    ring: 'ring-blue-500',
  },
  green: {
    bg: 'bg-green-600/20',
    bgSolid: 'bg-green-600',
    bgHover: 'bg-green-700',
    border: 'border-green-500/30',
    text: 'text-green-300',
    textBright: 'text-green-200',
    icon: 'text-green-400',
    ring: 'ring-green-500',
  },
  red: {
    bg: 'bg-red-600/20',
    bgSolid: 'bg-red-600',
    bgHover: 'bg-red-700',
    border: 'border-red-500/30',
    text: 'text-red-300',
    textBright: 'text-red-200',
    icon: 'text-red-400',
    ring: 'ring-red-500',
  },
  yellow: {
    bg: 'bg-yellow-600/20',
    bgSolid: 'bg-yellow-600',
    bgHover: 'bg-yellow-700',
    border: 'border-yellow-500/30',
    text: 'text-yellow-300',
    textBright: 'text-yellow-200',
    icon: 'text-yellow-400',
    ring: 'ring-yellow-500',
  },
  orange: {
    bg: 'bg-orange-600/20',
    bgSolid: 'bg-orange-600',
    bgHover: 'bg-orange-700',
    border: 'border-orange-500/30',
    text: 'text-orange-300',
    textBright: 'text-orange-200',
    icon: 'text-orange-400',
    ring: 'ring-orange-500',
  },
  slate: {
    bg: 'bg-slate-600/20',
    bgSolid: 'bg-slate-600',
    bgHover: 'bg-slate-700',
    border: 'border-slate-500/30',
    text: 'text-slate-300',
    textBright: 'text-slate-200',
    icon: 'text-slate-400',
    ring: 'ring-slate-500',
  },
} as const;

/**
 * Container Styles - Common container patterns
 */
export const containers = {
  // From SettingsCard:61, CRMDashboard:50
  card: 'bg-slate-800 border border-slate-700 rounded-lg p-6',
  cardHover: 'hover:border-slate-600 transition-colors',
  cardSubtle: 'bg-slate-800/50 border border-slate-700 rounded-lg p-3',

  // From input fields
  input: 'bg-slate-900/50 border border-slate-700 rounded',
  inputFocus: 'focus:outline-none focus:ring-1 focus:ring-purple-500',

  // From modals
  modal: 'bg-slate-800 border border-slate-700 rounded-lg shadow-2xl',

  // From sidebars
  sidebar: 'bg-slate-950/50 border-slate-800',

  // From badges
  badge: 'px-3 py-1.5 rounded-lg border',
  badgeSmall: 'px-2 py-1 rounded text-xs',
} as const;

/**
 * Typography Styles - Text hierarchy
 */
export const typography = {
  // Headings
  h1: 'text-2xl font-bold text-white',
  h2: 'text-xl font-bold text-white',
  h3: 'text-lg font-semibold text-white',
  h4: 'text-base font-semibold text-white',

  // Body text
  body: 'text-sm text-white',
  bodyMuted: 'text-sm text-slate-400',
  bodySmall: 'text-xs text-slate-400',

  // Labels and metadata
  label: 'text-xs font-semibold uppercase text-slate-400',
  labelSmall: 'text-xs text-slate-500',

  // Code and monospace
  code: 'font-mono text-xs',
  codeBlock: 'font-mono text-xs bg-slate-900/50 rounded p-2',
} as const;

/**
 * Spacing Scale - Consistent spacing
 */
export const spacing = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
} as const;

/**
 * Button Styles - Interactive elements
 */
export const buttons = {
  // Primary action
  primary:
    'px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium',
  primarySmall:
    'px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium',

  // Secondary action
  secondary:
    'px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium',
  secondarySmall:
    'px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium',

  // Ghost/subtle
  ghost: 'px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors',
  ghostSmall: 'px-2 py-1 hover:bg-slate-800 text-slate-300 rounded transition-colors text-sm',

  // Icon button
  icon: 'p-2 hover:bg-slate-700 rounded transition-colors',
  iconSmall: 'p-1 hover:bg-slate-700 rounded transition-colors',

  // Danger action
  danger:
    'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium',
} as const;

/**
 * Animation Classes
 */
export const animations = {
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  fadeIn: 'animate-fade-in',
  slideIn: 'animate-slide-in',
} as const;

/**
 * Shadow Styles
 */
export const shadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  purple: 'shadow-lg shadow-purple-500/20',
  none: 'shadow-none',
} as const;

/**
 * Border Radius
 */
export const radii = {
  none: 'rounded-none',
  sm: 'rounded',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
} as const;

/**
 * Helper function to get color scheme
 */
export function getColorScheme(color: keyof typeof colorSchemes) {
  return colorSchemes[color] || colorSchemes.slate;
}

/**
 * Helper function to combine token classes
 */
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
