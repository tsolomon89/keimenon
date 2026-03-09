/**
 * Web Worker for D3 Force Simulation
 *
 * Offloads the simulation tick() computation from the main thread to prevent
 * UI jank during layout convergence. Especially important for 5K+ node graphs
 * where each tick can take 5-10ms × ~80 ticks.
 *
 * Protocol:
 *   Main → Worker: { type: 'init', nodes, edges, config }
 *   Main → Worker: { type: 'stop' }
 *   Main → Worker: { type: 'reheat' }
 *   Main → Worker: { type: 'pin', nodeId, x, y }
 *   Main → Worker: { type: 'unpin', nodeId }
 *   Worker → Main: { type: 'tick', nodes: [{id, x, y}] }
 *   Worker → Main: { type: 'end' }
 */

// Import D3-force in the worker context
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

interface WorkerNode {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
  vx?: number;
  vy?: number;
}

interface WorkerEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
}

// Node radius function (duplicated here to avoid cross-module import issues in worker)
function getNodeRadius(kind: string): number {
  const radii: Record<string, number> = {
    ChatThread: 20,
    Source: 15,
    SourceDoc: 12,
    Group: 18,
    Folder: 18,
    ObjectiveClaim: 14,
    Constellation: 22,
    Principal: 16,
    ConversationThread: 14,
    Topic: 14,
    VerifiedSource: 14,
    VerifiedClaim: 12,
    CodeBlock: 12,
    UserNode: 14,
    Lexeme: 6,
    Phrase: 8,
  };
  return radii[kind] || 10;
}

let simulation: ReturnType<typeof forceSimulation> | null = null;
let nodes: WorkerNode[] = [];

self.onmessage = (e: MessageEvent) => {
  const { type } = e.data;

  switch (type) {
    case 'init': {
      const { nodes: inputNodes, edges: inputEdges, config } = e.data;
      const { width, height, strength = -300, distance = 100 } = config;

      // Stop previous simulation
      if (simulation) simulation.stop();

      nodes = inputNodes.map((n: WorkerNode) => ({ ...n }));
      const edges = inputEdges.map((e: WorkerEdge) => ({ ...e }));

      simulation = forceSimulation(nodes as any)
        .force(
          'link',
          forceLink(edges as any)
            .id((d: any) => d.id)
            .distance(distance)
        )
        .force('charge', forceManyBody().strength(strength))
        .force('center', forceCenter(width / 2, height / 2))
        .force(
          'collide',
          forceCollide().radius((d: any) => getNodeRadius(d.kind))
        )
        .alphaDecay(0.05)
        .velocityDecay(0.6);

      // Send position updates back to main thread on each tick
      simulation.on('tick', () => {
        const positions = nodes.map((n) => ({
          id: n.id,
          x: n.x ?? 0,
          y: n.y ?? 0,
        }));
        (self as any).postMessage({ type: 'tick', nodes: positions });
      });

      simulation.on('end', () => {
        (self as any).postMessage({ type: 'end' });
      });

      break;
    }

    case 'stop': {
      if (simulation) simulation.stop();
      break;
    }

    case 'reheat': {
      if (simulation) {
        simulation.alpha(0.3).restart();
      }
      break;
    }

    case 'pin': {
      const { nodeId, x, y } = e.data;
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
      if (simulation) {
        simulation.alphaTarget(0.3).restart();
      }
      break;
    }

    case 'unpin': {
      const { nodeId: unpinId } = e.data;
      const unpinNode = nodes.find((n) => n.id === unpinId);
      if (unpinNode) {
        unpinNode.fx = null;
        unpinNode.fy = null;
      }
      if (simulation) {
        simulation.alphaTarget(0);
      }
      break;
    }
  }
};
