/**
 * Inverted Index Service
 *
 * Local BM25-ranked search over SourceSpan nodes.
 * The index is derived from SourceSpans and is rebuildable.
 * Source of truth: Raw source → SourceDoc/Message → SourceSpan.
 * This index is a derived, disposable artifact.
 */

import { createHash } from 'crypto';
import type Database from 'better-sqlite3';

// BM25 parameters
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const STOPWORDS = new Set([
  'the',
  'be',
  'to',
  'of',
  'and',
  'a',
  'in',
  'that',
  'have',
  'i',
  'it',
  'for',
  'not',
  'on',
  'with',
  'he',
  'as',
  'you',
  'do',
  'at',
  'this',
  'but',
  'his',
  'by',
  'from',
  'they',
  'we',
  'say',
  'her',
  'she',
  'or',
  'an',
  'will',
  'my',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'so',
  'up',
  'out',
  'if',
  'about',
  'who',
  'get',
  'which',
  'go',
  'me',
  'when',
  'make',
  'can',
  'like',
  'time',
  'no',
  'just',
  'him',
  'know',
  'take',
  'into',
  'your',
  'some',
  'could',
  'them',
  'see',
  'other',
  'than',
  'then',
  'now',
  'look',
  'only',
  'come',
  'its',
  'over',
  'think',
  'also',
  'back',
  'after',
  'use',
  'two',
  'how',
  'our',
  'work',
  'first',
  'well',
  'way',
  'even',
  'want',
  'because',
  'any',
  'these',
  'give',
  'day',
  'most',
  'us',
  'is',
  'was',
  'are',
  'been',
  'has',
  'had',
  'were',
  'said',
  'did',
  'having',
  'may',
  'should',
  'am',
  'being',
  'does',
  'doing',
]);

export interface SearchResult {
  spanId: string;
  sourceId: string;
  text: string;
  excerpt: string;
  matchedTerms: string[];
  scoreComponents: {
    bm25: number;
    phraseBoost: number;
    termCoverage: number;
  };
  finalScore: number;
  provenance: {
    sourceId: string;
    spanId: string;
    startChar?: number;
    endChar?: number;
  };
}

export interface SearchOptions {
  limit?: number;
  explain?: boolean;
  minScore?: number;
}

export interface ConnectionExplanation {
  sourceA: string;
  sourceB: string;
  connected: boolean;
  sharedPhraseIds: string[];
  sharedPhraseTexts: string[];
  supportingSpanIds: string[];
  coOccurrenceEvidence: Array<{
    phraseId: string;
    phraseText: string;
    spanIdsA: string[];
    spanIdsB: string[];
  }>;
  topicMembership: Array<{
    topicId: string;
    topicName: string;
    status: string;
  }>;
  bm25OverlapScore: number;
  provenancePaths: Array<{
    fromSourceId: string;
    toSourceId: string;
    viaNodeIds: string[];
    viaEdgeKinds: string[];
  }>;
}

export interface IndexStats {
  sourceCount: number;
  spanCount: number;
  postingCount: number;
  uniqueTerms: number;
  durationMs: number;
}

interface SpanRow {
  id: string;
  text: string;
  source_id: string;
}

interface PostingRow {
  term: string;
  span_id: string;
  source_id: string;
  term_count: number;
}

interface DocStatsRow {
  span_id: string;
  source_id: string;
  total_terms: number;
  char_count: number;
}

export class InvertedIndexService {
  constructor(private readonly db: Database.Database) {}

  /**
   * Full rebuild of the inverted index for an account.
   * Idempotent: clears existing postings/stats before rebuilding.
   */
  rebuildIndex(accountId: string): IndexStats {
    const startTime = Date.now();

    // Clear existing index data for this account
    this.db.prepare('DELETE FROM search_postings WHERE account_id = ?').run(accountId);
    this.db.prepare('DELETE FROM search_doc_stats WHERE account_id = ?').run(accountId);

    // Load all SourceSpan nodes for this account
    const spanRows = this.db
      .prepare(
        `SELECT id, text, source_id FROM source_spans
         WHERE account_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(accountId) as SpanRow[];

    let postingCount = 0;
    const uniqueTerms = new Set<string>();
    const sourceIds = new Set<string>();

    const insertPosting = this.db.prepare(
      `INSERT OR REPLACE INTO search_postings
         (account_id, term, span_id, source_id, term_count, positions, data_tag)
       VALUES (?, ?, ?, ?, ?, ?, 'real')`
    );

    const insertDocStats = this.db.prepare(
      `INSERT OR REPLACE INTO search_doc_stats
         (account_id, span_id, source_id, total_terms, char_count, content_hash, data_tag)
       VALUES (?, ?, ?, ?, ?, ?, 'real')`
    );

    const transaction = this.db.transaction(() => {
      for (const row of spanRows) {
        const text = String(row.text || '');
        const sourceId = String(row.source_id || '');
        if (!text || !sourceId) {
          continue;
        }

        sourceIds.add(sourceId);
        const tokens = this.tokenize(text);
        const termPositions = new Map<string, number[]>();

        for (const token of tokens) {
          if (!termPositions.has(token.canonical)) {
            termPositions.set(token.canonical, []);
          }
          termPositions.get(token.canonical)!.push(token.start);
        }

        for (const [term, positions] of termPositions) {
          uniqueTerms.add(term);
          insertPosting.run(
            accountId,
            term,
            row.id,
            sourceId,
            positions.length,
            JSON.stringify(positions)
          );
          postingCount++;
        }

        const contentHash = createHash('sha256').update(text).digest('hex').slice(0, 32);
        insertDocStats.run(accountId, row.id, sourceId, tokens.length, text.length, contentHash);
      }
    });

    transaction();

    const durationMs = Date.now() - startTime;

    // Record the index run
    const runId = `idx_run_${createHash('sha256')
      .update(`${accountId}:${Date.now()}:${spanRows.length}`)
      .digest('hex')
      .slice(0, 24)}`;

    this.db
      .prepare(
        `INSERT INTO search_index_runs
           (id, account_id, run_type, source_count, span_count, posting_count, duration_ms, created_at, data_tag)
         VALUES (?, ?, 'full', ?, ?, ?, ?, ?, 'real')`
      )
      .run(runId, accountId, sourceIds.size, spanRows.length, postingCount, durationMs, Date.now());

    return {
      sourceCount: sourceIds.size,
      spanCount: spanRows.length,
      postingCount,
      uniqueTerms: uniqueTerms.size,
      durationMs,
    };
  }

  /**
   * Incrementally add a single span to the index.
   * Idempotent: re-adding the same span replaces its postings.
   */
  addSpan(accountId: string, spanId: string, sourceId: string, text: string): void {
    // Remove existing postings/stats for this span
    this.db
      .prepare('DELETE FROM search_postings WHERE account_id = ? AND span_id = ?')
      .run(accountId, spanId);
    this.db
      .prepare('DELETE FROM search_doc_stats WHERE account_id = ? AND span_id = ?')
      .run(accountId, spanId);

    const tokens = this.tokenize(text);
    const termPositions = new Map<string, number[]>();

    for (const token of tokens) {
      if (!termPositions.has(token.canonical)) {
        termPositions.set(token.canonical, []);
      }
      termPositions.get(token.canonical)!.push(token.start);
    }

    const insertPosting = this.db.prepare(
      `INSERT OR REPLACE INTO search_postings
         (account_id, term, span_id, source_id, term_count, positions, data_tag)
       VALUES (?, ?, ?, ?, ?, ?, 'real')`
    );

    const transaction = this.db.transaction(() => {
      for (const [term, positions] of termPositions) {
        insertPosting.run(
          accountId,
          term,
          spanId,
          sourceId,
          positions.length,
          JSON.stringify(positions)
        );
      }

      const contentHash = createHash('sha256').update(text).digest('hex').slice(0, 32);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO search_doc_stats
             (account_id, span_id, source_id, total_terms, char_count, content_hash, data_tag)
           VALUES (?, ?, ?, ?, ?, ?, 'real')`
        )
        .run(accountId, spanId, sourceId, tokens.length, text.length, contentHash);
    });

    transaction();
  }

  /**
   * BM25-ranked search over the inverted index.
   */
  search(accountId: string, query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit ?? 20;
    const minScore = options.minScore ?? 0.01;
    const queryTerms = this.tokenize(query).map((t) => t.canonical);
    const uniqueQueryTerms = Array.from(new Set(queryTerms));

    if (uniqueQueryTerms.length === 0) {
      return [];
    }

    // Get corpus-level stats
    const corpusStats = this.db
      .prepare(
        `SELECT COUNT(DISTINCT span_id) as doc_count,
                AVG(total_terms) as avg_doc_length
         FROM search_doc_stats
         WHERE account_id = ?`
      )
      .get(accountId) as { doc_count: number; avg_doc_length: number } | undefined;

    if (!corpusStats || corpusStats.doc_count === 0) {
      return [];
    }

    const N = corpusStats.doc_count;
    const avgDl = corpusStats.avg_doc_length || 1;

    // For each query term, get document frequency and postings
    const termPlaceholders = uniqueQueryTerms.map(() => '?').join(', ');
    const postings = this.db
      .prepare(
        `SELECT term, span_id, source_id, term_count
         FROM search_postings
         WHERE account_id = ? AND term IN (${termPlaceholders})
         ORDER BY term, span_id`
      )
      .all(accountId, ...uniqueQueryTerms) as PostingRow[];

    // Compute document frequencies
    const df = new Map<string, number>();
    for (const posting of postings) {
      df.set(posting.term, (df.get(posting.term) || 0) + 1);
    }

    // Get doc lengths
    const spanIds = Array.from(new Set(postings.map((p) => p.span_id)));
    if (spanIds.length === 0) {
      return [];
    }

    const spanPlaceholders = spanIds.map(() => '?').join(', ');
    const docStats = this.db
      .prepare(
        `SELECT span_id, source_id, total_terms, char_count
         FROM search_doc_stats
         WHERE account_id = ? AND span_id IN (${spanPlaceholders})`
      )
      .all(accountId, ...spanIds) as DocStatsRow[];

    const docLength = new Map<string, number>();
    const docSource = new Map<string, string>();
    for (const stats of docStats) {
      docLength.set(stats.span_id, stats.total_terms);
      docSource.set(stats.span_id, stats.source_id);
    }

    // BM25 scoring per span
    const scores = new Map<string, { bm25: number; matchedTerms: Set<string> }>();

    for (const posting of postings) {
      const termDf = df.get(posting.term) || 1;
      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
      const dl = docLength.get(posting.span_id) || 1;
      const tf = posting.term_count;
      const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDl)));
      const bm25Score = idf * tfNorm;

      const existing = scores.get(posting.span_id) || { bm25: 0, matchedTerms: new Set<string>() };
      existing.bm25 += bm25Score;
      existing.matchedTerms.add(posting.term);
      scores.set(posting.span_id, existing);
    }

    // Fetch span texts for results
    const scoredSpanIds = Array.from(scores.keys());
    const spanTextPlaceholders = scoredSpanIds.map(() => '?').join(', ');
    const spanTexts = this.db
      .prepare(
        `SELECT id, text, start_char, end_char FROM source_spans
         WHERE account_id = ? AND id IN (${spanTextPlaceholders})`
      )
      .all(accountId, ...scoredSpanIds) as any[];

    const spanTextMap = new Map<string, { text: string; startChar?: number; endChar?: number }>();
    for (const row of spanTexts) {
      spanTextMap.set(row.id, {
        text: String(row.text || ''),
        startChar: typeof row.start_char === 'number' ? row.start_char : undefined,
        endChar: typeof row.end_char === 'number' ? row.end_char : undefined,
      });
    }

    // Build results
    const results: SearchResult[] = [];
    for (const [spanId, scoreData] of scores) {
      const termCoverage = scoreData.matchedTerms.size / uniqueQueryTerms.length;
      const phraseBoost = this.computePhraseBoost(queryTerms, scoreData.matchedTerms);
      const finalScore = Number(
        (scoreData.bm25 * (1 + phraseBoost * 0.5) * (0.5 + termCoverage * 0.5)).toFixed(6)
      );

      if (finalScore < minScore) {
        continue;
      }

      const sourceId = docSource.get(spanId) || '';
      const spanData = spanTextMap.get(spanId) || { text: '' };
      const excerpt = this.buildExcerpt(spanData.text, Array.from(scoreData.matchedTerms));

      results.push({
        spanId,
        sourceId,
        text: spanData.text,
        excerpt,
        matchedTerms: Array.from(scoreData.matchedTerms).sort(),
        scoreComponents: {
          bm25: Number(scoreData.bm25.toFixed(6)),
          phraseBoost: Number(phraseBoost.toFixed(6)),
          termCoverage: Number(termCoverage.toFixed(6)),
        },
        finalScore,
        provenance: {
          sourceId,
          spanId,
          startChar: spanData.startChar,
          endChar: spanData.endChar,
        },
      });
    }

    return results
      .sort((a, b) => b.finalScore - a.finalScore || a.spanId.localeCompare(b.spanId))
      .slice(0, limit);
  }

  /**
   * Explain why two sources are connected.
   */
  explainConnection(accountId: string, sourceA: string, sourceB: string): ConnectionExplanation {
    // 1. Find shared phrases
    const sharedPhrases = this.db
      .prepare(
        `SELECT DISTINCT e1.to_id as phrase_id
         FROM edges e1
         JOIN edges e2 ON e1.to_id = e2.to_id AND e2.kind = 'MENTIONS'
         WHERE e1.account_id = ? AND e1.kind = 'MENTIONS'
           AND e1.from_id = ? AND e2.from_id = ?
         ORDER BY e1.to_id ASC`
      )
      .all(accountId, sourceA, sourceB) as Array<{ phrase_id: string }>;

    const sharedPhraseIds = sharedPhrases.map((r) => r.phrase_id);

    // Get phrase texts
    const sharedPhraseTexts: string[] = [];
    if (sharedPhraseIds.length > 0) {
      const placeholders = sharedPhraseIds.map(() => '?').join(', ');
      const phraseRows = this.db
        .prepare(
          `SELECT id, text FROM phrases
           WHERE account_id = ? AND id IN (${placeholders})`
        )
        .all(accountId, ...sharedPhraseIds) as any[];

      for (const row of phraseRows) {
        sharedPhraseTexts.push(String(row.text || row.id));
      }
    }

    // 2. Find supporting spans for shared phrases
    const supportingSpanIds: string[] = [];
    const coOccurrenceEvidence: ConnectionExplanation['coOccurrenceEvidence'] = [];

    for (const phraseId of sharedPhraseIds) {
      const spansA = this.db
        .prepare(
          `SELECT e.from_id as span_id FROM edges e
           JOIN source_spans s ON s.id = e.from_id AND s.account_id = ?
           WHERE e.account_id = ? AND e.kind = 'MENTIONS' AND e.to_id = ?
             AND s.source_id = ?`
        )
        .all(accountId, accountId, phraseId, sourceA) as Array<{ span_id: string }>;

      const spansB = this.db
        .prepare(
          `SELECT e.from_id as span_id FROM edges e
           JOIN source_spans s ON s.id = e.from_id AND s.account_id = ?
           WHERE e.account_id = ? AND e.kind = 'MENTIONS' AND e.to_id = ?
             AND s.source_id = ?`
        )
        .all(accountId, accountId, phraseId, sourceB) as Array<{ span_id: string }>;

      const spanIdsA = spansA.map((r) => r.span_id);
      const spanIdsB = spansB.map((r) => r.span_id);
      supportingSpanIds.push(...spanIdsA, ...spanIdsB);

      const phraseText = sharedPhraseTexts[sharedPhraseIds.indexOf(phraseId)] || phraseId;
      coOccurrenceEvidence.push({
        phraseId,
        phraseText,
        spanIdsA,
        spanIdsB,
      });
    }

    // 3. Find shared promoted topics
    const topicMembership: ConnectionExplanation['topicMembership'] = [];
    const topicsA = this.db
      .prepare(
        `SELECT DISTINCT e.to_id as topic_id FROM edges e
         WHERE e.account_id = ? AND e.kind = 'ABOUT' AND e.from_id = ?`
      )
      .all(accountId, sourceA) as Array<{ topic_id: string }>;

    const topicsB = this.db
      .prepare(
        `SELECT DISTINCT e.to_id as topic_id FROM edges e
         WHERE e.account_id = ? AND e.kind = 'ABOUT' AND e.from_id = ?`
      )
      .all(accountId, sourceB) as Array<{ topic_id: string }>;

    const topicIdsA = new Set(topicsA.map((r) => r.topic_id));
    const sharedTopicIds = topicsB.filter((r) => topicIdsA.has(r.topic_id)).map((r) => r.topic_id);

    if (sharedTopicIds.length > 0) {
      const tPlaceholders = sharedTopicIds.map(() => '?').join(', ');
      const topicRows = this.db
        .prepare(
          `SELECT id, properties FROM nodes
           WHERE account_id = ? AND id IN (${tPlaceholders})`
        )
        .all(accountId, ...sharedTopicIds) as Array<{ id: string; properties: string }>;

      for (const row of topicRows) {
        const props = this.parseProperties(row.properties);
        topicMembership.push({
          topicId: row.id,
          topicName: String(props.name || row.id),
          status: String(props.topic_status || 'unknown'),
        });
      }
    }

    // 4. BM25 overlap score
    const bm25OverlapScore = this.computeBm25Overlap(accountId, sourceA, sourceB);

    // 5. Provenance paths (simplified: via shared phrases)
    const provenancePaths: ConnectionExplanation['provenancePaths'] = sharedPhraseIds.map(
      (phraseId) => ({
        fromSourceId: sourceA,
        toSourceId: sourceB,
        viaNodeIds: [sourceA, phraseId, sourceB],
        viaEdgeKinds: ['MENTIONS', 'MENTIONS'],
      })
    );

    return {
      sourceA,
      sourceB,
      connected: sharedPhraseIds.length > 0 || sharedTopicIds.length > 0,
      sharedPhraseIds,
      sharedPhraseTexts: sharedPhraseTexts.sort(),
      supportingSpanIds: Array.from(new Set(supportingSpanIds)).sort(),
      coOccurrenceEvidence,
      topicMembership,
      bm25OverlapScore,
      provenancePaths,
    };
  }

  /**
   * Check if the index tables exist.
   */
  hasIndexTables(): boolean {
    try {
      this.db.prepare('SELECT 1 FROM search_postings LIMIT 0').run();
      this.db.prepare('SELECT 1 FROM search_doc_stats LIMIT 0').run();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private helpers ───

  private computeBm25Overlap(accountId: string, sourceA: string, sourceB: string): number {
    // Get terms from both sources
    const termsA = this.db
      .prepare(`SELECT DISTINCT term FROM search_postings WHERE account_id = ? AND source_id = ?`)
      .all(accountId, sourceA) as Array<{ term: string }>;

    const termsB = this.db
      .prepare(`SELECT DISTINCT term FROM search_postings WHERE account_id = ? AND source_id = ?`)
      .all(accountId, sourceB) as Array<{ term: string }>;

    const setA = new Set(termsA.map((r) => r.term));
    const setB = new Set(termsB.map((r) => r.term));

    let intersection = 0;
    for (const term of setA) {
      if (setB.has(term)) {
        intersection++;
      }
    }

    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? Number((intersection / union).toFixed(6)) : 0;
  }

  private computePhraseBoost(queryTerms: string[], matchedTerms: Set<string>): number {
    if (queryTerms.length < 2) {
      return 0;
    }
    // Check if consecutive query terms are all matched (phrase match)
    let consecutiveMatches = 0;
    for (let i = 0; i < queryTerms.length - 1; i++) {
      if (matchedTerms.has(queryTerms[i]) && matchedTerms.has(queryTerms[i + 1])) {
        consecutiveMatches++;
      }
    }
    return consecutiveMatches > 0 ? consecutiveMatches / (queryTerms.length - 1) : 0;
  }

  private buildExcerpt(text: string, matchedTerms: string[], maxLength: number = 200): string {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // Find the first matched term position in the text
    const lowerText = text.toLowerCase();
    let bestStart = 0;
    for (const term of matchedTerms) {
      const idx = lowerText.indexOf(term);
      if (idx >= 0) {
        bestStart = Math.max(0, idx - 40);
        break;
      }
    }

    const end = Math.min(text.length, bestStart + maxLength);
    let excerpt = text.slice(bestStart, end);
    if (bestStart > 0) {
      excerpt = '...' + excerpt;
    }
    if (end < text.length) {
      excerpt = excerpt + '...';
    }
    return excerpt;
  }

  private tokenize(text: string): Array<{ canonical: string; start: number; end: number }> {
    const tokens: Array<{ canonical: string; start: number; end: number }> = [];
    const regex = /[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const raw = match[0].replace(/^[_-]+|[_-]+$/g, '');
      const canonical = this.canonicalizeToken(raw);
      if (!canonical) {
        continue;
      }
      tokens.push({ canonical, start: match.index, end: match.index + match[0].length });
    }

    return tokens;
  }

  private canonicalizeToken(value: string): string | null {
    const normalized = value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[''']s$/u, '')
      .replace(/[^a-z0-9_]+/g, '')
      .trim();

    if (!normalized || normalized.length < 2 || STOPWORDS.has(normalized)) {
      return null;
    }

    // Basic plural normalization
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

  private parseProperties(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
