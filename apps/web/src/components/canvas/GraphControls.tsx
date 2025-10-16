'use client';

import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Map,
  RotateCcw,
} from 'lucide-react';

interface GraphControlsProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onResetView?: () => void;
  onToggleMinimap?: () => void;
  minimapEnabled?: boolean;
}

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetView,
  onToggleMinimap,
  minimapEnabled = false,
}: GraphControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onZoomIn}
        className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomOut}
        className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={onFitView}
        className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
        title="Fit to Screen"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
      <button
        onClick={onResetView}
        className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
        title="Reset View"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <button
        onClick={onToggleMinimap}
        className={`p-2 rounded transition-colors ${
          minimapEnabled
            ? 'bg-purple-600 text-white'
            : 'hover:bg-slate-800 text-slate-400 hover:text-white'
        }`}
        title="Toggle Minimap"
      >
        <Map className="w-4 h-4" />
      </button>
    </div>
  );
}
