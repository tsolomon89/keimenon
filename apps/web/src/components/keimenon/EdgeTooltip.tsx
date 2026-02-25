'use client';

import { getEdgeStyle } from './edge-styles';

interface EdgeData {
  id: string;
  kind: string;
  data?: Record<string, unknown>;
}

interface EdgeTooltipProps {
  edge: EdgeData | null;
  position: { x: number; y: number };
  visible: boolean;
}

// Helper to safely extract numeric value
function getNumber(val: unknown): number | null {
  return typeof val === 'number' ? val : null;
}

// Helper to safely extract string value
function getString(val: unknown): string | null {
  return typeof val === 'string' ? val : null;
}

// Helper to safely extract string array
function getStringArray(val: unknown): string[] | null {
  return Array.isArray(val) && val.every(v => typeof v === 'string') ? val : null;
}

export function EdgeTooltip({ edge, position, visible }: EdgeTooltipProps) {
  if (!visible || !edge) return null;

  const style = getEdgeStyle(edge.kind);
  const metadata = edge.data || {};

  // Extract typed values
  const score = getNumber(metadata.score);
  const count = getNumber(metadata.count);
  const pmi = getNumber(metadata.pmi);
  const weight = getNumber(metadata.weight);
  const strength = getNumber(metadata.strength);
  const rank = getNumber(metadata.rank);
  const confidence = getNumber(metadata.confidence);
  const algorithm = getString(metadata.algorithm);
  const span = getString(metadata.span);
  const featuresUsed = getStringArray(metadata.features_used);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: position.x + 12,
        top: position.y + 12,
      }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 min-w-[180px] max-w-[280px]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: style.highlightColor }}
          />
          <span className="text-sm font-medium text-white">{style.label}</span>
          <span className="text-xs text-slate-500 ml-auto">{edge.kind}</span>
        </div>

        {/* Metadata */}
        <dl className="space-y-1 text-xs">
          {/* Score (NEAR_DUP, CLUSTER_MEMBER) */}
          {score !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Similarity:</dt>
              <dd className="text-slate-200 font-mono">
                {(score * 100).toFixed(1)}%
              </dd>
            </div>
          )}

          {/* Count (MENTIONS, CO_OCCURS_WITH) */}
          {count !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Count:</dt>
              <dd className="text-slate-200">{count}</dd>
            </div>
          )}

          {/* PMI (CO_OCCURS_WITH) */}
          {pmi !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">PMI:</dt>
              <dd className="text-slate-200 font-mono">
                {pmi.toFixed(3)}
              </dd>
            </div>
          )}

          {/* Weight (BELONGS_TO_TOPIC) */}
          {weight !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Weight:</dt>
              <dd className="text-slate-200 font-mono">
                {(weight * 100).toFixed(1)}%
              </dd>
            </div>
          )}

          {/* Strength (SUPPORTS, REFUTES) */}
          {strength !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Strength:</dt>
              <dd className="text-slate-200 font-mono">
                {(strength * 100).toFixed(1)}%
              </dd>
            </div>
          )}

          {/* Algorithm (NEAR_DUP) */}
          {algorithm && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Algorithm:</dt>
              <dd className="text-slate-200 capitalize">{algorithm}</dd>
            </div>
          )}

          {/* Features used (NEAR_DUP) */}
          {featuresUsed && featuresUsed.length > 0 && (
            <div className="flex justify-between items-start">
              <dt className="text-slate-400">Features:</dt>
              <dd className="text-slate-200 text-right">
                {featuresUsed.join(', ')}
              </dd>
            </div>
          )}

          {/* Rank (CONTAINS) */}
          {rank !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Rank:</dt>
              <dd className="text-slate-200">{rank}</dd>
            </div>
          )}

          {/* Confidence (DERIVES_FROM) */}
          {confidence !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Confidence:</dt>
              <dd className="text-slate-200 font-mono">
                {(confidence * 100).toFixed(1)}%
              </dd>
            </div>
          )}

          {/* Span (DERIVES_FROM) */}
          {span && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Span:</dt>
              <dd className="text-slate-200 font-mono text-right">{span}</dd>
            </div>
          )}
        </dl>

        {/* Category badge */}
        <div className="mt-2 pt-2 border-t border-slate-700">
          <span
            className={`
            inline-flex px-2 py-0.5 rounded text-xs font-medium
            ${style.category === 'structural' ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : ''}
            ${style.category === 'similarity' ? 'bg-orange-600/20 text-orange-300 border border-orange-500/30' : ''}
            ${style.category === 'semantic' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : ''}
            ${style.category === 'verification' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : ''}
          `}
          >
            {style.category}
          </span>
        </div>
      </div>
    </div>
  );
}
