/**
 * Import Pipeline Progress
 *
 * Visual pipeline showing all 7 import stages with progress indicators.
 * Displays horizontal flow diagram with animated transitions between stages.
 *
 * Features:
 * - Stage indicators (circles) with icons
 * - Connection lines between stages
 * - Current stage highlighting
 * - Completion checkmarks
 * - Smooth animations
 */

'use client';

import { useMemo } from 'react';
import {
  Clock,
  FileText,
  Code2,
  Database,
  Network,
  Link2,
  CheckCircle2,
  Circle,
} from 'lucide-react';
export type ImportPipelineStage =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'indexing'
  | 'linking'
  | 'done';

interface ImportPipelineProgressProps {
  currentStage: ImportPipelineStage;
  progress: number; // 0-100
  error?: string;
}

// Pipeline stage configuration
interface PipelineStage {
  id: ImportPipelineStage;
  label: string;
  icon: any;
  order: number;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'queued', label: 'Queued', icon: Clock, order: 0 },
  { id: 'reading', label: 'Reading', icon: FileText, order: 1 },
  { id: 'parsing', label: 'Parsing', icon: Code2, order: 2 },
  { id: 'normalizing', label: 'Normalizing', icon: Database, order: 3 },
  { id: 'indexing', label: 'Indexing', icon: Network, order: 4 },
  { id: 'linking', label: 'Linking', icon: Link2, order: 5 },
  { id: 'done', label: 'Complete', icon: CheckCircle2, order: 6 },
];

export function ImportPipelineProgress({
  currentStage,
  progress,
  error,
}: ImportPipelineProgressProps) {
  // Determine stage state (pending, active, completed, error)
  const stageStates = useMemo(() => {
    const currentOrder = PIPELINE_STAGES.find((s) => s.id === currentStage)?.order ?? -1;

    return PIPELINE_STAGES.map((stage) => {
      if (error && stage.id === currentStage) {
        return 'error';
      } else if (stage.order < currentOrder) {
        return 'completed';
      } else if (stage.order === currentOrder) {
        return 'active';
      } else {
        return 'pending';
      }
    });
  }, [currentStage, error]);

  return (
    <div className="w-full py-6 px-4">
      {/* Pipeline visualization */}
      <div className="relative flex items-center justify-between">
        {/* Connection lines (background) */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-slate-700 -z-10" />

        {/* Progress line (foreground - grows with progress) */}
        <div
          className="absolute top-6 left-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 -z-10 transition-all duration-500"
          style={{
            width: `${(progress / 100) * 100}%`,
          }}
        />

        {/* Stage indicators */}
        {PIPELINE_STAGES.map((stage, index) => {
          const state = stageStates[index];
          const Icon = stage.icon;

          return (
            <div
              key={stage.id}
              className="flex flex-col items-center gap-2 relative"
              style={{ minWidth: '80px' }}
            >
              {/* Stage circle */}
              <div
                className={`
                  relative w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-300 border-2
                  ${
                    state === 'completed'
                      ? 'bg-green-600/20 border-green-500 text-green-400'
                      : state === 'active'
                        ? 'bg-purple-600/30 border-purple-400 text-purple-300 shadow-lg shadow-purple-500/50 animate-pulse'
                        : state === 'error'
                          ? 'bg-red-600/20 border-red-500 text-red-400'
                          : 'bg-slate-800 border-slate-600 text-slate-500'
                  }
                `}
              >
                {/* Icon */}
                <Icon className="w-5 h-5" />

                {/* Completion checkmark overlay */}
                {state === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-600/80 rounded-full">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                )}

                {/* Active stage pulse ring */}
                {state === 'active' && (
                  <div className="absolute inset-0 rounded-full border-2 border-purple-400 animate-ping opacity-75" />
                )}
              </div>

              {/* Stage label */}
              <div
                className={`
                  text-xs font-medium text-center transition-colors
                  ${
                    state === 'completed'
                      ? 'text-green-400'
                      : state === 'active'
                        ? 'text-purple-300 font-semibold'
                        : state === 'error'
                          ? 'text-red-400'
                          : 'text-slate-500'
                  }
                `}
              >
                {stage.label}
              </div>

              {/* Active stage indicator dot */}
              {state === 'active' && (
                <div className="absolute -bottom-2 w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              )}
            </div>
          );
        })}
      </div>

      {/* Current stage description (optional) */}
      {!error && (
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-400">
            {currentStage === 'queued' && 'Import is queued and waiting to start...'}
            {currentStage === 'reading' && 'Reading file contents...'}
            {currentStage === 'parsing' && 'Parsing conversations and messages...'}
            {currentStage === 'normalizing' && 'Building sources and extracting code...'}
            {currentStage === 'indexing' && 'Creating nodes and edges in graph database...'}
            {currentStage === 'linking' && 'Detecting duplicates and linking entities...'}
            {currentStage === 'done' && 'Import completed successfully!'}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm text-red-300 text-center">{error}</p>
        </div>
      )}
    </div>
  );
}
