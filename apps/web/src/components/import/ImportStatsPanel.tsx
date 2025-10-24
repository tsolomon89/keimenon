/**
 * Import Stats Panel
 *
 * Displays animated counters showing import progress statistics.
 * Features smooth number animations and sparkline graphs.
 *
 * Features:
 * - Animated counter transitions
 * - Sparkline mini-graphs (optional)
 * - Color-coded metrics
 * - Icons for visual identification
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, FileText, Code2, Network, Users, TrendingUp } from 'lucide-react';

interface ImportStatsProps {
  stats: {
    conversationsProcessed: number;
    messagesProcessed: number;
    sourcesCreated: number;
    nodesCreated: number;
    edgesCreated: number;
  };
  animated?: boolean;
  layout?: 'grid' | 'horizontal';
}

interface StatCardProps {
  label: string;
  value: number;
  icon: any;
  color: string;
  animated?: boolean;
}

/**
 * Animated counter component
 * Smoothly animates from previous value to new value
 */
function AnimatedCounter({ value, duration = 500 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValueRef = useRef(0);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    const previousValue = previousValueRef.current;
    const difference = value - previousValue;

    if (difference === 0) return;

    // Cancel previous animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Start animation
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (easeOutCubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      const current = Math.round(previousValue + difference * eased);
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        previousValueRef.current = value;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration]);

  return <span>{displayValue.toLocaleString()}</span>;
}

/**
 * Individual stat card
 */
function StatCard({ label, value, icon: Icon, color, animated = true }: StatCardProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>

        {/* Trend indicator (optional) */}
        <div className="flex items-center gap-1 text-xs text-green-400">
          <TrendingUp className="w-3 h-3" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-3xl font-bold text-white">
          {animated ? <AnimatedCounter value={value} /> : value.toLocaleString()}
        </div>
        <div className="text-xs text-slate-400 font-medium">{label}</div>
      </div>

      {/* Mini sparkline placeholder (optional) */}
      {/* TODO: Add real sparkline graph showing growth over time */}
      <div className="mt-3 h-8 flex items-end gap-0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t ${color.split(' ')[0]}/30`}
            style={{
              height: `${Math.random() * 100}%`,
              transition: 'height 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Main stats panel component
 */
export function ImportStatsPanel({ stats, animated = true, layout = 'grid' }: ImportStatsProps) {
  const statCards = [
    {
      label: 'Conversations',
      value: stats.conversationsProcessed,
      icon: MessageSquare,
      color: 'from-blue-500 to-blue-600',
    },
    {
      label: 'Messages',
      value: stats.messagesProcessed,
      icon: Users,
      color: 'from-purple-500 to-purple-600',
    },
    {
      label: 'Sources',
      value: stats.sourcesCreated,
      icon: FileText,
      color: 'from-green-500 to-green-600',
    },
    {
      label: 'Code Blocks',
      value: stats.nodesCreated, // Placeholder - should be separate code blocks count
      icon: Code2,
      color: 'from-orange-500 to-orange-600',
    },
    {
      label: 'Nodes Created',
      value: stats.nodesCreated,
      icon: Network,
      color: 'from-pink-500 to-pink-600',
    },
    {
      label: 'Edges Created',
      value: stats.edgesCreated,
      icon: Network,
      color: 'from-cyan-500 to-cyan-600',
    },
  ];

  return (
    <div
      className={
        layout === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
          : 'flex flex-wrap gap-4'
      }
    >
      {statCards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          color={card.color}
          animated={animated}
        />
      ))}
    </div>
  );
}

/**
 * Compact stats display (for smaller spaces like table rows)
 */
export function CompactImportStats({ stats }: { stats: ImportStatsProps['stats'] }) {
  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1">
        <MessageSquare className="w-3 h-3 text-blue-400" />
        <span className="text-slate-300">{stats.conversationsProcessed}</span>
      </div>
      <div className="flex items-center gap-1">
        <Users className="w-3 h-3 text-purple-400" />
        <span className="text-slate-300">{stats.messagesProcessed}</span>
      </div>
      <div className="flex items-center gap-1">
        <FileText className="w-3 h-3 text-green-400" />
        <span className="text-slate-300">{stats.sourcesCreated}</span>
      </div>
      <div className="flex items-center gap-1">
        <Network className="w-3 h-3 text-pink-400" />
        <span className="text-slate-300">{stats.nodesCreated}</span>
      </div>
    </div>
  );
}
