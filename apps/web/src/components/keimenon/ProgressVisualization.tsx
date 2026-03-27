'use client';

import { useMemo } from 'react';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import { useJobStream } from '@/hooks/useJobStream';
import type { NdProjectionConfig, RenderLens } from '@/lib/nd-projection';
import { SharedThreeGraphRenderer } from './SharedThreeGraphRenderer';

interface ProgressVisualizationProps {
  width: number;
  height: number;
  jobId: string | null;
  renderLens?: RenderLens;
  ndConfig?: NdProjectionConfig;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function buildProgressNodes(width: number, height: number, percent: number): GraphNode[] {
  const nodeCount = Math.max(6, Math.floor(8 + percent / 6));
  const radius = Math.max(48, Math.min(width, height) * 0.15);
  const centerX = width * 0.82;
  const centerY = height * 0.18;

  return Array.from({ length: nodeCount }).map((_, index) => {
    const angle = (index / nodeCount) * Math.PI * 2;
    const pulse = 1 + (percent / 100) * 0.35;
    return {
      id: `progress_node_${index}`,
      kind: index < Math.ceil((percent / 100) * nodeCount) ? 'VerifiedClaim' : 'Phrase',
      x: centerX + Math.cos(angle) * radius * pulse,
      y: centerY + Math.sin(angle) * radius * pulse,
      label: `Progress ${index + 1}`,
      title: `Progress ${index + 1}`,
    };
  });
}

function buildProgressEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const source = nodes[index];
    const target = nodes[(index + 1) % nodes.length];
    edges.push({
      id: `progress_edge_${source.id}_${target.id}`,
      source: source.id,
      target: target.id,
      kind: 'CO_OCCURS_WITH',
    });
  }
  return edges;
}

export function ProgressVisualization({
  width,
  height,
  jobId,
  renderLens = '2d',
  ndConfig,
}: ProgressVisualizationProps) {
  const { jobs } = useJobStream();
  const job = jobId ? jobs.get(jobId) : null;
  const percent = clampPercent(Number(job?.progress?.percent ?? 0));
  const nodes = useMemo(() => buildProgressNodes(width, height, percent), [width, height, percent]);
  const edges = useMemo(() => buildProgressEdges(nodes), [nodes]);

  if (!jobId || !job || job.status !== 'running') {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-0 opacity-60">
        <SharedThreeGraphRenderer
          nodes={nodes}
          edges={edges}
          width={width}
          height={height}
          renderLens={renderLens}
          ndConfig={ndConfig}
          interactive={false}
          focusModeEnabled={false}
          includeConnectors={true}
          pinnedNodeIds={[]}
        />
      </div>

      <div className="absolute top-4 left-4 z-20 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-lg">
        <div className="font-semibold text-slate-100">Processing {percent}%</div>
        <div className="text-slate-400 mt-1">Lens: {renderLens.toUpperCase()}</div>
      </div>
    </div>
  );
}
