'use client';

import React from 'react';
import { Text } from './Text';
import { LucideIcon } from 'lucide-react';

/**
 * Tile Color - Semantic color schemes
 * Extracted from GroupCard:23-56
 */
export type TileColor =
  | 'purple' // Conversations
  | 'green' // Sources
  | 'orange' // Code
  | 'blue' // Groups
  | 'slate'; // Default

/**
 * Badge Configuration
 */
export interface TileBadge {
  label: string;
  color?: TileColor;
}

export interface TileProps {
  /** Tile title */
  title: string;

  /** Subtitle text */
  subtitle?: string;

  /** Icon component */
  icon?: LucideIcon;

  /** Icon color */
  iconColor?: TileColor;

  /** Badges to display */
  badges?: TileBadge[];

  /** Selected state */
  selected?: boolean;

  /** Click handler */
  onClick?: () => void;

  /** Double-click handler */
  onDoubleClick?: () => void;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Color scheme mappings
 * Extracted from GroupCard.tsx:23-56
 */
const colorSchemes: Record<TileColor, { bg: string; border: string; icon: string; text: string }> =
  {
    purple: {
      bg: 'bg-purple-600/10',
      border: 'border-purple-500/30',
      icon: 'text-purple-400',
      text: 'text-purple-300',
    },
    green: {
      bg: 'bg-green-600/10',
      border: 'border-green-500/30',
      icon: 'text-green-400',
      text: 'text-green-300',
    },
    orange: {
      bg: 'bg-orange-600/10',
      border: 'border-orange-500/30',
      icon: 'text-orange-400',
      text: 'text-orange-300',
    },
    blue: {
      bg: 'bg-blue-600/10',
      border: 'border-blue-500/30',
      icon: 'text-blue-400',
      text: 'text-blue-300',
    },
    slate: {
      bg: 'bg-slate-600/10',
      border: 'border-slate-500/30',
      icon: 'text-slate-400',
      text: 'text-slate-300',
    },
  };

/**
 * Tile Primitive - Compact card with icon and metadata
 *
 * Extracted from GroupCard.tsx:76-132
 *
 * Used for:
 * - Grid/list items
 * - Navigation items
 * - Selectable cards
 * - Status indicators
 *
 * Features:
 * - Icon with color theming
 * - Title + subtitle
 * - Metadata badges
 * - Selection state
 * - Hover effects
 *
 * Usage:
 * ```tsx
 * // Simple tile
 * <Tile
 *   title="Conversation"
 *   subtitle="24 messages"
 *   icon={MessageSquare}
 *   iconColor="purple"
 * />
 *
 * // Selectable tile with badges
 * <Tile
 *   title="API Documentation"
 *   icon={FileText}
 *   iconColor="green"
 *   badges={[
 *     { label: 'source', color: 'green' },
 *     { label: 'v2.0' }
 *   ]}
 *   selected={isSelected}
 *   onClick={handleSelect}
 * />
 * ```
 */
export function Tile({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'slate',
  badges = [],
  selected = false,
  onClick,
  onDoubleClick,
  className = '',
}: TileProps) {
  const colors = colorSchemes[iconColor];

  const containerClasses = `
    p-4 rounded-lg border backdrop-blur-sm cursor-pointer
    transition-all duration-200
    ${colors.bg} ${colors.border}
    ${selected ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/20' : 'hover:shadow-md hover:border-opacity-60'}
    ${className}
  `.trim();

  return (
    <div className={containerClasses} onClick={onClick} onDoubleClick={onDoubleClick}>
      {/* Header with icon */}
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className={`p-2 ${colors.bg} rounded-lg ${colors.icon}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white mb-1 line-clamp-2">{title}</h3>

      {/* Subtitle */}
      {subtitle && (
        <Text role="subtitle" mode="muted" className="line-clamp-1">
          {subtitle}
        </Text>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/50">
          {badges.slice(0, 3).map((badge, idx) => {
            const badgeColors = badge.color ? colorSchemes[badge.color] : colorSchemes.slate;
            return (
              <span
                key={idx}
                className={`px-2 py-1 ${badgeColors.bg} rounded text-xs ${badgeColors.text}`}
              >
                {badge.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}
