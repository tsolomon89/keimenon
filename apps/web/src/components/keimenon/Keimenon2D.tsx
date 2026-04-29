'use client';

import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import type { GraphNode } from '@keimenon/graph';
import { type LodPlanStats } from '@/lib/graph-lod';
import { type NdProjectionConfig, type RenderLens } from '@/lib/nd-projection';
import {
  SharedThreeGraphRenderer,
  type SharedThreeGraphRendererHandle,
} from './SharedThreeGraphRenderer';
import type { GraphInteractionState } from './renderer/types';

interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: string;
  data?: Record<string, unknown>;
}

interface Keimenon2DProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  renderLens?: RenderLens;
  ndConfig?: NdProjectionConfig;
  focusModeEnabled?: boolean;
  includeConnectors?: boolean;
  pinnedNodeIds?: string[];
  interactive?: boolean;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onEdgeHover?: (edge: GraphEdge | null, position: { x: number; y: number }) => void;
  onLodStats?: (stats: LodPlanStats) => void;
  onPinnedNodeIdsChange?: (nodeIds: string[]) => void;
  onInteractionStateChange?: (state: GraphInteractionState) => void;
  onVisibilityDiagnostics?: (payload: {
    webGlReady: boolean | null;
    lens: RenderLens;
    totalNodeCount: number;
    lodVisibleNodeCount: number;
    lensVisibleNodeCount: number;
    totalEdgeCount: number;
    lodVisibleEdgeCount: number;
    lensVisibleEdgeCount: number;
    width: number;
    height: number;
  }) => void;
}

export interface Keimenon2DHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  focusOnNode: (nodeId: string, targetScale?: number, durationMs?: number) => void;
  zoomToFitNodes: (nodeIds: string[]) => void;
  resetView: () => void;
  optimizeView: () => void;
}

export const Keimenon2D = memo(
  forwardRef<Keimenon2DHandle, Keimenon2DProps>(
    (
      {
        nodes,
        edges,
        width,
        height,
        renderLens = '2d',
        ndConfig,
        focusModeEnabled = false,
        includeConnectors = false,
        pinnedNodeIds = [],
        interactive = true,
        onNodeClick,
        onNodeDoubleClick,
        onSelectionChange,
        onEdgeHover,
        onLodStats,
        onPinnedNodeIdsChange,
        onInteractionStateChange,
        onVisibilityDiagnostics,
      },
      ref
    ) => {
      const rendererRef = useRef<SharedThreeGraphRendererHandle>(null);

      useImperativeHandle(ref, () => ({
        zoomIn: () => rendererRef.current?.zoomIn(),
        zoomOut: () => rendererRef.current?.zoomOut(),
        centerView: () => rendererRef.current?.centerView(),
        focusOnNode: (nodeId: string, targetScale = 1.6) =>
          rendererRef.current?.focusOnNode(nodeId, targetScale),
        zoomToFitNodes: (nodeIds: string[]) => rendererRef.current?.zoomToFitNodes(nodeIds),
        resetView: () => rendererRef.current?.resetView(),
        optimizeView: () => rendererRef.current?.optimizeView(),
      }));

      return (
        <SharedThreeGraphRenderer
          ref={rendererRef}
          nodes={nodes}
          edges={edges}
          width={width}
          height={height}
          renderLens={renderLens}
          ndConfig={ndConfig}
          focusModeEnabled={focusModeEnabled}
          includeConnectors={includeConnectors}
          pinnedNodeIds={pinnedNodeIds}
          interactive={interactive}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          onEdgeHover={onEdgeHover}
          onLodStats={onLodStats}
          onPinnedNodeIdsChange={onPinnedNodeIdsChange}
          onInteractionStateChange={onInteractionStateChange}
          onVisibilityDiagnostics={onVisibilityDiagnostics}
        />
      );
    }
  )
);

Keimenon2D.displayName = 'Keimenon2D';
