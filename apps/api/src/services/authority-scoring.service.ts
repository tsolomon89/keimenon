/**
 * Authority Scoring Service
 *
 * Deterministic, inspectable authority and hub scores for graph nodes.
 * No PageRank over-engineering — straightforward additive scoring with
 * explanation metadata for debugging.
 *
 * Phrase hub score = source_count + span_count + co_occurrence_degree + heading_boost + promotion_boost
 * Source authority score = distinct_phrase_count + high_value_mentions + unified_doc_citations + promoted_links
 */

import type Database from 'better-sqlite3';

export interface AuthorityScore {
  nodeId: string;
  kind: string;
  authorityScore: number;
  hubScore: number;
  components: AuthorityScoreComponents;
}

export interface AuthorityScoreComponents {
  sourceCount?: number;
  spanCount?: number;
  coOccurrenceDegree?: number;
  headingBoost?: number;
  promotionBoost?: number;
  distinctPhraseCount?: number;
  highValueMentions?: number;
  unifiedDocCitations?: number;
  promotedLinks?: number;
}

export interface AuthorityComputeResult {
  phraseScores: number;
  sourceScores: number;
  topicScores: number;
  durationMs: number;
}

interface NodeRow {
  id: string;
  kind: string;
  properties: string;
}

interface EdgeCountRow {
  node_id: string;
  edge_count: number;
}

export class AuthorityScoringService {
  constructor(private readonly db: Database.Database) {}

  /**
   * Compute and persist authority scores for all Phrase, Source, and Topic nodes in an account.
   * Idempotent: overwrites previous scores.
   */
  computeAuthority(accountId: string): AuthorityComputeResult {
    const startTime = Date.now();

    const phraseScores = this.scorePhrases(accountId);
    const sourceScores = this.scoreSources(accountId);
    const topicScores = this.scoreTopics(accountId);

    return {
      phraseScores,
      sourceScores,
      topicScores,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Lookup authority scores for specific nodes.
   */
  getAuthorityScores(accountId: string, nodeIds: string[]): AuthorityScore[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT id, kind, properties as raw_data FROM nodes
         WHERE account_id = ? AND id IN (${placeholders})
         UNION ALL
         SELECT id, 'Phrase' as kind, metadata as raw_data FROM phrases
         WHERE account_id = ? AND id IN (${placeholders})`
      )
      .all(accountId, ...nodeIds, accountId, ...nodeIds) as any[];

    return rows
      .map((row) => {
        let metadata: Record<string, unknown> = {};
        const parsed = this.parseProperties(row.raw_data);
        if (row.kind === 'Phrase') {
          metadata = parsed;
        } else {
          metadata = (parsed.metadata || {}) as Record<string, unknown>;
        }

        return {
          nodeId: row.id,
          kind: row.kind,
          authorityScore: Number(metadata.authority_score || 0),
          hubScore: Number(metadata.hub_score || 0),
          components: (metadata.score_components || {}) as AuthorityScoreComponents,
        };
      })
      .sort((a, b) => b.authorityScore - a.authorityScore || a.nodeId.localeCompare(b.nodeId));
  }

  // ─── Private scoring ───

  private scorePhrases(accountId: string): number {
    const phrases = this.db
      .prepare(
        `SELECT id, text, metadata FROM phrases
         WHERE account_id = ?
         ORDER BY id ASC`
      )
      .all(accountId) as any[];

    if (phrases.length === 0) {
      return 0;
    }

    const updateStmt = this.db.prepare(
      `UPDATE phrases SET metadata = ?, updated_at = ?
       WHERE account_id = ? AND id = ?`
    );

    const transaction = this.db.transaction(() => {
      for (const phrase of phrases) {
        const metadata = this.parseProperties(phrase.metadata || '{}');

        // Source count: how many distinct sources MENTION this phrase
        const sourceCount = this.countDistinctEdges(
          accountId,
          phrase.id,
          'MENTIONS',
          'to',
          'Source'
        );

        // Span count: how many SourceSpan nodes MENTION this phrase
        const spanCount = this.countDistinctEdges(
          accountId,
          phrase.id,
          'MENTIONS',
          'to',
          'SourceSpan'
        );

        // Co-occurrence degree: how many CO_OCCURS_WITH edges
        const coOccurrenceDegree = this.countEdgesOfKind(accountId, phrase.id, 'CO_OCCURS_WITH');

        // Heading/title boost: if phrase text appears in any source title
        const headingBoost = this.computeHeadingBoost(accountId, String(phrase.text || ''));

        // Promotion boost: if the phrase belongs to a promoted topic
        const promotionBoost = this.computePhrasePromotionBoost(accountId, phrase.id);

        const hubScore = Number(
          (
            sourceCount +
            spanCount * 0.5 +
            coOccurrenceDegree * 0.3 +
            headingBoost * 2 +
            promotionBoost * 1.5
          ).toFixed(4)
        );

        const components: AuthorityScoreComponents = {
          sourceCount,
          spanCount,
          coOccurrenceDegree,
          headingBoost,
          promotionBoost,
        };

        metadata.hub_score = hubScore;
        metadata.authority_score = hubScore; // Phrases use hub score as authority
        metadata.score_components = components;
        metadata.authority_computed_at = Date.now();

        updateStmt.run(JSON.stringify(metadata), Date.now(), accountId, phrase.id);
      }
    });

    transaction();
    return phrases.length;
  }

  private scoreSources(accountId: string): number {
    const sources = this.db
      .prepare(
        `SELECT id, properties FROM nodes
         WHERE account_id = ? AND kind = 'Source'
         ORDER BY id ASC`
      )
      .all(accountId) as NodeRow[];

    if (sources.length === 0) {
      return 0;
    }

    const updateStmt = this.db.prepare(
      `UPDATE nodes SET properties = ?, updated_at = ?
       WHERE account_id = ? AND id = ?`
    );

    const transaction = this.db.transaction(() => {
      for (const source of sources) {
        const props = this.parseProperties(source.properties);
        const metadata = { ...((props.metadata as Record<string, unknown>) || {}) };

        // Distinct phrase count: how many distinct Phrase nodes this source MENTIONS
        const distinctPhraseCount = this.countDistinctEdges(
          accountId,
          source.id,
          'MENTIONS',
          'from',
          'Phrase'
        );

        // High-value mentions: phrases with hub_score > 2 that this source mentions
        const highValueMentions = this.countHighValueMentions(accountId, source.id);

        // Unified doc citations: how many UnifiedDoc nodes DERIVE_FROM this source
        const unifiedDocCitations = this.countDistinctEdges(
          accountId,
          source.id,
          'DERIVES_FROM',
          'to',
          'UnifiedDoc'
        );

        // Promoted topic links: how many promoted topics is this source ABOUT
        const promotedLinks = this.countPromotedTopicLinks(accountId, source.id);

        const authorityScore = Number(
          (
            distinctPhraseCount * 0.5 +
            highValueMentions * 1.5 +
            unifiedDocCitations * 3 +
            promotedLinks * 2
          ).toFixed(4)
        );

        const components: AuthorityScoreComponents = {
          distinctPhraseCount,
          highValueMentions,
          unifiedDocCitations,
          promotedLinks,
        };

        metadata.authority_score = authorityScore;
        metadata.hub_score = authorityScore; // Sources use authority score as hub
        metadata.score_components = components;
        metadata.authority_computed_at = Date.now();

        props.metadata = metadata;
        updateStmt.run(JSON.stringify(props), Date.now(), accountId, source.id);
      }
    });

    transaction();
    return sources.length;
  }

  private scoreTopics(accountId: string): number {
    const topics = this.db
      .prepare(
        `SELECT id, properties FROM nodes
         WHERE account_id = ? AND kind = 'Topic'
         ORDER BY id ASC`
      )
      .all(accountId) as NodeRow[];

    if (topics.length === 0) {
      return 0;
    }

    const updateStmt = this.db.prepare(
      `UPDATE nodes SET properties = ?, updated_at = ?
       WHERE account_id = ? AND id = ?`
    );

    const transaction = this.db.transaction(() => {
      for (const topic of topics) {
        const props = this.parseProperties(topic.properties);
        const metadata = { ...((props.metadata as Record<string, unknown>) || {}) };

        const memberPhrases = this.countEdgesOfKind(accountId, topic.id, 'BELONGS_TO_TOPIC');
        const aboutSources = this.countEdgesOfKind(accountId, topic.id, 'ABOUT');
        const topicStatus = String(props.topic_status || 'suggested');
        const promotionBoost = topicStatus === 'promoted' ? 2 : 0;

        const authorityScore = Number(
          (memberPhrases * 0.8 + aboutSources * 1.2 + promotionBoost).toFixed(4)
        );

        metadata.authority_score = authorityScore;
        metadata.hub_score = authorityScore;
        metadata.score_components = { memberPhrases, aboutSources, promotionBoost };
        metadata.authority_computed_at = Date.now();

        props.metadata = metadata;
        updateStmt.run(JSON.stringify(props), Date.now(), accountId, topic.id);
      }
    });

    transaction();
    return topics.length;
  }

  // ─── Helpers ───

  private countDistinctEdges(
    accountId: string,
    nodeId: string,
    edgeKind: string,
    direction: 'from' | 'to',
    targetKind: string
  ): number {
    const targetCol = direction === 'from' ? 'to_id' : 'from_id';
    const sourceCol = direction === 'from' ? 'from_id' : 'to_id';

    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT e.${targetCol}) as cnt
         FROM edges e
         JOIN nodes n ON n.id = e.${targetCol} AND n.kind = ? AND n.account_id = ?
         WHERE e.account_id = ? AND e.kind = ? AND e.${sourceCol} = ?`
      )
      .get(targetKind, accountId, accountId, edgeKind, nodeId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  }

  private countEdgesOfKind(accountId: string, nodeId: string, edgeKind: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM edges
         WHERE account_id = ? AND kind = ?
           AND (from_id = ? OR to_id = ?)`
      )
      .get(accountId, edgeKind, nodeId, nodeId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  }

  private sourceTitlesCache: Map<string, string[]> = new Map();

  private getSourceTitles(accountId: string): string[] {
    if (!this.sourceTitlesCache.has(accountId)) {
      const rows = this.db
        .prepare(`SELECT properties FROM nodes WHERE account_id = ? AND kind = 'Source'`)
        .all(accountId) as NodeRow[];

      const titles = rows
        .map((row) => {
          const props = this.parseProperties(row.properties);
          return typeof props.title === 'string' ? props.title.toLowerCase() : '';
        })
        .filter((t) => t.length > 0);

      this.sourceTitlesCache.set(accountId, titles);
    }
    return this.sourceTitlesCache.get(accountId)!;
  }

  private computeHeadingBoost(accountId: string, phraseText: string): number {
    if (!phraseText || phraseText.length < 3) {
      return 0;
    }

    const lowerPhrase = phraseText.toLowerCase();
    const titles = this.getSourceTitles(accountId);

    for (const title of titles) {
      if (title.includes(lowerPhrase)) {
        return 1;
      }
    }

    return 0;
  }

  private computePhrasePromotionBoost(accountId: string, phraseId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM edges e
         JOIN nodes n ON n.id = e.to_id AND n.kind = 'Topic' AND n.account_id = ?
         WHERE e.account_id = ? AND e.kind = 'BELONGS_TO_TOPIC' AND e.from_id = ?
           AND json_extract(n.properties, '$.topic_status') = 'promoted'`
      )
      .get(accountId, accountId, phraseId) as { cnt: number } | undefined;

    return (row?.cnt ?? 0) > 0 ? 1 : 0;
  }

  private countHighValueMentions(accountId: string, sourceId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT e.to_id) as cnt
         FROM edges e
         JOIN nodes n ON n.id = e.to_id AND n.kind = 'Phrase' AND n.account_id = ?
         WHERE e.account_id = ? AND e.kind = 'MENTIONS' AND e.from_id = ?
           AND CAST(json_extract(n.properties, '$.metadata.hub_score') AS REAL) > 2`
      )
      .get(accountId, accountId, sourceId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  }

  private countPromotedTopicLinks(accountId: string, sourceId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT e.to_id) as cnt
         FROM edges e
         JOIN nodes n ON n.id = e.to_id AND n.kind = 'Topic' AND n.account_id = ?
         WHERE e.account_id = ? AND e.kind = 'ABOUT' AND e.from_id = ?
           AND json_extract(n.properties, '$.topic_status') = 'promoted'`
      )
      .get(accountId, accountId, sourceId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
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
