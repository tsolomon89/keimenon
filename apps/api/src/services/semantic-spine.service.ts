import { createHash } from 'crypto';

type BoundaryKind = 'line' | 'sentence' | 'paragraph' | 'token_window';

export interface SemanticSpineSourceInput {
  id: string;
  content?: string;
  conversationId?: string;
  messageId?: string;
  messageIds?: string[];
  timestamp?: number;
}

export interface SemanticSpineSpanInput {
  id: string;
  sourceId: string;
  messageId?: string;
  conversationId?: string;
  text: string;
  normalizedText?: string;
  startChar?: number;
  endChar?: number;
  boundaryKind?: BoundaryKind;
}

export interface SemanticSpineBuildConfig {
  enabled?: boolean;
  extractLexemes?: boolean;
  extractPhrases?: boolean;
  clusterTopics?: boolean;
  minPhraseFrequency?: number;
  minPhrasesPerTopic?: number;
}

export interface SemanticSpineWriteAdapter {
  writeNode(node: Record<string, unknown>): Promise<void>;
  writeEdge(edge: Record<string, unknown>): Promise<void>;
}

export interface SemanticSpineBuildInput {
  accountId: string;
  userId: string;
  sources: SemanticSpineSourceInput[];
  spans: SemanticSpineSpanInput[];
  config?: SemanticSpineBuildConfig;
  write: SemanticSpineWriteAdapter;
  now?: number;
}

export interface SemanticSpineBuildStats {
  lexemes: number;
  phrases: number;
  topics: number;
  mentionEdges: number;
  coOccurrenceEdges: number;
  topicEdges: number;
  aboutEdges: number;
}

interface TokenRef {
  raw: string;
  canonical: string;
  start: number;
  end: number;
}

interface PhraseCandidate {
  text: string;
  normalizedText: string;
  type: 'n-gram' | 'entity' | 'concept';
  start: number;
  end: number;
  score: number;
}

interface PhraseOccurrence {
  sourceId: string;
  spanId: string;
  text: string;
  startChar: number;
  endChar: number;
}

interface PhraseAggregate {
  id: string;
  text: string;
  normalizedText: string;
  type: 'n-gram' | 'entity' | 'concept';
  frequency: number;
  sourceIds: Set<string>;
  spanIds: Set<string>;
  occurrences: PhraseOccurrence[];
}

interface TopicCluster {
  id: string;
  name: string;
  description: string;
  phrases: PhraseAggregate[];
  keywords: string[];
  strength: number;
}

const DEFAULT_SPINE_CONFIG: Required<SemanticSpineBuildConfig> = {
  enabled: true,
  extractLexemes: true,
  extractPhrases: true,
  clusterTopics: true,
  minPhraseFrequency: 1,
  minPhrasesPerTopic: 2,
};

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'may',
  'might',
  'more',
  'must',
  'not',
  'of',
  'on',
  'or',
  'our',
  'should',
  'so',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'this',
  'those',
  'through',
  'to',
  'use',
  'used',
  'using',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

const LOW_VALUE_TERMS = new Set([
  'thing',
  'things',
  'something',
  'anything',
  'everything',
  'example',
  'examples',
  'question',
  'questions',
  'answer',
  'answers',
  'response',
  'responses',
  'message',
  'messages',
  'conversation',
  'conversations',
  'chat',
  'chats',
  'user',
  'assistant',
]);

export class SemanticSpineService {
  async buildForSources(input: SemanticSpineBuildInput): Promise<SemanticSpineBuildStats> {
    const config = { ...DEFAULT_SPINE_CONFIG, ...(input.config || {}) };
    if (!config.enabled) {
      return this.emptyStats();
    }

    const now = input.now ?? Date.now();
    const sourceById = new Map(input.sources.map((source) => [source.id, source]));
    const spans = this.normalizeSpans(input.sources, input.spans);
    const phrases = config.extractPhrases
      ? this.extractPhraseAggregates(input.accountId, spans, config.minPhraseFrequency)
      : [];

    const stats = this.emptyStats();

    if (config.extractPhrases) {
      for (const phrase of phrases) {
        await input.write.writeNode({
          id: phrase.id,
          kind: 'Phrase',
          text: phrase.text,
          normalized_text: phrase.normalizedText,
          type: phrase.type,
          frequency: phrase.frequency,
          created_at: now,
          updated_at: now,
          metadata: {
            graph_scope: 'knowledge',
            visible_by_default: true,
            processing_role: 'semantic_spine',
            source_count: phrase.sourceIds.size,
            span_count: phrase.spanIds.size,
            extraction: 'deterministic_phrase_ngram_v1',
          },
        });
        stats.phrases += 1;
      }

      stats.mentionEdges += await this.writeMentionEdges(input, phrases, sourceById, now);
      stats.coOccurrenceEdges += await this.writeCoOccurrenceEdges(input, phrases, spans, now);
    }

    if (config.extractLexemes) {
      stats.lexemes += await this.writeLexemes(input, phrases, now);
    }

    if (config.clusterTopics && phrases.length >= config.minPhrasesPerTopic) {
      const clusters = this.clusterTopics(input.accountId, phrases, config.minPhrasesPerTopic);
      for (const cluster of clusters) {
        await input.write.writeNode({
          id: cluster.id,
          kind: 'Topic',
          name: cluster.name,
          description: cluster.description,
          keywords: cluster.keywords,
          strength: cluster.strength,
          topic_status: 'suggested',
          created_at: now,
          updated_at: now,
          metadata: {
            graph_scope: 'knowledge_suggestion',
            visible_by_default: false,
            traversal_eligible: false,
            processing_role: 'semantic_spine',
            phrase_count: cluster.phrases.length,
            phrase_ids: cluster.phrases.map((phrase) => phrase.id).sort(),
            normalized_phrases: cluster.phrases
              .map((phrase) => phrase.normalizedText)
              .sort((a, b) => a.localeCompare(b)),
            extraction: 'cooccurrence_topic_cluster_v1',
          },
        });
        stats.topics += 1;
      }

      stats.topicEdges += await this.writeTopicEdges(input, clusters, now);
      stats.aboutEdges += await this.writeAboutEdges(input, clusters, phrases, now);
    }

    return stats;
  }

  splitIntoSpans(
    source: SemanticSpineSourceInput
  ): Array<Omit<SemanticSpineSpanInput, 'sourceId'> & { sourceId: string }> {
    const content = source.content || '';
    const spans: Array<Omit<SemanticSpineSpanInput, 'sourceId'> & { sourceId: string }> = [];
    const regex = /[^\n.!?]+(?:[.!?]+)?|\n+/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const raw = match[0];
      if (/^\n+$/.test(raw)) {
        continue;
      }

      const firstNonWhitespace = raw.search(/\S/);
      if (firstNonWhitespace === -1) {
        continue;
      }

      const text = raw.trim();
      if (text.length === 0) {
        continue;
      }

      const start = match.index + firstNonWhitespace;
      const end = start + text.length;
      const spanId = `span_${this.hash(`${source.id}:${start}:${end}:${this.normalizeText(text)}`, 32)}`;
      spans.push({
        id: spanId,
        sourceId: source.id,
        messageId: source.messageId,
        conversationId: source.conversationId,
        text,
        normalizedText: this.normalizeText(text),
        startChar: start,
        endChar: end,
        boundaryKind: raw.includes('\n') ? 'line' : 'sentence',
      });
    }

    if (spans.length === 0 && content.trim().length > 0) {
      const text = content.trim();
      const start = content.indexOf(text);
      const end = start + text.length;
      spans.push({
        id: `span_${this.hash(`${source.id}:${start}:${end}:${this.normalizeText(text)}`, 32)}`,
        sourceId: source.id,
        messageId: source.messageId,
        conversationId: source.conversationId,
        text,
        normalizedText: this.normalizeText(text),
        startChar: Math.max(0, start),
        endChar: Math.max(0, end),
        boundaryKind: 'paragraph',
      });
    }

    return spans;
  }

  canonicalizePhraseText(value: string): string {
    return this.tokenize(value)
      .map((token) => token.canonical)
      .filter((token) => token.length > 0)
      .join(' ')
      .trim();
  }

  private emptyStats(): SemanticSpineBuildStats {
    return {
      lexemes: 0,
      phrases: 0,
      topics: 0,
      mentionEdges: 0,
      coOccurrenceEdges: 0,
      topicEdges: 0,
      aboutEdges: 0,
    };
  }

  private normalizeSpans(
    sources: SemanticSpineSourceInput[],
    spans: SemanticSpineSpanInput[]
  ): SemanticSpineSpanInput[] {
    const normalized: SemanticSpineSpanInput[] = [];
    const sourceIdsWithSpans = new Set<string>();

    for (const span of spans) {
      const text = String(span.text || '').trim();
      if (!text) {
        continue;
      }
      sourceIdsWithSpans.add(span.sourceId);
      normalized.push({
        ...span,
        text,
        normalizedText: span.normalizedText || this.normalizeText(text),
        startChar: span.startChar ?? 0,
        endChar: span.endChar ?? text.length,
        boundaryKind: span.boundaryKind || 'sentence',
      });
    }

    for (const source of sources) {
      if (sourceIdsWithSpans.has(source.id) || !source.content) {
        continue;
      }
      normalized.push(...this.splitIntoSpans(source));
    }

    return normalized.sort(
      (a, b) =>
        a.sourceId.localeCompare(b.sourceId) ||
        (a.startChar ?? 0) - (b.startChar ?? 0) ||
        a.id.localeCompare(b.id)
    );
  }

  private extractPhraseAggregates(
    accountId: string,
    spans: SemanticSpineSpanInput[],
    minPhraseFrequency: number
  ): PhraseAggregate[] {
    const phraseMap = new Map<string, PhraseAggregate>();

    for (const span of spans) {
      const candidates = this.extractPhraseCandidates(span.text);
      const byPhraseInSpan = new Map<string, PhraseCandidate[]>();

      for (const candidate of candidates) {
        const entries = byPhraseInSpan.get(candidate.normalizedText) || [];
        entries.push(candidate);
        byPhraseInSpan.set(candidate.normalizedText, entries);
      }

      for (const [normalizedText, entries] of byPhraseInSpan.entries()) {
        const best = [...entries].sort(
          (a, b) =>
            b.score - a.score ||
            b.text.length - a.text.length ||
            a.normalizedText.localeCompare(b.normalizedText)
        )[0];
        const aggregate =
          phraseMap.get(normalizedText) ||
          (() => {
            const id = `phrase_${this.hash(`${accountId}:phrase:${normalizedText}`, 32)}`;
            const next: PhraseAggregate = {
              id,
              text: this.displayPhrase(best.text),
              normalizedText,
              type: best.type,
              frequency: 0,
              sourceIds: new Set<string>(),
              spanIds: new Set<string>(),
              occurrences: [],
            };
            phraseMap.set(normalizedText, next);
            return next;
          })();

        aggregate.frequency += entries.length;
        aggregate.sourceIds.add(span.sourceId);
        aggregate.spanIds.add(span.id);
        for (const entry of entries) {
          aggregate.occurrences.push({
            sourceId: span.sourceId,
            spanId: span.id,
            text: entry.text,
            startChar: (span.startChar ?? 0) + entry.start,
            endChar: (span.startChar ?? 0) + entry.end,
          });
        }
      }
    }

    return Array.from(phraseMap.values())
      .filter((phrase) => phrase.frequency >= minPhraseFrequency)
      .sort(
        (a, b) =>
          b.sourceIds.size - a.sourceIds.size ||
          b.frequency - a.frequency ||
          a.normalizedText.localeCompare(b.normalizedText)
      )
      .slice(0, 1200);
  }

  private extractPhraseCandidates(text: string): PhraseCandidate[] {
    const tokens = this.tokenize(text);
    const candidates = new Map<string, PhraseCandidate>();

    for (let n = 2; n <= Math.min(4, tokens.length); n += 1) {
      for (let i = 0; i <= tokens.length - n; i += 1) {
        const window = tokens.slice(i, i + n);
        const candidate = this.candidateFromTokens(window);
        if (!candidate) {
          continue;
        }
        const existing = candidates.get(candidate.normalizedText);
        if (
          !existing ||
          candidate.score > existing.score ||
          (candidate.score === existing.score && candidate.text.length > existing.text.length)
        ) {
          candidates.set(candidate.normalizedText, candidate);
        }
      }
    }

    return Array.from(candidates.values())
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.text.length - a.text.length ||
          a.normalizedText.localeCompare(b.normalizedText)
      )
      .slice(0, 18);
  }

  private candidateFromTokens(tokens: TokenRef[]): PhraseCandidate | null {
    const canonicalTokens = tokens.map((token) => token.canonical);
    const signalTokens = canonicalTokens.filter((token) => this.isSignalToken(token));
    if (signalTokens.length < 2) {
      return null;
    }
    if (canonicalTokens.some((token) => LOW_VALUE_TERMS.has(token))) {
      return null;
    }

    const normalizedText = canonicalTokens.join(' ');
    if (normalizedText.length < 7 || normalizedText.length > 96) {
      return null;
    }
    if (/^\d+(?:\s+\d+)+$/.test(normalizedText)) {
      return null;
    }

    const text = tokens.map((token) => token.raw).join(' ');
    const uniqueSignals = new Set(signalTokens).size;
    const score =
      uniqueSignals * 4 +
      signalTokens.length * 2 +
      Math.min(6, normalizedText.length / 12) +
      (tokens.length >= 3 ? 1.5 : 0);

    return {
      text,
      normalizedText,
      type: uniqueSignals >= 2 ? 'concept' : 'n-gram',
      start: tokens[0].start,
      end: tokens[tokens.length - 1].end,
      score,
    };
  }

  private async writeMentionEdges(
    input: SemanticSpineBuildInput,
    phrases: PhraseAggregate[],
    sourceById: Map<string, SemanticSpineSourceInput>,
    now: number
  ): Promise<number> {
    let count = 0;

    for (const phrase of phrases) {
      const bySpan = new Map<string, PhraseOccurrence[]>();
      const bySource = new Map<string, PhraseOccurrence[]>();

      for (const occurrence of phrase.occurrences) {
        const spanOccurrences = bySpan.get(occurrence.spanId) || [];
        spanOccurrences.push(occurrence);
        bySpan.set(occurrence.spanId, spanOccurrences);

        const sourceOccurrences = bySource.get(occurrence.sourceId) || [];
        sourceOccurrences.push(occurrence);
        bySource.set(occurrence.sourceId, sourceOccurrences);
      }

      for (const [spanId, occurrences] of bySpan.entries()) {
        const sourceId = occurrences[0]?.sourceId;
        const edgeId = `edge_mentions_span_${this.hash(`${input.accountId}:${spanId}:${phrase.id}`, 32)}`;
        await input.write.writeEdge({
          id: edgeId,
          kind: 'MENTIONS',
          from: spanId,
          to: phrase.id,
          count: occurrences.length,
          confidence: 0.86,
          created_at: now,
          metadata: {
            relation: 'span_mentions_phrase',
            explanation: `Source span contains the normalized phrase "${phrase.normalizedText}".`,
            phrase_text: phrase.text,
            normalized_text: phrase.normalizedText,
            source_id: sourceId,
            source_span_id: spanId,
            positions: occurrences.map((occurrence) => ({
              start_char: occurrence.startChar,
              end_char: occurrence.endChar,
            })),
          },
        });
        count += 1;
      }

      for (const [sourceId, occurrences] of bySource.entries()) {
        const source = sourceById.get(sourceId);
        const edgeId = `edge_mentions_source_${this.hash(`${input.accountId}:${sourceId}:${phrase.id}`, 32)}`;
        await input.write.writeEdge({
          id: edgeId,
          kind: 'MENTIONS',
          from: sourceId,
          to: phrase.id,
          count: occurrences.length,
          confidence: 0.82,
          created_at: now,
          metadata: {
            relation: 'source_mentions_phrase',
            explanation: `Source mentions "${phrase.text}" in ${new Set(occurrences.map((item) => item.spanId)).size} span(s).`,
            phrase_text: phrase.text,
            normalized_text: phrase.normalizedText,
            source_id: sourceId,
            conversation_id: source?.conversationId,
            source_span_ids: Array.from(new Set(occurrences.map((item) => item.spanId))).sort(),
            positions: occurrences.map((occurrence) => ({
              span_id: occurrence.spanId,
              start_char: occurrence.startChar,
              end_char: occurrence.endChar,
            })),
          },
        });
        count += 1;
      }
    }

    return count;
  }

  private async writeCoOccurrenceEdges(
    input: SemanticSpineBuildInput,
    phrases: PhraseAggregate[],
    spans: SemanticSpineSpanInput[],
    now: number
  ): Promise<number> {
    const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));
    const phraseIdsBySpan = new Map<string, Set<string>>();
    const phraseSourceCounts = new Map<string, number>();

    for (const phrase of phrases) {
      phraseSourceCounts.set(phrase.id, phrase.sourceIds.size);
      for (const spanId of phrase.spanIds) {
        const ids = phraseIdsBySpan.get(spanId) || new Set<string>();
        ids.add(phrase.id);
        phraseIdsBySpan.set(spanId, ids);
      }
    }

    const pairMap = new Map<
      string,
      { a: string; b: string; spanIds: Set<string>; sourceIds: Set<string>; count: number }
    >();
    const spanById = new Map(spans.map((span) => [span.id, span]));

    for (const [spanId, phraseIds] of phraseIdsBySpan.entries()) {
      const ids = Array.from(phraseIds).sort();
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = ids[i];
          const b = ids[j];
          const key = `${a}|${b}`;
          const entry =
            pairMap.get(key) ||
            (() => {
              const next = {
                a,
                b,
                spanIds: new Set<string>(),
                sourceIds: new Set<string>(),
                count: 0,
              };
              pairMap.set(key, next);
              return next;
            })();
          entry.count += 1;
          entry.spanIds.add(spanId);
          const span = spanById.get(spanId);
          if (span) {
            entry.sourceIds.add(span.sourceId);
          }
        }
      }
    }

    let count = 0;
    const totalSources = Math.max(1, input.sources.length);
    const sortedPairs = Array.from(pairMap.values()).sort(
      (a, b) =>
        b.count - a.count ||
        phraseById.get(a.a)!.normalizedText.localeCompare(phraseById.get(b.a)!.normalizedText) ||
        phraseById.get(a.b)!.normalizedText.localeCompare(phraseById.get(b.b)!.normalizedText)
    );

    for (const pair of sortedPairs.slice(0, 2000)) {
      const left = phraseById.get(pair.a);
      const right = phraseById.get(pair.b);
      if (!left || !right) {
        continue;
      }

      const pmi = Number(
        Math.log(
          (pair.sourceIds.size * totalSources) /
            Math.max(
              1,
              (phraseSourceCounts.get(pair.a) || 1) * (phraseSourceCounts.get(pair.b) || 1)
            )
        ).toFixed(6)
      );
      const weight = Math.min(1, 0.35 + pair.count / 6);
      const edgeId = `edge_cooccurs_${this.hash(`${input.accountId}:${pair.a}:${pair.b}`, 32)}`;

      await input.write.writeEdge({
        id: edgeId,
        kind: 'CO_OCCURS_WITH',
        from: pair.a,
        to: pair.b,
        count: pair.count,
        pmi,
        weight,
        confidence: Math.min(1, 0.6 + pair.sourceIds.size / Math.max(2, totalSources)),
        created_at: now,
        metadata: {
          relation: 'phrase_span_cooccurrence',
          explanation: `"${left.text}" and "${right.text}" occur in shared source spans.`,
          source_ids: Array.from(pair.sourceIds).sort(),
          source_span_ids: Array.from(pair.spanIds).sort(),
        },
      });
      count += 1;
    }

    return count;
  }

  private async writeLexemes(
    input: SemanticSpineBuildInput,
    phrases: PhraseAggregate[],
    now: number
  ): Promise<number> {
    const lexemeCounts = new Map<string, { count: number; phraseIds: Set<string> }>();
    for (const phrase of phrases) {
      for (const token of phrase.normalizedText.split(/\s+/)) {
        if (!this.isSignalToken(token)) {
          continue;
        }
        const entry = lexemeCounts.get(token) || { count: 0, phraseIds: new Set<string>() };
        entry.count += phrase.frequency;
        entry.phraseIds.add(phrase.id);
        lexemeCounts.set(token, entry);
      }
    }

    let count = 0;
    for (const [lemma, entry] of Array.from(lexemeCounts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      const lexemeId = `lexeme_${this.hash(`${input.accountId}:lexeme:${lemma}:other`, 32)}`;
      await input.write.writeNode({
        id: lexemeId,
        kind: 'Lexeme',
        lemma,
        pos: 'other',
        frequency: entry.count,
        created_at: now,
        updated_at: now,
        metadata: {
          graph_scope: 'knowledge',
          visible_by_default: false,
          processing_role: 'semantic_spine_connector',
          phrase_ids: Array.from(entry.phraseIds).sort(),
          extraction: 'phrase_token_lexeme_v1',
        },
      });
      count += 1;
    }
    return count;
  }

  private clusterTopics(
    accountId: string,
    phrases: PhraseAggregate[],
    minPhrasesPerTopic: number
  ): TopicCluster[] {
    const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));
    const adjacency = new Map<string, Set<string>>();
    for (const phrase of phrases) {
      adjacency.set(phrase.id, new Set<string>());
    }

    for (let i = 0; i < phrases.length; i += 1) {
      for (let j = i + 1; j < phrases.length; j += 1) {
        const left = phrases[i];
        const right = phrases[j];
        if (this.phrasesBelongTogether(left, right)) {
          adjacency.get(left.id)!.add(right.id);
          adjacency.get(right.id)!.add(left.id);
        }
      }
    }

    const visited = new Set<string>();
    const clusters: TopicCluster[] = [];

    for (const phrase of phrases) {
      if (visited.has(phrase.id)) {
        continue;
      }

      const stack = [phrase.id];
      const ids: string[] = [];
      visited.add(phrase.id);

      while (stack.length > 0) {
        const current = stack.pop()!;
        ids.push(current);
        for (const neighbor of adjacency.get(current) || []) {
          if (visited.has(neighbor)) {
            continue;
          }
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }

      const clusterPhrases = ids
        .map((id) => phraseById.get(id))
        .filter((item): item is PhraseAggregate => Boolean(item))
        .sort(
          (a, b) =>
            b.sourceIds.size - a.sourceIds.size ||
            b.frequency - a.frequency ||
            a.normalizedText.localeCompare(b.normalizedText)
        );

      if (clusterPhrases.length < minPhrasesPerTopic) {
        continue;
      }

      const topicKey = this.topicKey(clusterPhrases);
      const topicId = `topic_${this.hash(`${accountId}:topic:${topicKey}`, 32)}`;
      const keywords = clusterPhrases.slice(0, 8).map((item) => item.text);
      const strength = Number(
        Math.min(
          1,
          0.45 +
            clusterPhrases.length / 18 +
            new Set(clusterPhrases.flatMap((item) => Array.from(item.sourceIds))).size /
              Math.max(6, clusterPhrases.length * 2)
        ).toFixed(6)
      );

      clusters.push({
        id: topicId,
        name: `Topic: ${this.displayPhrase(clusterPhrases[0].text)}`,
        description: `Semantic cluster linking ${keywords.slice(0, 4).join(', ')}`,
        phrases: clusterPhrases,
        keywords,
        strength,
      });
    }

    return clusters
      .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
      .slice(0, 200);
  }

  private async writeTopicEdges(
    input: SemanticSpineBuildInput,
    clusters: TopicCluster[],
    now: number
  ): Promise<number> {
    let count = 0;
    for (const cluster of clusters) {
      const totalFrequency = Math.max(
        1,
        cluster.phrases.reduce((sum, phrase) => sum + phrase.frequency, 0)
      );
      for (const phrase of cluster.phrases) {
        const weight = Number((phrase.frequency / totalFrequency).toFixed(6));
        const edgeId = `edge_belongs_${this.hash(`${input.accountId}:${phrase.id}:${cluster.id}`, 32)}`;
        await input.write.writeEdge({
          id: edgeId,
          kind: 'BELONGS_TO_TOPIC',
          from: phrase.id,
          to: cluster.id,
          weight,
          confidence: 0.78,
          created_at: now,
          metadata: {
            relation: 'phrase_topic_membership',
            explanation: `"${phrase.text}" belongs to "${cluster.name}" by shared co-occurrence/token structure.`,
            phrase_text: phrase.text,
            topic_name: cluster.name,
          },
        });
        count += 1;
      }
    }
    return count;
  }

  private async writeAboutEdges(
    input: SemanticSpineBuildInput,
    clusters: TopicCluster[],
    phrases: PhraseAggregate[],
    now: number
  ): Promise<number> {
    const phraseById = new Map(phrases.map((phrase) => [phrase.id, phrase]));
    let count = 0;

    for (const source of input.sources) {
      const sourcePhraseIds = new Set<string>();
      let totalMentions = 0;
      for (const phrase of phrases) {
        const sourceOccurrences = phrase.occurrences.filter(
          (occurrence) => occurrence.sourceId === source.id
        );
        if (sourceOccurrences.length > 0) {
          sourcePhraseIds.add(phrase.id);
          totalMentions += sourceOccurrences.length;
        }
      }

      if (sourcePhraseIds.size === 0) {
        continue;
      }

      for (const cluster of clusters) {
        const topicPhraseIds = cluster.phrases.map((phrase) => phrase.id);
        const matchedPhraseIds = topicPhraseIds.filter((id) => sourcePhraseIds.has(id));
        if (matchedPhraseIds.length === 0) {
          continue;
        }

        const matchedMentions = matchedPhraseIds.reduce((sum, phraseId) => {
          const phrase = phraseById.get(phraseId);
          return (
            sum +
            (phrase?.occurrences.filter((occurrence) => occurrence.sourceId === source.id).length ||
              0)
          );
        }, 0);
        const relevance = Number((matchedMentions / Math.max(1, totalMentions)).toFixed(6));
        const edgeId = `edge_about_${this.hash(`${input.accountId}:${source.id}:${cluster.id}`, 32)}`;

        await input.write.writeEdge({
          id: edgeId,
          kind: 'ABOUT',
          from: source.id,
          to: cluster.id,
          relevance,
          weight: relevance,
          confidence: Math.min(1, 0.65 + relevance / 2),
          created_at: now,
          metadata: {
            relation: 'source_about_topic',
            explanation: `Source is about "${cluster.name}" because it mentions ${matchedPhraseIds.length} topic phrase(s).`,
            topic_name: cluster.name,
            phrase_ids: matchedPhraseIds.sort(),
            phrase_texts: matchedPhraseIds
              .map((id) => phraseById.get(id)?.text)
              .filter((value): value is string => Boolean(value))
              .sort((a, b) => a.localeCompare(b)),
          },
        });
        count += 1;
      }
    }

    return count;
  }

  private phrasesBelongTogether(left: PhraseAggregate, right: PhraseAggregate): boolean {
    const sharedSources = this.intersectionSize(left.sourceIds, right.sourceIds);
    if (sharedSources > 0) {
      return true;
    }

    const leftTokens = new Set(
      left.normalizedText.split(/\s+/).filter((token) => this.isSignalToken(token))
    );
    const rightTokens = new Set(
      right.normalizedText.split(/\s+/).filter((token) => this.isSignalToken(token))
    );
    const sharedTokens = this.intersectionSize(leftTokens, rightTokens);
    if (sharedTokens === 0) {
      return false;
    }
    const unionSize = new Set([...leftTokens, ...rightTokens]).size;
    return sharedTokens / Math.max(1, unionSize) >= 0.25;
  }

  private topicKey(phrases: PhraseAggregate[]): string {
    const tokenCounts = new Map<string, number>();
    for (const phrase of phrases) {
      for (const token of phrase.normalizedText.split(/\s+/)) {
        if (!this.isSignalToken(token)) {
          continue;
        }
        tokenCounts.set(token, (tokenCounts.get(token) || 0) + phrase.frequency);
      }
    }
    return Array.from(tokenCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([token]) => token)
      .join(' ');
  }

  private tokenize(text: string): TokenRef[] {
    const tokens: TokenRef[] = [];
    const regex = /[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const raw = match[0].replace(/^[_-]+|[_-]+$/g, '');
      const canonical = this.canonicalizeToken(raw);
      if (!canonical) {
        continue;
      }
      tokens.push({
        raw,
        canonical,
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return tokens;
  }

  private canonicalizeToken(value: string): string | null {
    const normalized = value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/['’]s$/u, '')
      .replace(/[^a-z0-9_]+/g, '')
      .trim();

    if (!normalized || normalized.length < 2 || STOPWORDS.has(normalized)) {
      return null;
    }

    if (normalized.endsWith('ies') && normalized.length > 5) {
      return `${normalized.slice(0, -3)}y`;
    }
    if (normalized.endsWith('sses')) {
      return normalized.slice(0, -2);
    }
    if (normalized.endsWith('s') && !normalized.endsWith('ss') && normalized.length > 4) {
      return normalized.slice(0, -1);
    }

    return normalized;
  }

  private isSignalToken(token: string): boolean {
    return token.length >= 4 && !STOPWORDS.has(token) && !LOW_VALUE_TERMS.has(token);
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private displayPhrase(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private intersectionSize(left: Set<string>, right: Set<string>): number {
    let count = 0;
    for (const value of left) {
      if (right.has(value)) {
        count += 1;
      }
    }
    return count;
  }

  private hash(value: string, length: number): string {
    return createHash('sha256').update(value).digest('hex').slice(0, length);
  }
}
