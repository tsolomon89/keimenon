'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import { buildLodPlan, type LodPlanStats } from '@/lib/graph-lod';
import {
  DEFAULT_ND_CONFIG,
  type NdProjectionConfig,
  type RenderLens,
  deterministicNodePlanePosition,
  passesNdSlice,
  projectNodeVector,
  resolveNodeVector,
} from '@/lib/nd-projection';
import {
  applyDragDeltaForLens,
  applyMarqueeSelection,
  pickNearestEdge,
  selectNodesInMarquee,
  type ScreenEdgeGeometry,
  type ScreenNodeGeometry,
} from '@/components/keimenon/renderer/interaction-engine';
import {
  defaultLensDistance,
  distanceForBoundingRadius,
  distanceForTargetScale,
  zoomInDistance,
  zoomOutDistance,
} from '@/components/keimenon/renderer/camera-controller';
import {
  buildNeighborhood,
  computeCenter,
  edgeEndpointId,
  type GraphEdgeWithData,
} from '@/components/keimenon/renderer/projection-lod';
import {
  EdgeSegments,
  NodeSpheres,
  type RenderNodePrimitive,
} from '@/components/keimenon/renderer/render-primitives';
import type {
  GraphInteractionState,
  GraphPickResult,
  GraphScreenPoint,
  MarqueeSelectionSession,
  NodeDragSession,
} from '@/components/keimenon/renderer/types';

export interface SharedThreeGraphRendererProps {
  nodes: GraphNode[];
  edges: GraphEdgeWithData[];
  width: number;
  height: number;
  renderLens: RenderLens;
  ndConfig?: NdProjectionConfig;
  focusModeEnabled?: boolean;
  includeConnectors?: boolean;
  pinnedNodeIds?: string[];
  interactive?: boolean;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onEdgeHover?: (edge: GraphEdgeWithData | null, position: { x: number; y: number }) => void;
  onLodStats?: (stats: LodPlanStats) => void;
  onPinnedNodeIdsChange?: (nodeIds: string[]) => void;
  onInteractionStateChange?: (state: GraphInteractionState) => void;
}

export interface SharedThreeGraphRendererHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  focusOnNode: (nodeId: string, targetScale?: number, durationMs?: number) => void;
  zoomToFitNodes: (nodeIds: string[]) => void;
  resetView: () => void;
  optimizeView: () => void;
}

interface RenderNode extends RenderNodePrimitive {
  isPinned: boolean;
}

interface RenderEdgeReference {
  edge: GraphEdgeWithData;
  sourceId: string;
  targetId: string;
}

interface SceneController {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  setTargetById: (nodeId: string, targetScale?: number) => void;
  zoomToFitNodes: (nodeIds: string[]) => void;
}

function supportsWebGl(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function resolveNodeRadius(kind: string): number {
  switch (kind) {
    case 'Constellation':
      return 14;
    case 'Group':
    case 'Folder':
      return 11;
    case 'Principal':
    case 'UserNode':
      return 9;
    case 'Source':
    case 'SourceDoc':
    case 'VerifiedSource':
      return 7;
    case 'ObjectiveClaim':
    case 'VerifiedClaim':
      return 6;
    case 'Topic':
      return 5;
    case 'Phrase':
      return 4;
    case 'Lexeme':
      return 3;
    default:
      return 5;
  }
}

function resolveNodeColor(node: GraphNode, selected: boolean, pinned: boolean): string {
  const kind = node.kind;
  const withPrincipal = node as GraphNode & { principal_kind?: string };

  if (selected) {
    return '#f8fafc';
  }

  if (pinned) {
    return '#f59e0b';
  }

  if (kind === 'Principal') {
    if (withPrincipal.principal_kind === 'human') {
      return '#ec4899';
    }
    if (withPrincipal.principal_kind === 'agent') {
      return '#8b5cf6';
    }
    return '#94a3b8';
  }

  switch (kind) {
    case 'Source':
      return '#38bdf8';
    case 'SourceDoc':
      return '#14b8a6';
    case 'Group':
      return '#a855f7';
    case 'Folder':
      return '#f59e0b';
    case 'ObjectiveClaim':
      return '#22c55e';
    case 'Constellation':
      return '#f97316';
    case 'Lexeme':
      return '#94a3b8';
    case 'Phrase':
      return '#fb923c';
    case 'Topic':
      return '#ef4444';
    case 'VerifiedSource':
      return '#10b981';
    case 'VerifiedClaim':
      return '#3b82f6';
    case 'ConversationThread':
    case 'ChatThread':
      return '#8b5cf6';
    default:
      return '#64748b';
  }
}

interface SceneRootProps {
  renderLens: RenderLens;
  interactive: boolean;
  interactionLocked: boolean;
  edgePositions: Float32Array;
  renderNodes: RenderNode[];
  renderEdges: RenderEdgeReference[];
  onNodeClickInternal: (nodeId: string, event: MouseEvent, doubleClick: boolean) => void;
  onMissedClick: () => void;
  onZoomSample: (zoom: number) => void;
  registerController: (controller: SceneController) => void;
  positionById: Map<string, [number, number, number]>;
  onEdgePick: (pick: GraphPickResult) => void;
  onMarqueeSessionChange: (session: MarqueeSelectionSession | null) => void;
  onMarqueeComplete: (selectedIds: string[], modifiers: MarqueeSelectionSession['modifiers']) => void;
  onDragSessionChange: (session: NodeDragSession | null) => void;
  onNodeDrag: (nodeId: string, position: [number, number, number]) => void;
}

function SceneRoot({
  renderLens,
  interactive,
  interactionLocked,
  edgePositions,
  renderNodes,
  renderEdges,
  onNodeClickInternal,
  onMissedClick,
  onZoomSample,
  registerController,
  positionById,
  onEdgePick,
  onMarqueeSessionChange,
  onMarqueeComplete,
  onDragSessionChange,
  onNodeDrag,
}: SceneRootProps) {
  const controlsRef = useRef<any>(null);
  const { camera, gl, size } = useThree();
  const targetRef = useRef<[number, number, number]>([0, 0, 0]);
  const distanceRef = useRef<number>(defaultLensDistance(renderLens));
  const zoomRef = useRef<number>(0);
  const renderNodeMapRef = useRef<Map<string, [number, number, number]>>(new Map());
  const dragSessionRef = useRef<NodeDragSession | null>(null);
  const marqueeSessionRef = useRef<MarqueeSelectionSession | null>(null);
  const pointerTravelRef = useRef(0);
  const suppressClickNodeIdRef = useRef<string | null>(null);
  const hoveredEdgeIdRef = useRef<string | null>(null);
  const lastHoverAtRef = useRef<number>(0);

  useEffect(() => {
    const next = new Map<string, [number, number, number]>();
    for (const node of renderNodes) {
      next.set(node.node.id, node.position);
    }
    renderNodeMapRef.current = next;
  }, [renderNodes]);

  const toLocalPoint = useCallback(
    (clientX: number, clientY: number): GraphScreenPoint => {
      const rect = gl.domElement.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    [gl]
  );

  const worldToScreen = useCallback(
    (point: [number, number, number]): GraphScreenPoint => {
      const projected = new THREE.Vector3(point[0], point[1], point[2]).project(camera);
      return {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
      };
    },
    [camera, size.height, size.width]
  );

  const applyCamera = useCallback(() => {
    const target = targetRef.current;
    const distance = distanceRef.current;
    camera.position.set(target[0], target[1], target[2] + distance);
    if (controlsRef.current) {
      controlsRef.current.target.set(target[0], target[1], target[2]);
      controlsRef.current.update();
    } else {
      camera.lookAt(target[0], target[1], target[2]);
    }
  }, [camera]);

  const zoomToFit = useCallback(
    (nodeIds: string[]) => {
      const points = nodeIds
        .map((nodeId) => positionById.get(nodeId))
        .filter((value): value is [number, number, number] => !!value);

      if (points.length === 0) {
        return;
      }

      const center = computeCenter(points);
      let maxRadius = 0;
      for (const point of points) {
        const dx = point[0] - center[0];
        const dy = point[1] - center[1];
        const dz = point[2] - center[2];
        maxRadius = Math.max(maxRadius, Math.sqrt(dx * dx + dy * dy + dz * dz));
      }

      targetRef.current = center;
      distanceRef.current = distanceForBoundingRadius(maxRadius);
      applyCamera();
    },
    [applyCamera, positionById]
  );

  const emitEdgeHoverPick = useCallback(
    (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastHoverAtRef.current < 24) {
        return;
      }
      lastHoverAtRef.current = now;

      if (!interactive || dragSessionRef.current || marqueeSessionRef.current) {
        if (hoveredEdgeIdRef.current) {
          hoveredEdgeIdRef.current = null;
          onEdgePick({ kind: 'none', screen: { x: clientX, y: clientY } });
        }
        return;
      }

      const local = toLocalPoint(clientX, clientY);
      const screenEdges: ScreenEdgeGeometry[] = [];

      for (const entry of renderEdges) {
        const source = renderNodeMapRef.current.get(entry.sourceId);
        const target = renderNodeMapRef.current.get(entry.targetId);
        if (!source || !target) {
          continue;
        }
        screenEdges.push({
          edgeId: entry.edge.id,
          source: worldToScreen(source),
          target: worldToScreen(target),
          metadata: entry.edge.data,
        });
      }

      const localPick = pickNearestEdge(local, screenEdges, 10);
      const pick: GraphPickResult = {
        ...localPick,
        screen: { x: clientX, y: clientY },
      };

      if (pick.kind === 'edge') {
        if (hoveredEdgeIdRef.current !== pick.edgeId) {
          hoveredEdgeIdRef.current = pick.edgeId ?? null;
          onEdgePick(pick);
        } else {
          onEdgePick(pick);
        }
      } else if (hoveredEdgeIdRef.current) {
        hoveredEdgeIdRef.current = null;
        onEdgePick(pick);
      }
    },
    [interactive, onEdgePick, renderEdges, toLocalPoint, worldToScreen]
  );

  useEffect(() => {
    targetRef.current = [0, 0, 0];
    distanceRef.current = defaultLensDistance(renderLens);
    applyCamera();
  }, [applyCamera, renderLens]);

  useEffect(() => {
    registerController({
      zoomIn: () => {
        distanceRef.current = zoomInDistance(distanceRef.current);
        applyCamera();
      },
      zoomOut: () => {
        distanceRef.current = zoomOutDistance(distanceRef.current);
        applyCamera();
      },
      centerView: () => {
        targetRef.current = [0, 0, 0];
        distanceRef.current = defaultLensDistance(renderLens);
        applyCamera();
      },
      setTargetById: (nodeId: string, targetScale = 1.6) => {
        const position = positionById.get(nodeId);
        if (!position) {
          return;
        }
        targetRef.current = position;
        distanceRef.current = distanceForTargetScale(targetScale);
        applyCamera();
      },
      zoomToFitNodes: zoomToFit,
    });
  }, [applyCamera, positionById, registerController, renderLens, zoomToFit]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragSession = dragSessionRef.current;
      if (dragSession && dragSession.pointerId === event.pointerId) {
        const local = toLocalPoint(event.clientX, event.clientY);
        const dx = local.x - dragSession.lastScreen.x;
        const dy = local.y - dragSession.lastScreen.y;
        pointerTravelRef.current += Math.abs(dx) + Math.abs(dy);
        dragSession.lastScreen = local;

        const cameraDistance = camera.position.distanceTo(
          new THREE.Vector3(
            dragSession.currentWorld[0],
            dragSession.currentWorld[1],
            dragSession.currentWorld[2]
          )
        );
        const scale = Math.max(0.18, cameraDistance / 900);

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
        const next = applyDragDeltaForLens(
          dragSession.currentWorld,
          dragSession.lens,
          { dx, dy },
          scale,
          {
            right: { x: right.x, y: right.y, z: right.z },
            up: { x: up.x, y: up.y, z: up.z },
          }
        );

        dragSession.currentWorld = next;
        onNodeDrag(dragSession.nodeId, next);
        onDragSessionChange({ ...dragSession });
        return;
      }

      const marqueeSession = marqueeSessionRef.current;
      if (marqueeSession && marqueeSession.active) {
        marqueeSession.current = toLocalPoint(event.clientX, event.clientY);
        onMarqueeSessionChange({ ...marqueeSession });
        return;
      }

      emitEdgeHoverPick(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragSession = dragSessionRef.current;
      if (dragSession && dragSession.pointerId === event.pointerId) {
        if (pointerTravelRef.current > 4) {
          suppressClickNodeIdRef.current = dragSession.nodeId;
        }
        dragSessionRef.current = null;
        pointerTravelRef.current = 0;
        onDragSessionChange(null);
        return;
      }

      const marqueeSession = marqueeSessionRef.current;
      if (marqueeSession && marqueeSession.active) {
        marqueeSession.current = toLocalPoint(event.clientX, event.clientY);
        const nodesForSelection: ScreenNodeGeometry[] = renderNodes
          .map((node) => ({
            nodeId: node.node.id,
            point: worldToScreen(node.position),
          }))
          .filter((entry) => Number.isFinite(entry.point.x) && Number.isFinite(entry.point.y));
        const selectedIds = selectNodesInMarquee(nodesForSelection, marqueeSession);
        onMarqueeComplete(selectedIds, marqueeSession.modifiers);
        marqueeSessionRef.current = null;
        onMarqueeSessionChange(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    camera,
    emitEdgeHoverPick,
    onDragSessionChange,
    onMarqueeComplete,
    onMarqueeSessionChange,
    onNodeDrag,
    renderNodes,
    toLocalPoint,
    worldToScreen,
  ]);

  const startMarquee = useCallback(
    (event: PointerEvent) => {
      if (!interactive || event.button !== 0 || dragSessionRef.current) {
        return;
      }

      const start = toLocalPoint(event.clientX, event.clientY);
      const nextSession: MarqueeSelectionSession = {
        active: true,
        start,
        current: start,
        modifiers: {
          shift: event.shiftKey,
          ctrlOrMeta: event.ctrlKey || event.metaKey,
        },
      };
      marqueeSessionRef.current = nextSession;
      onMarqueeSessionChange(nextSession);
    },
    [interactive, onMarqueeSessionChange, toLocalPoint]
  );

  const startNodeDrag = useCallback(
    (nodeId: string, event: PointerEvent) => {
      if (
        !interactive ||
        event.button !== 0 ||
        event.altKey ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const startWorld = renderNodeMapRef.current.get(nodeId);
      if (!startWorld) {
        return;
      }

      const startScreen = toLocalPoint(event.clientX, event.clientY);
      const nextSession: NodeDragSession = {
        nodeId,
        pointerId: event.pointerId,
        lens: renderLens,
        startScreen,
        lastScreen: startScreen,
        startWorld: [...startWorld],
        currentWorld: [...startWorld],
      };

      pointerTravelRef.current = 0;
      dragSessionRef.current = nextSession;
      onDragSessionChange(nextSession);
    },
    [interactive, onDragSessionChange, renderLens, toLocalPoint]
  );

  const handleNodeClickFromPrimitive = useCallback(
    (nodeId: string, event: MouseEvent, doubleClick: boolean) => {
      if (suppressClickNodeIdRef.current === nodeId) {
        suppressClickNodeIdRef.current = null;
        return;
      }
      onNodeClickInternal(nodeId, event, doubleClick);
    },
    [onNodeClickInternal]
  );

  useFrame(() => {
    if (!controlsRef.current) {
      return;
    }
    const distance = controlsRef.current.object.position.distanceTo(controlsRef.current.target);
    distanceRef.current = distance;
    const zoom = Math.max(0.05, Math.min(6, 820 / Math.max(1, distance)));
    if (Math.abs(zoom - zoomRef.current) > 0.03) {
      zoomRef.current = zoom;
      onZoomSample(zoom);
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[260, 220, 450]} intensity={0.65} />
      <pointLight position={[-260, -160, 260]} intensity={0.35} />

      <EdgeSegments edgePositions={edgePositions} />

      <NodeSpheres
        renderNodes={renderNodes}
        onNodeClick={handleNodeClickFromPrimitive}
        onNodePointerDown={startNodeDrag}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={interactive && !interactionLocked}
        enableZoom={interactive && !interactionLocked}
        enableRotate={interactive && !interactionLocked && renderLens !== '2d'}
        minPolarAngle={renderLens === '2d' ? Math.PI / 2 : 0.2}
        maxPolarAngle={renderLens === '2d' ? Math.PI / 2 : Math.PI - 0.2}
        zoomSpeed={0.9}
        rotateSpeed={0.55}
        panSpeed={0.9}
        makeDefault
      />

      <mesh
        position={[0, 0, -500]}
        onPointerDown={(event) => startMarquee(event.nativeEvent as PointerEvent)}
        onClick={(event) => {
          event.stopPropagation();
          onMissedClick();
        }}
      >
        <planeGeometry args={[8000, 8000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}

export const SharedThreeGraphRenderer = forwardRef<
  SharedThreeGraphRendererHandle,
  SharedThreeGraphRendererProps
>(
  (
    {
      nodes,
      edges,
      width,
      height,
      renderLens,
      ndConfig = DEFAULT_ND_CONFIG,
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
    },
    ref
  ) => {
    const [webGlReady, setWebGlReady] = useState<boolean | null>(null);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [zoomForLod, setZoomForLod] = useState(1);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
    const [marqueeSession, setMarqueeSession] = useState<MarqueeSelectionSession | null>(null);
    const [dragSession, setDragSession] = useState<NodeDragSession | null>(null);
    const [dragPositionsById, setDragPositionsById] = useState<Map<string, [number, number, number]>>(
      new Map()
    );
    const sceneControllerRef = useRef<SceneController | null>(null);

    useEffect(() => {
      setWebGlReady(supportsWebGl());
    }, []);

    const normalizedNodes = useMemo(
      () =>
        nodes.map((node) => {
          const fallback = deterministicNodePlanePosition(node);
          return {
            ...node,
            x: node.x ?? fallback.x,
            y: node.y ?? fallback.y,
          };
        }),
      [nodes]
    );

    const nodeIdSet = useMemo(() => new Set(normalizedNodes.map((node) => node.id)), [normalizedNodes]);

    const normalizedEdges = useMemo(
      () =>
        edges.filter((edge) => {
          const sourceId = edgeEndpointId(edge.source as string | GraphNode);
          const targetId = edgeEndpointId(edge.target as string | GraphNode);
          return nodeIdSet.has(sourceId) && nodeIdSet.has(targetId);
        }),
      [edges, nodeIdSet]
    );

    const edgeById = useMemo(() => {
      const map = new Map<string, GraphEdgeWithData>();
      for (const edge of normalizedEdges) {
        map.set(edge.id, edge);
      }
      return map;
    }, [normalizedEdges]);

    const selectedSingleId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

    const lodPlan = useMemo(
      () =>
        buildLodPlan({
          nodes: normalizedNodes,
          edges: normalizedEdges,
          zoom: zoomForLod,
          focusNodeId: selectedSingleId,
          focusMode: focusModeEnabled,
          pinnedNodeIds,
          includeConnectors,
        }),
      [
        normalizedNodes,
        normalizedEdges,
        zoomForLod,
        selectedSingleId,
        focusModeEnabled,
        pinnedNodeIds,
        includeConnectors,
      ]
    );

    useEffect(() => {
      onLodStats?.(lodPlan.stats);
    }, [lodPlan.stats, onLodStats]);

    const vectorById = useMemo(() => {
      const vectors = new Map<string, number[]>();
      const dims = Math.max(3, ndConfig.dims);
      for (const node of lodPlan.visibleNodes) {
        vectors.set(node.id, resolveNodeVector(node, dims));
      }
      return vectors;
    }, [lodPlan.visibleNodes, ndConfig.dims]);

    const focusNeighborhood = useMemo(() => {
      if (!selectedSingleId || !focusModeEnabled) {
        return new Set<string>();
      }
      return buildNeighborhood(selectedSingleId, lodPlan.visibleEdges as GraphEdgeWithData[], 2);
    }, [selectedSingleId, focusModeEnabled, lodPlan.visibleEdges]);

    const pinnedSet = useMemo(() => new Set(pinnedNodeIds), [pinnedNodeIds]);
    const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

    const visibleNodesForLens = useMemo(() => {
      if (renderLens !== 'nd') {
        return lodPlan.visibleNodes;
      }

      return lodPlan.visibleNodes.filter((node) => {
        if (pinnedSet.has(node.id) || selectedSet.has(node.id) || focusNeighborhood.has(node.id)) {
          return true;
        }
        const vector = vectorById.get(node.id);
        if (!vector) {
          return true;
        }
        return passesNdSlice(vector, ndConfig);
      });
    }, [
      renderLens,
      lodPlan.visibleNodes,
      pinnedSet,
      selectedSet,
      focusNeighborhood,
      vectorById,
      ndConfig,
    ]);

    const visibleNodeIdSet = useMemo(
      () => new Set(visibleNodesForLens.map((node) => node.id)),
      [visibleNodesForLens]
    );

    const visibleEdgesForLens = useMemo(
      () =>
        (lodPlan.visibleEdges as GraphEdgeWithData[]).filter((edge) => {
          const sourceId = edgeEndpointId(edge.source as string | GraphNode);
          const targetId = edgeEndpointId(edge.target as string | GraphNode);
          return visibleNodeIdSet.has(sourceId) && visibleNodeIdSet.has(targetId);
        }),
      [lodPlan.visibleEdges, visibleNodeIdSet]
    );

    const baseProjectedPositionById = useMemo(() => {
      const positions = new Map<string, [number, number, number]>();
      const planePoints: Array<[number, number, number]> = [];

      for (const node of visibleNodesForLens) {
        const base = deterministicNodePlanePosition(node, 1600, 1200);
        let point: [number, number, number];

        if (renderLens === '2d') {
          point = [base.x, -base.y, 0];
        } else if (renderLens === '3d') {
          const vector = vectorById.get(node.id) ?? resolveNodeVector(node, ndConfig.dims);
          point = [base.x, -base.y, (vector[2] ?? 0) * 260];
        } else {
          const vector = vectorById.get(node.id) ?? resolveNodeVector(node, ndConfig.dims);
          const projected = projectNodeVector(vector, ndConfig);
          point = [projected.x, projected.y, projected.z];
        }

        planePoints.push(point);
        positions.set(node.id, point);
      }

      const center = computeCenter(planePoints);
      for (const [nodeId, point] of positions.entries()) {
        positions.set(nodeId, [point[0] - center[0], point[1] - center[1], point[2] - center[2]]);
      }

      return positions;
    }, [visibleNodesForLens, renderLens, vectorById, ndConfig]);

    const projectedPositionById = useMemo(() => {
      const merged = new Map(baseProjectedPositionById);
      for (const [nodeId, position] of dragPositionsById.entries()) {
        if (merged.has(nodeId)) {
          merged.set(nodeId, position);
        }
      }
      return merged;
    }, [baseProjectedPositionById, dragPositionsById]);

    useEffect(() => {
      const valid = new Set(visibleNodesForLens.map((node) => node.id));
      setDragPositionsById((previous) => {
        if (previous.size === 0) {
          return previous;
        }
        const next = new Map<string, [number, number, number]>();
        for (const [nodeId, position] of previous.entries()) {
          if (valid.has(nodeId)) {
            next.set(nodeId, position);
          }
        }
        return next;
      });
    }, [visibleNodesForLens]);

    const renderNodes = useMemo<RenderNode[]>(
      () =>
        visibleNodesForLens.map((node) => {
          const selected = selectedSet.has(node.id);
          const pinned = pinnedSet.has(node.id);
          return {
            node,
            position: projectedPositionById.get(node.id) ?? [0, 0, 0],
            radius: resolveNodeRadius(node.kind),
            color: resolveNodeColor(node, selected, pinned),
            isSelected: selected,
            isPinned: pinned,
          };
        }),
      [visibleNodesForLens, projectedPositionById, selectedSet, pinnedSet]
    );

    const renderEdges = useMemo<RenderEdgeReference[]>(
      () =>
        visibleEdgesForLens.map((edge) => ({
          edge,
          sourceId: edgeEndpointId(edge.source as string | GraphNode),
          targetId: edgeEndpointId(edge.target as string | GraphNode),
        })),
      [visibleEdgesForLens]
    );

    const edgePositions = useMemo(() => {
      const positions = new Float32Array(renderEdges.length * 6);
      let cursor = 0;
      for (const edge of renderEdges) {
        const source = projectedPositionById.get(edge.sourceId);
        const target = projectedPositionById.get(edge.targetId);
        if (!source || !target) {
          continue;
        }
        positions[cursor] = source[0];
        positions[cursor + 1] = source[1];
        positions[cursor + 2] = source[2];
        positions[cursor + 3] = target[0];
        positions[cursor + 4] = target[1];
        positions[cursor + 5] = target[2];
        cursor += 6;
      }

      return cursor === positions.length ? positions : positions.slice(0, cursor);
    }, [renderEdges, projectedPositionById]);

    const updateSelection = useCallback(
      (next: string[]) => {
        setSelectedNodeIds(next);
        onSelectionChange?.(next);
      },
      [onSelectionChange]
    );

    const togglePinnedNode = useCallback(
      (nodeId: string) => {
        const next = new Set(pinnedNodeIds);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        onPinnedNodeIdsChange?.(Array.from(next));
      },
      [onPinnedNodeIdsChange, pinnedNodeIds]
    );

    const onNodeClickInternal = useCallback(
      (nodeId: string, event: MouseEvent, doubleClick: boolean) => {
        const node = normalizedNodes.find((candidate) => candidate.id === nodeId);
        if (!node) {
          return;
        }

        if (event.altKey) {
          togglePinnedNode(nodeId);
          return;
        }

        let nextSelection: string[];
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          const next = new Set(selectedNodeIds);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          nextSelection = Array.from(next);
        } else {
          nextSelection = [nodeId];
        }

        updateSelection(nextSelection);

        if (doubleClick) {
          onNodeDoubleClick?.(node);
          sceneControllerRef.current?.setTargetById(node.id, 1.6);
        } else {
          onNodeClick?.(node);
        }
      },
      [
        normalizedNodes,
        onNodeClick,
        onNodeDoubleClick,
        selectedNodeIds,
        togglePinnedNode,
        updateSelection,
      ]
    );

    const onMissedClick = useCallback(() => {
      if (selectedNodeIds.length > 0) {
        updateSelection([]);
      }
      setHoveredEdgeId(null);
      onEdgeHover?.(null, { x: 0, y: 0 });
    }, [onEdgeHover, selectedNodeIds.length, updateSelection]);

    const onEdgePick = useCallback(
      (pick: GraphPickResult) => {
        if (pick.kind !== 'edge' || !pick.edgeId) {
          setHoveredEdgeId(null);
          onEdgeHover?.(null, pick.screen);
          return;
        }

        const edge = edgeById.get(pick.edgeId) || null;
        setHoveredEdgeId(edge?.id ?? null);
        onEdgeHover?.(edge, pick.screen);
      },
      [edgeById, onEdgeHover]
    );

    const onMarqueeComplete = useCallback(
      (selectedIds: string[], modifiers: MarqueeSelectionSession['modifiers']) => {
        const next = applyMarqueeSelection(selectedNodeIds, selectedIds, modifiers);
        updateSelection(next);
      },
      [selectedNodeIds, updateSelection]
    );

    const onNodeDrag = useCallback((nodeId: string, position: [number, number, number]) => {
      setDragPositionsById((previous) => {
        const next = new Map(previous);
        next.set(nodeId, position);
        return next;
      });
    }, []);

    const interactionState = useMemo<GraphInteractionState>(
      () => ({
        selectedNodeIds,
        hoveredEdgeId,
        marqueeSession,
        dragSession,
      }),
      [dragSession, hoveredEdgeId, marqueeSession, selectedNodeIds]
    );

    useEffect(() => {
      onInteractionStateChange?.(interactionState);
    }, [interactionState, onInteractionStateChange]);

    const marqueeRect = useMemo(() => {
      if (!marqueeSession) {
        return null;
      }
      const left = Math.min(marqueeSession.start.x, marqueeSession.current.x);
      const top = Math.min(marqueeSession.start.y, marqueeSession.current.y);
      const width = Math.abs(marqueeSession.current.x - marqueeSession.start.x);
      const height = Math.abs(marqueeSession.current.y - marqueeSession.start.y);
      return { left, top, width, height };
    }, [marqueeSession]);

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => sceneControllerRef.current?.zoomIn(),
        zoomOut: () => sceneControllerRef.current?.zoomOut(),
        centerView: () => sceneControllerRef.current?.centerView(),
        focusOnNode: (nodeId: string, targetScale = 1.6) =>
          sceneControllerRef.current?.setTargetById(nodeId, targetScale),
        zoomToFitNodes: (nodeIds: string[]) => sceneControllerRef.current?.zoomToFitNodes(nodeIds),
        resetView: () => sceneControllerRef.current?.centerView(),
        optimizeView: () =>
          sceneControllerRef.current?.zoomToFitNodes(Array.from(visibleNodeIdSet.values())),
      }),
      [visibleNodeIdSet]
    );

    if (webGlReady === null) {
      return <div className="w-full h-full bg-slate-950" />;
    }

    if (!webGlReady) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-200">
          <div className="max-w-md text-center px-6">
            <p className="text-sm font-semibold mb-2">WebGL renderer unavailable</p>
            <p className="text-xs text-slate-400">
              Keimenon requires Three.js/WebGL for 2D, 3D, and ND canvas rendering.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full relative" style={{ width, height }}>
        <Canvas
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          camera={{ position: [0, 0, 920], fov: 52, near: 0.1, far: 12000 }}
          onPointerMissed={onMissedClick}
        >
          <SceneRoot
            renderLens={renderLens}
            interactive={interactive}
            interactionLocked={!!dragSession || !!marqueeSession}
            edgePositions={edgePositions}
            renderNodes={renderNodes}
            renderEdges={renderEdges}
            onNodeClickInternal={onNodeClickInternal}
            onMissedClick={onMissedClick}
            onZoomSample={setZoomForLod}
            registerController={(controller) => {
              sceneControllerRef.current = controller;
            }}
            positionById={projectedPositionById}
            onEdgePick={onEdgePick}
            onMarqueeSessionChange={setMarqueeSession}
            onMarqueeComplete={onMarqueeComplete}
            onDragSessionChange={setDragSession}
            onNodeDrag={onNodeDrag}
          />
        </Canvas>

        {marqueeRect && (
          <div
            className="absolute pointer-events-none border border-sky-300/80 bg-sky-500/10 rounded-sm"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}
      </div>
    );
  }
);

SharedThreeGraphRenderer.displayName = 'SharedThreeGraphRenderer';
