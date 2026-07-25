'use client';

import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { GraphNode } from '@keimenon/graph';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';

export interface RenderNodePrimitive {
  node: GraphNode;
  position: [number, number, number];
  radius: number;
  color: string;
  isSelected: boolean;
  isHovered: boolean;
  isGhosted: boolean;
}

interface EdgeSegmentsProps {
  edgePositions: Float32Array;
}

interface NodeSpheresProps {
  renderNodes: RenderNodePrimitive[];
  onNodeClick: (nodeId: string, event: MouseEvent, doubleClick: boolean) => void;
  onNodePointerDown: (nodeId: string, event: PointerEvent) => void;
  onNodeHover?: (nodeId: string | null) => void;
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
const _vector = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _emissiveSelected = new THREE.Color('#cbd5e1');
const _emissiveDefault = new THREE.Color('#111827');

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
function computeCompositeColor(
  hex: string,
  isSelected: boolean,
  targetColor: THREE.Color
): THREE.Color {
  targetColor.set(hex);

  if (isSelected) {
    // Blend emissive into base: base + emissive * intensity
    targetColor.r = Math.min(1, targetColor.r + _emissiveSelected.r * 0.45);
    targetColor.g = Math.min(1, targetColor.g + _emissiveSelected.g * 0.45);
    targetColor.b = Math.min(1, targetColor.b + _emissiveSelected.b * 0.45);
  } else {
    targetColor.r = Math.min(1, targetColor.r + _emissiveDefault.r * 0.15);
    targetColor.g = Math.min(1, targetColor.g + _emissiveDefault.g * 0.15);
    targetColor.b = Math.min(1, targetColor.b + _emissiveDefault.b * 0.15);
  }

  return targetColor;
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
  onNodeHover,
}: {
  radius: number;
  nodes: RenderNodePrimitive[];
  onNodeClick: NodeSpheresProps['onNodeClick'];
  onNodePointerDown: NodeSpheresProps['onNodePointerDown'];
  onNodeHover?: NodeSpheresProps['onNodeHover'];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const opacityAttrRef = useRef<any>(null);
  const count = nodes.length;

  // Track map of instanceId -> nodeId dynamically in a ref to support click resolution on culled instances
  const instanceToNodeIdRef = useRef<Map<number, string>>(new Map());

  // Pre-allocated array for opacity attribute
  const opacityArray = useMemo(() => new Float32Array(count), [count]);

  // Hook standard material compilation to support per-instance opacity
  const handleBeforeCompile = useCallback((shader: any) => {
    shader.vertexShader = `
      attribute float instanceOpacity;
      varying float vInstanceOpacity;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vInstanceOpacity = instanceOpacity;
      `
    );
    shader.fragmentShader = `
      varying float vInstanceOpacity;
      ${shader.fragmentShader}
    `.replace(
      '#include <opaque_fragment>',
      `
      #include <opaque_fragment>
      gl_FragColor.a *= vInstanceOpacity;
      `
    );
  }, []);

  // Frame loop doing CPU-side active frustum culling, dynamic scaling, color composite updates, and mapping persistence
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    // Set frustumCulled = false to prevent Three.js from culling entire InstancedMesh incorrectly
    mesh.frustumCulled = false;

    // 1. Set up frustum using pre-allocated matrix & frustum
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    // Clear event resolution mapping ref to avoid memory leak and stale mappings
    instanceToNodeIdRef.current.clear();

    let visibleCount = 0;

    // 2. Filter nodes within view frustum and set instance properties in a single pass
    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      _vector.set(node.position[0], node.position[1], node.position[2]);
      _sphere.set(_vector, radius * 1.5);

      if (_frustum.intersectsSphere(_sphere)) {
        // Matrix scaling: selected/hovered nodes are 1.25x scale, ghosted are 0.6x, standard are 1.0x
        let scale = 1.0;
        if (node.isSelected || node.isHovered) {
          scale = 1.25;
        } else if (node.isGhosted) {
          scale = 0.6;
        }

        _matrix.makeTranslation(node.position[0], node.position[1], node.position[2]);
        _vector.set(scale, scale, scale); // reusing _vector for scale
        _matrix.scale(_vector);
        mesh.setMatrixAt(visibleCount, _matrix);

        // Color assignment: baking dynamic emissive boost inside color calculations in-place
        computeCompositeColor(node.color, node.isSelected || node.isHovered, _color);
        mesh.setColorAt(visibleCount, _color);

        // Holographic ghosting transparency assignment directly in-place inside instanced attribute array
        if (opacityAttrRef.current) {
          opacityAttrRef.current.array[visibleCount] = node.isGhosted ? 0.22 : 1.0;
        }

        // Map instance ID to Node ID for event raycasting resolution
        instanceToNodeIdRef.current.set(visibleCount, node.node.id);

        visibleCount++;
      }
    }

    mesh.count = visibleCount;

    if (visibleCount > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }

      // Update opacity buffer attribute
      if (opacityAttrRef.current) {
        opacityAttrRef.current.needsUpdate = true;
      }
    }
  });

  // Event handlers — resolve instanceId → nodeId
  const resolveNodeId = useCallback((event: ThreeEvent<any>): string | null => {
    const instanceId = event.instanceId;
    if (instanceId == null) return null;
    return instanceToNodeIdRef.current.get(instanceId) ?? null;
  }, []);

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

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const nodeId = resolveNodeId(event);
      if (nodeId && onNodeHover) {
        event.stopPropagation();
        onNodeHover(nodeId);
      }
    },
    [resolveNodeId, onNodeHover]
  );

  const handlePointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (onNodeHover) {
        onNodeHover(null);
      }
    },
    [onNodeHover]
  );

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS]}>
        <instancedBufferAttribute
          ref={opacityAttrRef}
          attach="attributes-instanceOpacity"
          args={[opacityArray, 1]}
        />
      </sphereGeometry>
      <meshStandardMaterial
        vertexColors
        transparent
        metalness={MATERIAL_METALNESS}
        roughness={MATERIAL_ROUGHNESS}
        onBeforeCompile={handleBeforeCompile}
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
  onNodeHover,
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
          onNodeHover={onNodeHover}
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
