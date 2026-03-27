'use client';

import React from 'react';
import type { GraphNode } from '@keimenon/graph';

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

export function NodeSpheres({ renderNodes, onNodeClick, onNodePointerDown }: NodeSpheresProps) {
  return (
    <>
      {renderNodes.map((renderNode) => (
        <mesh
          key={renderNode.node.id}
          position={renderNode.position}
          onPointerDown={(event) =>
            onNodePointerDown(renderNode.node.id, event.nativeEvent as PointerEvent)
          }
          onClick={(event) => onNodeClick(renderNode.node.id, event.nativeEvent as MouseEvent, false)}
          onDoubleClick={(event) =>
            onNodeClick(renderNode.node.id, event.nativeEvent as MouseEvent, true)
          }
        >
          <sphereGeometry args={[renderNode.radius, 16, 16]} />
          <meshStandardMaterial
            color={renderNode.color}
            emissive={renderNode.isSelected ? '#cbd5e1' : '#111827'}
            emissiveIntensity={renderNode.isSelected ? 0.45 : 0.15}
            metalness={0.12}
            roughness={0.5}
          />
        </mesh>
      ))}
    </>
  );
}

