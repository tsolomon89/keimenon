import { createHash } from 'crypto';

export interface SimilarityEngineDocument {
  id: string;
  text: string;
  conversationId?: string;
  role?: 'user' | 'assistant' | 'system' | string;
  timestamp?: number;
}

export interface SimilarityEngineInput {
  documents: SimilarityEngineDocument[];
  thresholds?: {
    strong?: number;
    medium?: number;
    weak?: number;
  };
  minEdgeScore?: number;
  maxEdgesPerNode?: number;
  runtime?: {
    disableSemanticStage?: boolean;
  };
}

export interface SimilarityEdgeV2 {
  sourceId: string;
  targetId: string;
  lexical: number;
  structural: number;
  semantic: number;
  flow: number;
  total: number;
  strength: 'strong' | 'medium' | 'weak';
}

export interface SimilarityClusterV2 {
  id: string;
  memberIds: string[];
  mass: number;
}

export interface SimilarityEngineResult {
  edges: SimilarityEdgeV2[];
  clusters: SimilarityClusterV2[];
  massByNode: Record<string, number>;
}

interface PreparedDocument {
  id: string;
  text: string;
  conversationId?: string;
  role?: string;
  timestamp?: number;
  tokens: string[];
  tokenFreq: Map<string, number>;
  ngramFreq: Map<string, number>;
  embedding: number[];
  structural: {
    lineCount: number;
    avgLineLength: number;
    codeFenceCount: number;
    punctuationRatio: number;
    digitRatio: number;
    uppercaseRatio: number;
    hasBullets: number;
    hasJsonLike: number;
  };
}

interface EdgeCandidate extends SimilarityEdgeV2 {}

type EdgeWeights = {
  lexical: number;
  structural: number;
  semantic: number;
  flow: number;
};

const EMBEDDING_DIMENSIONS = 64;
const EDGE_WEIGHTS: EdgeWeights = {
  lexical: 0.35,
  structural: 0.2,
  semantic: 0.35,
  flow: 0.1,
};
const DEFAULT_STRONG = 0.72;
const DEFAULT_MEDIUM = 0.54;
const DEFAULT_WEAK = 0.38;
const DEFAULT_MAX_EDGES_PER_NODE = 40;

export class SimilarityEngineV2 {
  analyze(input: SimilarityEngineInput): SimilarityEngineResult {
    const docs = [...(input.documents || [])]
      .filter((doc) => typeof doc.id === 'string' && typeof doc.text === 'string')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((doc) => this.prepareDocument(doc));

    if (docs.length === 0) {
      return { edges: [], clusters: [], massByNode: {} };
    }

    const corpusTokenFreq = this.buildCorpusTokenFrequency(docs);
    const corpusNgramFreq = this.buildCorpusNgramFrequency(docs);

    const weakThreshold = input.thresholds?.weak ?? DEFAULT_WEAK;
    const mediumThreshold = Math.max(input.thresholds?.medium ?? DEFAULT_MEDIUM, weakThreshold);
    const strongThreshold = Math.max(input.thresholds?.strong ?? DEFAULT_STRONG, mediumThreshold);
    const minEdgeScore = Math.max(input.minEdgeScore ?? weakThreshold, 0);
    const activeWeights = this.resolveActiveWeights(input.runtime?.disableSemanticStage === true);

    const edgeCandidates: EdgeCandidate[] = [];

    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const source = docs[i];
        const target = docs[j];
        const lexical = this.computeLexicalSimilarity(source, target, corpusNgramFreq);
        const structural = this.computeStructuralSimilarity(source, target);
        const semantic =
          activeWeights.semantic > 0
            ? this.computeSemanticSimilarity(source.embedding, target.embedding)
            : 0;
        const flow = this.computeFlowSimilarity(source, target);

        const total = this.round6(
          lexical * activeWeights.lexical +
            structural * activeWeights.structural +
            semantic * activeWeights.semantic +
            flow * activeWeights.flow
        );

        if (total < minEdgeScore) {
          continue;
        }

        edgeCandidates.push({
          sourceId: source.id,
          targetId: target.id,
          lexical: this.round6(lexical),
          structural: this.round6(structural),
          semantic: this.round6(semantic),
          flow: this.round6(flow),
          total,
          strength:
            total >= strongThreshold ? 'strong' : total >= mediumThreshold ? 'medium' : 'weak',
        });
      }
    }

    const edges = this.pruneEdges(
      edgeCandidates,
      docs,
      input.maxEdgesPerNode ?? DEFAULT_MAX_EDGES_PER_NODE
    );
    const massByNode = this.computeMassByNode(docs, edges, corpusTokenFreq);
    const clusters = this.computeClusters(docs, edges, mediumThreshold, massByNode);

    return { edges, clusters, massByNode };
  }

  private resolveActiveWeights(semanticDisabled: boolean): EdgeWeights {
    if (!semanticDisabled) {
      return EDGE_WEIGHTS;
    }

    const remainingWeight = EDGE_WEIGHTS.lexical + EDGE_WEIGHTS.structural + EDGE_WEIGHTS.flow;
    const normalized = remainingWeight > 0 ? 1 / remainingWeight : 1;

    return {
      lexical: this.round6(EDGE_WEIGHTS.lexical * normalized),
      structural: this.round6(EDGE_WEIGHTS.structural * normalized),
      semantic: 0,
      flow: this.round6(EDGE_WEIGHTS.flow * normalized),
    };
  }

  private prepareDocument(doc: SimilarityEngineDocument): PreparedDocument {
    const normalizedText = this.normalizeText(doc.text);
    const tokens = this.tokenize(normalizedText);
    const tokenFreq = this.frequencyMap(tokens);
    const ngramFreq = this.extractNgramFrequency(tokens, 1, 3);
    const embedding = this.buildDeterministicEmbedding(tokenFreq);

    const lines = normalizedText.split('\n').filter((line) => line.trim().length > 0);
    const charCount = normalizedText.length || 1;
    const punctuationCount = (normalizedText.match(/[.,!?;:()[\]{}"']/g) || []).length;
    const digitCount = (normalizedText.match(/[0-9]/g) || []).length;
    const uppercaseCount = (doc.text.match(/[A-Z]/g) || []).length;
    const codeFenceCount = (doc.text.match(/```/g) || []).length / 2;

    const avgLineLength =
      lines.length > 0
        ? lines.reduce((sum, line) => sum + line.length, 0) / lines.length
        : normalizedText.length;

    return {
      id: doc.id,
      text: doc.text,
      conversationId: doc.conversationId,
      role: doc.role,
      timestamp: doc.timestamp,
      tokens,
      tokenFreq,
      ngramFreq,
      embedding,
      structural: {
        lineCount: lines.length || 1,
        avgLineLength,
        codeFenceCount,
        punctuationRatio: punctuationCount / charCount,
        digitRatio: digitCount / charCount,
        uppercaseRatio: uppercaseCount / Math.max(doc.text.length, 1),
        hasBullets: /(^|\n)\s*[-*]\s+/m.test(doc.text) ? 1 : 0,
        hasJsonLike: /[{\[]\s*\".+\":/.test(doc.text) ? 1 : 0,
      },
    };
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private tokenize(text: string): string[] {
    if (!text) {
      return [];
    }
    return text
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }

  private frequencyMap(values: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const value of values) {
      freq.set(value, (freq.get(value) || 0) + 1);
    }
    return freq;
  }

  private extractNgramFrequency(
    tokens: string[],
    minSize: number,
    maxSize: number
  ): Map<string, number> {
    const freq = new Map<string, number>();
    if (tokens.length === 0) {
      return freq;
    }

    for (let size = minSize; size <= maxSize; size++) {
      if (tokens.length < size) {
        continue;
      }
      for (let i = 0; i <= tokens.length - size; i++) {
        const ngram = tokens.slice(i, i + size).join(' ');
        freq.set(ngram, (freq.get(ngram) || 0) + 1);
      }
    }
    return freq;
  }

  private buildDeterministicEmbedding(tokenFreq: Map<string, number>): number[] {
    const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
    for (const [token, count] of tokenFreq.entries()) {
      const hash = createHash('sha256').update(token).digest('hex');
      const bucket = parseInt(hash.slice(0, 8), 16) % EMBEDDING_DIMENSIONS;
      const sign = parseInt(hash.slice(8, 10), 16) % 2 === 0 ? 1 : -1;
      const weight = 1 + Math.log1p(count);
      vector[bucket] += sign * weight;
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map((value) => value / norm);
  }

  private buildCorpusTokenFrequency(docs: PreparedDocument[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const doc of docs) {
      for (const token of new Set(doc.tokens)) {
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }
    return freq;
  }

  private buildCorpusNgramFrequency(docs: PreparedDocument[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const doc of docs) {
      for (const ngram of new Set(doc.ngramFreq.keys())) {
        freq.set(ngram, (freq.get(ngram) || 0) + 1);
      }
    }
    return freq;
  }

  private computeLexicalSimilarity(
    a: PreparedDocument,
    b: PreparedDocument,
    corpusNgramFreq: Map<string, number>
  ): number {
    const keys = new Set<string>([...a.ngramFreq.keys(), ...b.ngramFreq.keys()]);
    if (keys.size === 0) {
      return 0;
    }

    let numerator = 0;
    let denominator = 0;
    for (const key of keys) {
      const aValue = a.ngramFreq.get(key) || 0;
      const bValue = b.ngramFreq.get(key) || 0;
      const corpusWeight = 1 + Math.log1p(corpusNgramFreq.get(key) || 1);
      numerator += Math.min(aValue, bValue) * corpusWeight;
      denominator += Math.max(aValue, bValue) * corpusWeight;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private computeStructuralSimilarity(a: PreparedDocument, b: PreparedDocument): number {
    const fields: Array<keyof PreparedDocument['structural']> = [
      'lineCount',
      'avgLineLength',
      'codeFenceCount',
      'punctuationRatio',
      'digitRatio',
      'uppercaseRatio',
      'hasBullets',
      'hasJsonLike',
    ];

    let score = 0;
    for (const field of fields) {
      const aValue = a.structural[field];
      const bValue = b.structural[field];
      const max = Math.max(Math.abs(aValue), Math.abs(bValue), 1e-9);
      score += 1 - Math.min(1, Math.abs(aValue - bValue) / max);
    }

    score /= fields.length;

    if (a.role && b.role && a.role === b.role) {
      score += 0.05;
    }
    if (a.conversationId && b.conversationId && a.conversationId === b.conversationId) {
      score += 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  private computeSemanticSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length || vectorA.length === 0) {
      return 0;
    }

    let dot = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dot += vectorA[i] * vectorB[i];
    }
    return Math.max(0, Math.min(1, (dot + 1) / 2));
  }

  private computeFlowSimilarity(a: PreparedDocument, b: PreparedDocument): number {
    const sameConversation =
      a.conversationId && b.conversationId ? (a.conversationId === b.conversationId ? 1 : 0) : 0;

    const roleTransition =
      a.role && b.role
        ? a.role !== b.role && sameConversation
          ? 1
          : a.role === b.role
            ? 0.6
            : 0.2
        : 0.4;

    let timeCoherence = 0.3;
    if (typeof a.timestamp === 'number' && typeof b.timestamp === 'number') {
      const delta = Math.abs(a.timestamp - b.timestamp);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      timeCoherence = Math.exp(-delta / sevenDaysMs);
    }

    return Math.max(
      0,
      Math.min(1, sameConversation * 0.45 + roleTransition * 0.2 + timeCoherence * 0.35)
    );
  }

  private pruneEdges(
    edges: EdgeCandidate[],
    docs: PreparedDocument[],
    maxEdgesPerNode: number
  ): SimilarityEdgeV2[] {
    if (edges.length === 0) {
      return [];
    }

    const caps = new Map<string, Set<string>>();
    for (const doc of docs) {
      caps.set(doc.id, new Set<string>());
    }

    const sortedEdges = [...edges].sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }
      if (a.sourceId !== b.sourceId) {
        return a.sourceId.localeCompare(b.sourceId);
      }
      return a.targetId.localeCompare(b.targetId);
    });

    const selected = new Set<string>();
    for (const edge of sortedEdges) {
      const a = caps.get(edge.sourceId)!;
      const b = caps.get(edge.targetId)!;
      if (a.size >= maxEdgesPerNode && b.size >= maxEdgesPerNode) {
        continue;
      }

      const key = `${edge.sourceId}|${edge.targetId}`;
      if (selected.has(key)) {
        continue;
      }

      selected.add(key);
      if (a.size < maxEdgesPerNode) {
        a.add(edge.targetId);
      }
      if (b.size < maxEdgesPerNode) {
        b.add(edge.sourceId);
      }
    }

    return sortedEdges.filter((edge) => selected.has(`${edge.sourceId}|${edge.targetId}`));
  }

  private computeMassByNode(
    docs: PreparedDocument[],
    edges: SimilarityEdgeV2[],
    corpusTokenFreq: Map<string, number>
  ): Record<string, number> {
    const edgeCentrality = new Map<string, number>();
    for (const doc of docs) {
      edgeCentrality.set(doc.id, 0);
    }
    for (const edge of edges) {
      edgeCentrality.set(edge.sourceId, (edgeCentrality.get(edge.sourceId) || 0) + edge.total);
      edgeCentrality.set(edge.targetId, (edgeCentrality.get(edge.targetId) || 0) + edge.total);
    }

    const tokenMass = docs.map((doc) =>
      Array.from(doc.tokenFreq.entries()).reduce((sum, [token, count]) => {
        const recurrence = corpusTokenFreq.get(token) || 1;
        return sum + count * Math.log1p(recurrence);
      }, 0)
    );
    const lexicalMass = docs.map((doc) =>
      Array.from(doc.ngramFreq.entries()).reduce((sum, [, count]) => sum + Math.log1p(count), 0)
    );
    const centralityMass = docs.map((doc) => edgeCentrality.get(doc.id) || 0);

    const tokenNorm = this.minMaxNormalize(tokenMass);
    const lexicalNorm = this.minMaxNormalize(lexicalMass);
    const centralityNorm = this.minMaxNormalize(centralityMass);

    const massByNode: Record<string, number> = {};
    docs.forEach((doc, index) => {
      const mass =
        tokenNorm[index] * 0.45 + lexicalNorm[index] * 0.25 + centralityNorm[index] * 0.3;
      massByNode[doc.id] = this.round6(0.15 + mass * 0.85);
    });
    return massByNode;
  }

  private computeClusters(
    docs: PreparedDocument[],
    edges: SimilarityEdgeV2[],
    minClusterEdgeWeight: number,
    massByNode: Record<string, number>
  ): SimilarityClusterV2[] {
    const adjacency = new Map<string, string[]>();
    for (const doc of docs) {
      adjacency.set(doc.id, []);
    }

    const eligibleEdges = edges.filter((edge) => edge.total >= minClusterEdgeWeight);
    for (const edge of eligibleEdges) {
      adjacency.get(edge.sourceId)!.push(edge.targetId);
      adjacency.get(edge.targetId)!.push(edge.sourceId);
    }
    for (const neighbors of adjacency.values()) {
      neighbors.sort((a, b) => a.localeCompare(b));
    }

    const visited = new Set<string>();
    const clusters: SimilarityClusterV2[] = [];

    for (const doc of docs) {
      if (visited.has(doc.id)) {
        continue;
      }

      const stack = [doc.id];
      const members: string[] = [];
      visited.add(doc.id);

      while (stack.length > 0) {
        const current = stack.pop()!;
        members.push(current);
        for (const neighbor of adjacency.get(current) || []) {
          if (visited.has(neighbor)) {
            continue;
          }
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }

      members.sort((a, b) => a.localeCompare(b));
      const idSource = members.join('|');
      const clusterId = `cluster_${createHash('sha256').update(idSource).digest('hex').slice(0, 16)}`;
      const clusterMass =
        members.reduce((sum, nodeId) => sum + (massByNode[nodeId] || 0), 0) / members.length;

      clusters.push({
        id: clusterId,
        memberIds: members,
        mass: this.round6(clusterMass),
      });
    }

    clusters.sort((a, b) => {
      if (b.mass !== a.mass) {
        return b.mass - a.mass;
      }
      return a.id.localeCompare(b.id);
    });
    return clusters;
  }

  private minMaxNormalize(values: number[]): number[] {
    if (values.length === 0) {
      return [];
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return values.map(() => 0.5);
    }
    return values.map((value) => (value - min) / (max - min));
  }

  private round6(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
  }
}
