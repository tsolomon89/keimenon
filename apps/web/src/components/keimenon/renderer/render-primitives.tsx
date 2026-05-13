'use client';

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { GraphNode } from '@keimenon/graph';
import type { ThreeEvent } from '@react-three/fiber';

export interface RenderNodePrimitive {
  node: GraphNode;
  position: [number, number, number];
  radius: number;
  color: string;
  isSelected: boolean;
}

interface EdgeSegmentsProps {
  edgePositions: Float32Array;
}

interface NodeSpheresProps {
  renderNodes: RenderNodePrimitive[];
  onNodeClick: (nodeId: string, event: MouseEvent, doubleClick: boolean) => void;
  onNodePointerDown: (nodeId: string, event: PointerEvent) => void;
}

export function EdgeSegments({ edgePositions }: EdgeSegmentsProps) {
  if (edgePositions.length === 0) {
    return null;
  }

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[edgePositions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#64748b" transparent opacity={0.35} />
    </lineSegments>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InstancedMesh rendering — one draw call per radius group (≤8 groups total)
// ─────────────────────────────────────────────────────────────────────────────

/** Shared material constants matching the original mesh-per-node appearance. */
const MATERIAL_METALNESS = 0.12;
const MATERIAL_ROUGHNESS = 0.5;
const SPHERE_SEGMENTS = 16;

// Pre-allocated temporaries to avoid per-frame allocation
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

/**
 * Compute a composite color that bakes emissive boost into the base color.
 *
 * Original material used separate `emissive` + `emissiveIntensity`.
 * InstancedMesh shares one material, so we composite the emissive contribution
 * into the per-instance vertex color.
 *
 * selected → emissive '#cbd5e1' @ 0.45 intensity
 * default  → emissive '#111827' @ 0.15 intensity
 */
function computeCompositeColor(hex: string, isSelected: boolean): THREE.Color {
  const base = _color.set(hex);

  if (isSelected) {
    // Blend emissive into base: base + emissive * intensity
    const emissive = new THREE.Color('#cbd5e1');
    base.r = Math.min(1, base.r + emissive.r * 0.45);
    base.g = Math.min(1, base.g + emissive.g * 0.45);
    base.b = Math.min(1, base.b + emissive.b * 0.45);
  } else {
    const emissive = new THREE.Color('#111827');
    base.r = Math.min(1, base.r + emissive.r * 0.15);
    base.g = Math.min(1, base.g + emissive.g * 0.15);
    base.b = Math.min(1, base.b + emissive.b * 0.15);
  }

  return base.clone();
}

/**
 * Render one InstancedMesh for a group of nodes sharing the same radius.
 * Handles per-instance transforms + colors + interaction routing.
 */
function RadiusGroup({
  radius,
  nodes,
  onNodeClick,
  onNodePointerDown,
}: {
  radius: number;
  nodes: RenderNodePrimitive[];
  onNodeClick: NodeSpheresProps['onNodeClick'];
  onNodePointerDown: NodeSpheresProps['onNodePointerDown'];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = nodes.length;

  // instanceId → nodeId lookup
  const instanceToNodeId = useMemo(() => {
    const map = new Map<number, string>();
    nodes.forEach((n, i) => map.set(i, n.node.id));
    return map;
  }, [nodes]);

  // Update instance transforms + colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      _matrix.makeTranslation(node.position[0], node.position[1], node.position[2]);
      mesh.setMatrixAt(i, _matrix);
      mesh.setColorAt(i, computeCompositeColor(node.color, node.isSelected));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [nodes, count]);

  // Event handlers — resolve instanceId → nodeId
  const resolveNodeId = useCallback(
    (event: ThreeEvent<any>): string | null => {
      const instanceId = event.instanceId;
      if (instanceId == null) return null;
      return instanceToNodeId.get(instanceId) ?? null;
    },
    [instanceToNodeId]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const nodeId = resolveNodeId(event);
      if (nodeId) {
        event.stopPropagation();
        onNodeClick(nodeId, event.nativeEvent, false);
      }
    },
    [resolveNodeId, onNodeClick]
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const nodeId = resolveNodeId(event);
      if (nodeId) {
        event.stopPropagation();
        onNodeClick(nodeId, event.nativeEvent, true);
      }
    },
    [resolveNodeId, onNodeClick]
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const nodeId = resolveNodeId(event);
      if (nodeId) {
        event.stopPropagation();
        onNodePointerDown(nodeId, event.nativeEvent);
      }
    },
    [resolveNodeId, onNodePointerDown]
  );

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
    >
      <sphereGeometry args={[radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS]} />
      <meshStandardMaterial
        vertexColors
        metalness={MATERIAL_METALNESS}
        roughness={MATERIAL_ROUGHNESS}
      />
    </instancedMesh>
  );
}

/**
 * InstancedMesh-based node renderer.
 *
 * Groups render nodes by radius (≤8 distinct values from resolveNodeRadius).
 * Each radius group is one InstancedMesh = one draw call.
 * Total draw calls: ≤8 regardless of node count (vs. N with the old mesh-per-node).
 *
 * Maintains the same external API as the original NodeSpheres for drop-in replacement.
 */
export function InstancedNodeSpheres({
  renderNodes,
  onNodeClick,
  onNodePointerDown,
}: NodeSpheresProps) {
  // Group nodes by radius — this creates ≤8 groups based on resolveNodeRadius output
  const radiusGroups = useMemo(() => {
    const groups = new Map<number, RenderNodePrimitive[]>();
    for (const node of renderNodes) {
      const existing = groups.get(node.radius);
      if (existing) {
        existing.push(node);
      } else {
        groups.set(node.radius, [node]);
      }
    }
    return groups;
  }, [renderNodes]);

  return (
    <>
      {Array.from(radiusGroups.entries()).map(([radius, nodes]) => (
        <RadiusGroup
          key={radius}
          radius={radius}
          nodes={nodes}
          onNodeClick={onNodeClick}
          onNodePointerDown={onNodePointerDown}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward compatibility: keep NodeSpheres as a re-export alias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use InstancedNodeSpheres for better performance.
 * Kept for backward compatibility during migration.
 */
export const NodeSpheres = InstancedNodeSpheres;
