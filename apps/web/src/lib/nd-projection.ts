import type { GraphNode } from '@keimenon/graph';

export type RenderLens = '2d' | '3d' | 'nd';

export interface NdProjectionConfig {
  dims: number;
  axes: [number, number, number];
  sliceDim: number;
  sliceCenter: number;
  sliceWidth: number;
}

export const DEFAULT_ND_CONFIG: NdProjectionConfig = {
  dims: 8,
  axes: [0, 1, 2],
  sliceDim: 3,
  sliceCenter: 0,
  sliceWidth: 0.35,
};

function fnv1aHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnitValue(seed: string): number {
  const hash = fnv1aHash(seed);
  return hash / 0xffffffff;
}

function deterministicSignedValue(seed: string): number {
  return deterministicUnitValue(seed) * 2 - 1;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude <= 0) {
    return values;
  }
  return values.map((value) => value / magnitude);
}

function extractEmbedding(node: GraphNode): number[] | null {
  const withMetadata = node as GraphNode & {
    embedding?: unknown;
    vector?: unknown;
    metadata?: Record<string, unknown>;
  };

  const candidates: unknown[] = [
    withMetadata.embedding,
    withMetadata.vector,
    withMetadata.metadata?.embedding,
    withMetadata.metadata?.vector,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const numeric = candidate.filter(isFiniteNumber);
    if (numeric.length > 0) {
      return numeric;
    }
  }

  return null;
}

function extractNumericSignals(node: GraphNode): number[] {
  const withMetadata = node as GraphNode & {
    mass?: unknown;
    strength?: unknown;
    frequency?: unknown;
    importance?: unknown;
    metadata?: Record<string, unknown>;
    created_at?: unknown;
    updated_at?: unknown;
  };

  const values: unknown[] = [
    withMetadata.mass,
    withMetadata.strength,
    withMetadata.frequency,
    withMetadata.importance,
    withMetadata.created_at,
    withMetadata.updated_at,
    withMetadata.metadata?.mass,
    withMetadata.metadata?.strength,
    withMetadata.metadata?.frequency,
    withMetadata.metadata?.importance,
    withMetadata.metadata?.confidence,
    withMetadata.metadata?.similarity,
  ];

  return values.filter(isFiniteNumber);
}

function safeAxisIndex(index: number, dims: number): number {
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.max(0, Math.min(dims - 1, Math.floor(index)));
}

export function resolveNodeVector(node: GraphNode, dims: number): number[] {
  const safeDims = Math.max(3, Math.floor(dims));

  const embedding = extractEmbedding(node);
  if (embedding && embedding.length >= safeDims) {
    return normalizeVector(embedding.slice(0, safeDims));
  }

  const vector: number[] = [];
  const numericSignals = extractNumericSignals(node);

  for (let index = 0; index < numericSignals.length && vector.length < safeDims; index += 1) {
    vector.push(Number(numericSignals[index]));
  }

  while (vector.length < safeDims) {
    const dimIndex = vector.length;
    const seed = `${node.id}:${dimIndex}:${node.kind}`;
    vector.push(deterministicSignedValue(seed));
  }

  return normalizeVector(vector.slice(0, safeDims));
}

export function projectNodeVector(
  vector: number[],
  config: NdProjectionConfig
): { x: number; y: number; z: number } {
  const dims = Math.max(3, Math.floor(config.dims));
  const xAxis = safeAxisIndex(config.axes[0], dims);
  const yAxis = safeAxisIndex(config.axes[1], dims);
  const zAxis = safeAxisIndex(config.axes[2], dims);
  const scale = 320;

  return {
    x: (vector[xAxis] ?? 0) * scale,
    y: (vector[yAxis] ?? 0) * scale,
    z: (vector[zAxis] ?? 0) * scale,
  };
}

export function passesNdSlice(vector: number[], config: NdProjectionConfig): boolean {
  const dims = Math.max(3, Math.floor(config.dims));
  const sliceIndex = safeAxisIndex(config.sliceDim, dims);
  const sliceValue = vector[sliceIndex] ?? 0;
  const halfWidth = Math.max(0.0001, config.sliceWidth / 2);
  return Math.abs(sliceValue - config.sliceCenter) <= halfWidth;
}

export function deterministicNodePlanePosition(
  node: GraphNode,
  fallbackWidth = 1200,
  fallbackHeight = 900
): { x: number; y: number } {
  if (isFiniteNumber(node.x) && isFiniteNumber(node.y)) {
    return { x: node.x, y: node.y };
  }

  const xSeed = deterministicUnitValue(`${node.id}:x:${node.kind}`);
  const ySeed = deterministicUnitValue(`${node.id}:y:${node.kind}`);
  const x = xSeed * fallbackWidth;
  const y = ySeed * fallbackHeight;
  return { x, y };
}

