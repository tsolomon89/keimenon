'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { SharedThreeGraphRenderer } from '@/components/keimenon/SharedThreeGraphRenderer';
import type { GraphNode, GraphEdge } from '@keimenon/graph';
import { DEFAULT_ND_CONFIG } from '@/lib/nd-projection';

// Generate synthetic data
function generateSyntheticData(nodeCount: number, edgeCount: number) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Account
  nodes.push({ id: 'account_1', kind: 'AccountNode', mass: 10 } as unknown as GraphNode);

  // Principals
  for (let i = 0; i < 5; i++) {
    nodes.push({ id: `principal_${i}`, kind: 'Principal', mass: 5 } as unknown as GraphNode);
    edges.push({
      id: `edge_p_${i}`,
      kind: 'OWNED_BY',
      source: `principal_${i}`,
      target: 'account_1',
    } as unknown as GraphEdge);
  }

  // Groups
  for (let i = 0; i < 50; i++) {
    nodes.push({ id: `group_${i}`, kind: 'Group', mass: 3 } as unknown as GraphNode);
    edges.push({
      id: `edge_g_${i}`,
      kind: 'OWNED_BY',
      source: `group_${i}`,
      target: `principal_${i % 5}`,
    } as unknown as GraphEdge);
  }

  // Sources
  for (let i = 0; i < nodeCount - 56; i++) {
    const kind = i % 10 === 0 ? 'Topic' : 'Source';
    nodes.push({ id: `node_${i}`, kind, mass: 1 } as unknown as GraphNode);

    // Connect to a group
    edges.push({
      id: `edge_n_${i}`,
      kind: 'IN_GROUP',
      source: `node_${i}`,
      target: `group_${i % 50}`,
    } as unknown as GraphEdge);
  }

  // Extra random edges
  for (let i = 0; i < edgeCount - nodes.length; i++) {
    const src = `node_${Math.floor(Math.random() * (nodeCount - 56))}`;
    const tgt = `node_${Math.floor(Math.random() * (nodeCount - 56))}`;
    edges.push({
      id: `edge_rand_${i}`,
      kind: 'SIMILAR_TO',
      source: src,
      target: tgt,
      data: { strength: 0.5 },
    } as unknown as GraphEdge);
  }

  return { nodes, edges };
}

export default function GraphBenchmarkPage() {
  const { nodes, edges } = useMemo(() => generateSyntheticData(10000, 20000), []);
  const [lens, setLens] = useState<'2d' | '3d' | 'nd'>('3d');

  const [dimensions, setDimensions] = useState({ width: 1024, height: 768 });
  useEffect(() => {
    const updateDims = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight - 64 });
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  return (
    <div className="w-full h-screen bg-slate-950 flex flex-col">
      <div className="h-16 p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Graph Rendering Benchmark</h1>
          <p className="text-sm text-slate-400">
            {nodes.length.toLocaleString()} Nodes, {edges.length.toLocaleString()} Edges
          </p>
        </div>
        <div className="flex gap-2">
          {(['2d', '3d', 'nd'] as const).map((l) => (
            <button
              key={l}
              className={`px-4 py-2 rounded text-sm font-semibold uppercase ${lens === l ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              onClick={() => setLens(l)}
            >
              {l} Lens
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <SharedThreeGraphRenderer
          nodes={nodes}
          edges={edges as any}
          width={dimensions.width}
          height={dimensions.height}
          renderLens={lens}
          ndConfig={DEFAULT_ND_CONFIG}
          interactive={true}
          accountId="benchmark_account"
          showBenchmark={true}
        />
      </div>
    </div>
  );
}
