'use client';

import { useMemo } from 'react';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import type { NdProjectionConfig, RenderLens } from '@/lib/nd-projection';
import { SharedThreeGraphRenderer } from '@/components/keimenon/SharedThreeGraphRenderer';

interface ImportMiniGraphProps {
  recentNodes?: Array<{
    id: string;
    kind: string;
    label: string;
  }>;
  width?: number;
  height?: number;
  renderLens?: RenderLens;
  ndConfig?: NdProjectionConfig;
}

function buildMiniGraphNodes(
  recentNodes: Array<{ id: string; kind: string; label: string }>,
  width: number,
  height: number
): GraphNode[] {
  if (recentNodes.length === 0) {
    return [];
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(70, Math.min(width, height) * 0.34);

  return recentNodes.map((node, index) => {
    const angle = (index / Math.max(1, recentNodes.length)) * Math.PI * 2;
    return {
      id: node.id,
      kind: node.kind || 'Source',
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      label: node.label,
      title: node.label,
    };
  });
}

function buildMiniGraphEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    edges.push({
      id: `edge_${nodes[index - 1].id}_${nodes[index].id}`,
      source: nodes[index - 1].id,
      target: nodes[index].id,
      kind: 'DERIVES_FROM',
    });
  }
  return edges;
}

export function ImportMiniGraph({
  recentNodes = [],
  width = 400,
  height = 300,
  renderLens = '2d',
  ndConfig,
}: ImportMiniGraphProps) {
  const nodes = useMemo(() => buildMiniGraphNodes(recentNodes, width, height), [recentNodes, width, height]);
  const edges = useMemo(() => buildMiniGraphEdges(nodes), [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
        Waiting for graph activity...
      </div>
    );
  }

  return (
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
  );
}

