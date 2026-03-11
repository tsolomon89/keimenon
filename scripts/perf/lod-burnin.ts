import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import { buildLodPlan } from '../../apps/web/src/lib/graph-lod';

type BurnInTarget = {
  name: '10k' | '50k';
  nodeCount: number;
  edgeCount: number;
  zoom: number;
  optimizeLevel: number;
  maxAvgMs: number;
  maxP95Ms: number;
};

type BurnInArgs = {
  iterations: number;
  output: string;
  strict: boolean;
  quick: boolean;
};

type TargetRunResult = {
  name: BurnInTarget['name'];
  iterations: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  maxVisibleNodes: number;
  maxVisibleEdges: number;
  failedGateIterations: number;
  pass: boolean;
  thresholds: {
    maxAvgMs: number;
    maxP95Ms: number;
  };
};

function parseArgs(): BurnInArgs {
  const args = process.argv.slice(2);
  const parsed: BurnInArgs = {
    iterations: 8,
    output: 'test-results/perf/lod-burnin-latest.json',
    strict: false,
    quick: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--iterations' && args[index + 1]) {
      parsed.iterations = Math.max(1, Number.parseInt(args[index + 1], 10) || parsed.iterations);
      index += 1;
      continue;
    }
    if (token === '--output' && args[index + 1]) {
      parsed.output = args[index + 1];
      index += 1;
      continue;
    }
    if (token === '--strict') {
      parsed.strict = true;
      continue;
    }
    if (token === '--quick') {
      parsed.quick = true;
      continue;
    }
  }

  if (parsed.quick) {
    parsed.iterations = Math.min(parsed.iterations, 3);
  }

  return parsed;
}

function createNode(index: number, kind: string, mass: number): GraphNode {
  return {
    id: `node_${index}`,
    kind,
    x: index % 300,
    y: Math.floor(index / 300),
    mass,
  } as GraphNode;
}

function createEdge(index: number, source: string, target: string, strength: number): GraphEdge {
  return {
    id: `edge_${index}`,
    kind: 'SIMILAR_TO',
    source,
    target,
    data: { strength },
  } as GraphEdge;
}

function buildSyntheticGraph(
  nodeCount: number,
  edgeCount: number
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const kinds = [
    'Group',
    'Source',
    'ObjectiveClaim',
    'Topic',
    'Phrase',
    'Lexeme',
    'ConversationThread',
    'Principal',
  ];

  const nodes: GraphNode[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const kind = kinds[index % kinds.length];
    const mass = ((index % 100) + 1) / 100;
    nodes.push(createNode(index, kind, mass));
  }

  const edges: GraphEdge[] = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const source = `node_${index % nodeCount}`;
    const target = `node_${(index * 7 + 13) % nodeCount}`;
    const strength = ((index % 100) + 1) / 100;
    edges.push(createEdge(index, source, target, strength));
  }

  return { nodes, edges };
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0];
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[position];
}

function roundTo(value: number, digits: number = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function runTarget(target: BurnInTarget, iterations: number): Promise<TargetRunResult> {
  const graph = buildSyntheticGraph(target.nodeCount, target.edgeCount);
  const durations: number[] = [];
  let failedGateIterations = 0;
  let maxVisibleNodes = 0;
  let maxVisibleEdges = 0;

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const plan = buildLodPlan({
      nodes: graph.nodes,
      edges: graph.edges,
      zoom: target.zoom,
      optimizeLevel: target.optimizeLevel,
    });
    const durationMs = performance.now() - startedAt;
    durations.push(durationMs);

    maxVisibleNodes = Math.max(maxVisibleNodes, plan.stats.visibleNodeCount);
    maxVisibleEdges = Math.max(maxVisibleEdges, plan.stats.visibleEdgeCount);
    if (!plan.stats.gate.pass) {
      failedGateIterations += 1;
    }
  }

  const sum = durations.reduce((acc, value) => acc + value, 0);
  const avgMs = sum / durations.length;
  const p95Ms = percentile(durations, 0.95);
  const minMs = Math.min(...durations);
  const maxMs = Math.max(...durations);
  const pass = failedGateIterations === 0 && avgMs <= target.maxAvgMs && p95Ms <= target.maxP95Ms;

  return {
    name: target.name,
    iterations,
    avgMs: roundTo(avgMs),
    p95Ms: roundTo(p95Ms),
    minMs: roundTo(minMs),
    maxMs: roundTo(maxMs),
    maxVisibleNodes,
    maxVisibleEdges,
    failedGateIterations,
    pass,
    thresholds: {
      maxAvgMs: target.maxAvgMs,
      maxP95Ms: target.maxP95Ms,
    },
  };
}

function resolveTargets(strict: boolean): BurnInTarget[] {
  const baseTargets: BurnInTarget[] = [
    {
      name: '10k',
      nodeCount: 10_000,
      edgeCount: 20_000,
      zoom: 0.1,
      optimizeLevel: 0,
      maxAvgMs: 2200,
      maxP95Ms: 3600,
    },
    {
      name: '50k',
      nodeCount: 50_000,
      edgeCount: 100_000,
      zoom: 0.1,
      optimizeLevel: 1,
      maxAvgMs: 4400,
      maxP95Ms: 7000,
    },
  ];

  if (!strict) {
    return baseTargets;
  }

  return baseTargets.map((target) => ({
    ...target,
    maxAvgMs: Math.max(1, Math.floor(target.maxAvgMs * 0.9)),
    maxP95Ms: Math.max(1, Math.floor(target.maxP95Ms * 0.9)),
  }));
}

async function writeReport(outputPath: string, payload: Record<string, unknown>): Promise<void> {
  const absoluteOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const targets = resolveTargets(args.strict);
  const startedAt = Date.now();

  console.log('[lod-burnin] Starting LOD performance burn-in');
  console.log(
    `[lod-burnin] iterations=${args.iterations} strict=${args.strict} quick=${args.quick}`
  );

  const targetResults: TargetRunResult[] = [];
  for (const target of targets) {
    console.log(
      `[lod-burnin] running target=${target.name} nodes=${target.nodeCount} edges=${target.edgeCount}`
    );
    const result = await runTarget(target, args.iterations);
    targetResults.push(result);
    console.log(
      `[lod-burnin] ${target.name} avg=${result.avgMs}ms p95=${result.p95Ms}ms gateFailures=${result.failedGateIterations}`
    );
  }

  const pass = targetResults.every((result) => result.pass);
  const payload = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    config: {
      iterations: args.iterations,
      strict: args.strict,
      quick: args.quick,
    },
    results: targetResults,
    pass,
  };

  await writeReport(args.output, payload);
  console.log(`[lod-burnin] wrote report to ${path.resolve(args.output)}`);

  if (!pass) {
    console.error('[lod-burnin] FAILED performance gate');
    process.exit(1);
  }

  console.log('[lod-burnin] PASS');
}

main().catch((error) => {
  console.error(`[lod-burnin] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
