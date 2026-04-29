import { SourceDoc, LexemeNode, PhraseNode, TopicNode, MentionsEdge } from '@keimenon/types';
import { v4 as uuidv4 } from 'uuid';
import nlp from 'compromise';
import type { SQLiteClient } from '@keimenon/db';

/**
 * Result of spine extraction with deduplication
 */
export interface SpineExtractionResult {
  /** New nodes that need to be created in DB */
  newLexemes: LexemeNode[];
  newPhrases: PhraseNode[];
  /** Existing nodes found in DB (for edge creation only) */
  existingLexemes: LexemeNode[];
  existingPhrases: PhraseNode[];
  /** MENTIONS edges to create (from source doc to lexemes/phrases) */
  edges: MentionsEdge[];
}

/**
 * Result of batch spine extraction (multiple messages at once)
 */
export interface BatchSpineResult extends SpineExtractionResult {
  /** Statistics for logging/debugging */
  stats: {
    messagesProcessed: number;
    totalLexemeCandidates: number;
    totalPhraseCandidates: number;
    newLexemesCreated: number;
    newPhrasesCreated: number;
    existingLexemesLinked: number;
    existingPhrasesLinked: number;
    edgesCreated: number;
  };
}

// Extended stopword list
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'can',
  'now',
  'also',
  'then',
  'there',
  'here',
  'from',
  'into',
  'over',
  'under',
  'again',
  'further',
  'once',
  'about',
  'above',
  'below',
  'between',
  'through',
  'during',
  'before',
  'after',
  'while',
  'because',
  'if',
  'unless',
  'until',
  'although',
  'though',
  'even',
  'still',
  'already',
  'yet',
  'ever',
  'never',
  'always',
  'often',
  'sometimes',
  'usually',
  'really',
  'actually',
  'basically',
  'generally',
  'specifically',
  'simply',
  'like',
  'get',
  'got',
  'getting',
  'make',
  'made',
  'making',
  'say',
  'said',
  'saying',
  'know',
  'knew',
  'known',
  'think',
  'thought',
  'thinking',
  'want',
  'wanted',
  'wanting',
  'use',
  'used',
  'using',
  'try',
  'tried',
  'trying',
  'need',
  'needed',
  'needing',
]);

// POS tag mapping for Lexeme nodes
type POSTag = 'noun' | 'verb' | 'adjective' | 'adverb' | 'other';

interface ExtractedEntity {
  text: string;
  phraseType: 'n-gram' | 'entity' | 'concept'; // Maps to PhraseNode.type
  entityType?: string; // Maps to PhraseNode.entity_type (e.g., "person", "place")
  count: number;
}

export class GraphSpineBuilder {
  private static instance: GraphSpineBuilder;

  private constructor() {}

  public static getInstance(): GraphSpineBuilder {
    if (!GraphSpineBuilder.instance) {
      GraphSpineBuilder.instance = new GraphSpineBuilder();
    }
    return GraphSpineBuilder.instance;
  }

  /**
   * extractSpine
   * Analyzes a SourceDoc and returns a set of Lexeme and Phrase nodes.
   * Uses compromise.js for NER and proper lemmatization.
   *
   * @deprecated Use extractSpineWithDedup for cross-conversation linking
   */
  public extractSpine(
    sourceDoc: SourceDoc,
    content: string
  ): { lexemes: LexemeNode[]; phrases: PhraseNode[] } {
    const doc = nlp(content);

    // 1. Extract Lexemes with proper lemmatization and POS tagging
    const lexemes = this.extractLexemes(doc, sourceDoc.id);

    // 2. Extract Phrases using NER + noun phrases + statistical n-grams
    const phrases = this.extractPhrases(doc, content, sourceDoc.id);

    return { lexemes, phrases };
  }

  /**
   * extractSpineWithDedup
   * Analyzes content and returns deduplicated Lexeme/Phrase nodes.
   *
   * This method checks the database for existing nodes before creating new ones,
   * enabling cross-conversation linking where the same concept (e.g., "Dark Matter")
   * mentioned in multiple chats becomes a single hub node with multiple MENTIONS edges.
   *
   * @param db - Database client for deduplication lookups
   * @param accountId - Account ID for multi-tenant isolation
   * @param sourceDocId - ID of the source document (for MENTIONS edge creation)
   * @param createdBy - User ID who created this
   * @param content - Text content to analyze
   * @returns SpineExtractionResult with new nodes, existing nodes, and edges
   */
  public async extractSpineWithDedup(
    db: SQLiteClient,
    accountId: string,
    sourceDocId: string,
    createdBy: string,
    content: string
  ): Promise<SpineExtractionResult> {
    const doc = nlp(content);
    const now = Date.now();

    // 1. Extract candidate lexemes and phrases (without IDs yet)
    const lexemeCandidates = this.extractLexemeCandidates(doc);
    const phraseCandidates = this.extractPhraseCandidates(doc, content);

    // 2. Batch query for existing lexemes by lemma
    const lexemeLemmas = lexemeCandidates.map((l) => l.lemma);
    const existingLexemeMap = await db.findSpineNodesByTexts(accountId, 'Lexeme', lexemeLemmas);

    // 3. Batch query for existing phrases by normalized_text
    const phraseTexts = phraseCandidates.map((p) => p.normalized_text);
    const existingPhraseMap = await db.findSpineNodesByTexts(accountId, 'Phrase', phraseTexts);

    // 4. Separate new vs existing, create edges
    const newLexemes: LexemeNode[] = [];
    const existingLexemes: LexemeNode[] = [];
    const newPhrases: PhraseNode[] = [];
    const existingPhrases: PhraseNode[] = [];
    const edges: MentionsEdge[] = [];

    // Process lexemes
    for (const candidate of lexemeCandidates) {
      const existing = existingLexemeMap.get(candidate.lemma.toLowerCase()) as
        | LexemeNode
        | undefined;

      if (existing) {
        // Found existing - reuse it for edge, update frequency in metadata
        existingLexemes.push(existing);
        edges.push({
          id: uuidv4(),
          kind: 'MENTIONS',
          from: sourceDocId,
          to: existing.id,
          created_at: now,
          count: candidate.frequency,
          metadata: { source_doc_id: sourceDocId },
        });
      } else {
        // New lexeme - create with new ID
        const newLexeme: LexemeNode = {
          id: uuidv4(),
          kind: 'Lexeme',
          lemma: candidate.lemma,
          pos: candidate.pos,
          frequency: candidate.frequency,
          created_at: now,
          updated_at: now,
          metadata: { source_doc_id: sourceDocId },
        };
        newLexemes.push(newLexeme);
        edges.push({
          id: uuidv4(),
          kind: 'MENTIONS',
          from: sourceDocId,
          to: newLexeme.id,
          created_at: now,
          count: candidate.frequency,
          metadata: { source_doc_id: sourceDocId },
        });
        // Add to map so subsequent candidates in same batch find it
        existingLexemeMap.set(candidate.lemma.toLowerCase(), newLexeme);
      }
    }

    // Process phrases
    for (const candidate of phraseCandidates) {
      const existing = existingPhraseMap.get(candidate.normalized_text.toLowerCase()) as
        | PhraseNode
        | undefined;

      if (existing) {
        // Found existing - reuse it for edge
        existingPhrases.push(existing);
        edges.push({
          id: uuidv4(),
          kind: 'MENTIONS',
          from: sourceDocId,
          to: existing.id,
          created_at: now,
          count: candidate.frequency,
          metadata: { source_doc_id: sourceDocId },
        });
      } else {
        // New phrase - create with new ID
        const newPhrase: PhraseNode = {
          id: uuidv4(),
          kind: 'Phrase',
          text: candidate.text,
          normalized_text: candidate.normalized_text,
          type: candidate.type,
          entity_type: candidate.entity_type,
          frequency: candidate.frequency,
          created_at: now,
          updated_at: now,
          metadata: { source_doc_id: sourceDocId },
        };
        newPhrases.push(newPhrase);
        edges.push({
          id: uuidv4(),
          kind: 'MENTIONS',
          from: sourceDocId,
          to: newPhrase.id,
          created_at: now,
          count: candidate.frequency,
          metadata: { source_doc_id: sourceDocId },
        });
        // Add to map so subsequent candidates in same batch find it
        existingPhraseMap.set(candidate.normalized_text.toLowerCase(), newPhrase);
      }
    }

    return {
      newLexemes,
      newPhrases,
      existingLexemes,
      existingPhrases,
      edges,
    };
  }

  /**
   * extractSpineBatch
   * Process multiple messages in a single batch for better performance.
   * Pre-computes all lexeme/phrase candidates, then does a single bulk DB lookup.
   *
   * Performance: Reduces O(n) DB queries to O(1) per batch.
   *
   * @param db - Database client for deduplication lookups
   * @param accountId - Account ID for multi-tenant isolation
   * @param messages - Array of messages to process (id + content)
   * @param createdBy - User ID who created this
   * @returns BatchSpineResult with aggregated new nodes and per-message edges
   */
  public async extractSpineBatch(
    db: SQLiteClient,
    accountId: string,
    messages: Array<{ id: string; content: string }>,
    createdBy: string
  ): Promise<BatchSpineResult> {
    const now = Date.now();

    // Aggregate candidates across ALL messages
    // Key: lemma|pos or normalized_text, Value: {candidate, sourceMessageIds}
    const lexemeAggregates = new Map<
      string,
      { lemma: string; pos: POSTag; frequency: number; sourceMessageIds: string[] }
    >();
    const phraseAggregates = new Map<
      string,
      {
        text: string;
        normalized_text: string;
        type: 'n-gram' | 'entity' | 'concept';
        entity_type?: string;
        frequency: number;
        sourceMessageIds: string[];
      }
    >();

    // Per-message tracking for edge creation
    const messageLexemes = new Map<string, Array<{ key: string; count: number }>>();
    const messagePhrases = new Map<string, Array<{ key: string; count: number }>>();

    // 1. Extract candidates from ALL messages (NO DB calls)
    for (const msg of messages) {
      const doc = nlp(msg.content);
      const lexemeCandidates = this.extractLexemeCandidates(doc);
      const phraseCandidates = this.extractPhraseCandidates(doc, msg.content);

      // Track per-message lexemes
      const msgLexemes: Array<{ key: string; count: number }> = [];
      for (const candidate of lexemeCandidates) {
        const key = `${candidate.lemma.toLowerCase()}|${candidate.pos}`;
        msgLexemes.push({ key, count: candidate.frequency });

        const existing = lexemeAggregates.get(key);
        if (existing) {
          existing.frequency += candidate.frequency;
          if (!existing.sourceMessageIds.includes(msg.id)) {
            existing.sourceMessageIds.push(msg.id);
          }
        } else {
          lexemeAggregates.set(key, {
            lemma: candidate.lemma,
            pos: candidate.pos,
            frequency: candidate.frequency,
            sourceMessageIds: [msg.id],
          });
        }
      }
      messageLexemes.set(msg.id, msgLexemes);

      // Track per-message phrases
      const msgPhrases: Array<{ key: string; count: number }> = [];
      for (const candidate of phraseCandidates) {
        const key = candidate.normalized_text.toLowerCase();
        msgPhrases.push({ key, count: candidate.frequency });

        const existing = phraseAggregates.get(key);
        if (existing) {
          existing.frequency += candidate.frequency;
          if (!existing.sourceMessageIds.includes(msg.id)) {
            existing.sourceMessageIds.push(msg.id);
          }
        } else {
          phraseAggregates.set(key, {
            text: candidate.text,
            normalized_text: candidate.normalized_text,
            type: candidate.type,
            entity_type: candidate.entity_type,
            frequency: candidate.frequency,
            sourceMessageIds: [msg.id],
          });
        }
      }
      messagePhrases.set(msg.id, msgPhrases);
    }

    // 2. SINGLE bulk DB lookup for existing lexemes
    const lexemeLemmas = [...lexemeAggregates.values()].map((l) => l.lemma);
    const existingLexemeMap =
      lexemeLemmas.length > 0
        ? await db.findSpineNodesByTexts(accountId, 'Lexeme', lexemeLemmas)
        : new Map();

    // 3. SINGLE bulk DB lookup for existing phrases
    const phraseTexts = [...phraseAggregates.values()].map((p) => p.normalized_text);
    const existingPhraseMap =
      phraseTexts.length > 0
        ? await db.findSpineNodesByTexts(accountId, 'Phrase', phraseTexts)
        : new Map();

    // 4. Create new nodes and build node ID map
    const newLexemes: LexemeNode[] = [];
    const existingLexemes: LexemeNode[] = [];
    const lexemeIdMap = new Map<string, string>(); // key -> node ID

    for (const [key, aggregate] of lexemeAggregates) {
      const existing = existingLexemeMap.get(aggregate.lemma.toLowerCase()) as
        | LexemeNode
        | undefined;
      if (existing) {
        existingLexemes.push(existing);
        lexemeIdMap.set(key, existing.id);
      } else {
        const newLexeme: LexemeNode = {
          id: uuidv4(),
          kind: 'Lexeme',
          lemma: aggregate.lemma,
          pos: aggregate.pos,
          frequency: aggregate.frequency,
          created_at: now,
          updated_at: now,
          metadata: { batch_source_count: aggregate.sourceMessageIds.length },
        };
        newLexemes.push(newLexeme);
        lexemeIdMap.set(key, newLexeme.id);
        // Add to existing map for subsequent lookups within batch
        existingLexemeMap.set(aggregate.lemma.toLowerCase(), newLexeme);
      }
    }

    const newPhrases: PhraseNode[] = [];
    const existingPhrases: PhraseNode[] = [];
    const phraseIdMap = new Map<string, string>(); // key -> node ID

    for (const [key, aggregate] of phraseAggregates) {
      const existing = existingPhraseMap.get(aggregate.normalized_text.toLowerCase()) as
        | PhraseNode
        | undefined;
      if (existing) {
        existingPhrases.push(existing);
        phraseIdMap.set(key, existing.id);
      } else {
        const newPhrase: PhraseNode = {
          id: uuidv4(),
          kind: 'Phrase',
          text: aggregate.text,
          normalized_text: aggregate.normalized_text,
          type: aggregate.type,
          entity_type: aggregate.entity_type,
          frequency: aggregate.frequency,
          created_at: now,
          updated_at: now,
          metadata: { batch_source_count: aggregate.sourceMessageIds.length },
        };
        newPhrases.push(newPhrase);
        phraseIdMap.set(key, newPhrase.id);
        // Add to existing map for subsequent lookups within batch
        existingPhraseMap.set(aggregate.normalized_text.toLowerCase(), newPhrase);
      }
    }

    // 5. Create MENTIONS edges for each message
    const edges: MentionsEdge[] = [];

    for (const msg of messages) {
      // Lexeme edges
      const msgLexemeRefs = messageLexemes.get(msg.id) || [];
      for (const ref of msgLexemeRefs) {
        const nodeId = lexemeIdMap.get(ref.key);
        if (nodeId) {
          edges.push({
            id: uuidv4(),
            kind: 'MENTIONS',
            from: msg.id,
            to: nodeId,
            created_at: now,
            count: ref.count,
            metadata: { source_doc_id: msg.id },
          });
        }
      }

      // Phrase edges
      const msgPhraseRefs = messagePhrases.get(msg.id) || [];
      for (const ref of msgPhraseRefs) {
        const nodeId = phraseIdMap.get(ref.key);
        if (nodeId) {
          edges.push({
            id: uuidv4(),
            kind: 'MENTIONS',
            from: msg.id,
            to: nodeId,
            created_at: now,
            count: ref.count,
            metadata: { source_doc_id: msg.id },
          });
        }
      }
    }

    return {
      newLexemes,
      newPhrases,
      existingLexemes,
      existingPhrases,
      edges,
      stats: {
        messagesProcessed: messages.length,
        totalLexemeCandidates: lexemeAggregates.size,
        totalPhraseCandidates: phraseAggregates.size,
        newLexemesCreated: newLexemes.length,
        newPhrasesCreated: newPhrases.length,
        existingLexemesLinked: existingLexemes.length,
        existingPhrasesLinked: existingPhrases.length,
        edgesCreated: edges.length,
      },
    };
  }

  /**
   * Extract lexeme candidates without generating IDs
   * (for deduplication check before ID assignment)
   */
  private extractLexemeCandidates(
    doc: ReturnType<typeof nlp>
  ): Array<{ lemma: string; pos: POSTag; frequency: number }> {
    const lexemeMap = new Map<string, { lemma: string; pos: POSTag; frequency: number }>();

    doc.terms().forEach((term) => {
      const text = term.text('normal');
      if (!text || text.length < 3 || STOPWORDS.has(text.toLowerCase())) return;

      const lemma = term.text('root') || text.toLowerCase();

      let pos: POSTag = 'other';
      if (term.has('#Noun')) pos = 'noun';
      else if (term.has('#Verb')) pos = 'verb';
      else if (term.has('#Adjective')) pos = 'adjective';
      else if (term.has('#Adverb')) pos = 'adverb';

      const key = `${lemma}|${pos}`;
      const existing = lexemeMap.get(key);
      if (existing) {
        existing.frequency++;
      } else {
        lexemeMap.set(key, { lemma, pos, frequency: 1 });
      }
    });

    return Array.from(lexemeMap.values());
  }

  /**
   * Extract phrase candidates without generating IDs
   * (for deduplication check before ID assignment)
   */
  private extractPhraseCandidates(
    doc: ReturnType<typeof nlp>,
    content: string
  ): Array<{
    text: string;
    normalized_text: string;
    type: 'n-gram' | 'entity' | 'concept';
    entity_type?: string;
    frequency: number;
  }> {
    const entityMap = new Map<
      string,
      {
        text: string;
        normalized_text: string;
        type: 'n-gram' | 'entity' | 'concept';
        entity_type?: string;
        frequency: number;
      }
    >();

    const addCandidate = (
      text: string,
      type: 'n-gram' | 'entity' | 'concept',
      entityType?: string,
      count = 1
    ) => {
      const normalized = text.toLowerCase();
      const existing = entityMap.get(normalized);
      if (existing) {
        existing.frequency += count;
      } else {
        entityMap.set(normalized, {
          text,
          normalized_text: normalized,
          type,
          entity_type: entityType,
          frequency: count,
        });
      }
    };

    // Named entities
    doc.people().forEach((person) => {
      const text = person.text('normal').trim();
      if (text.length > 2) addCandidate(text, 'entity', 'person');
    });

    doc.places().forEach((place) => {
      const text = place.text('normal').trim();
      if (text.length > 2) addCandidate(text, 'entity', 'place');
    });

    doc.organizations().forEach((org) => {
      const text = org.text('normal').trim();
      if (text.length > 2) addCandidate(text, 'entity', 'organization');
    });

    // Noun phrases
    doc.nouns().forEach((noun) => {
      const text = noun.text('normal').trim();
      if (text.includes(' ') && text.length > 5) {
        addCandidate(text, 'concept');
      }
    });

    // Statistical bigrams
    const bigrams = this.extractStatisticalBigrams(content);
    bigrams.forEach((count, text) => {
      const normalized = text.toLowerCase();
      if (!entityMap.has(normalized) && count >= 2) {
        addCandidate(text, 'n-gram', undefined, count);
      }
    });

    return Array.from(entityMap.values());
  }

  /**
   * Extract lexemes with lemmatization and POS tagging
   */
  private extractLexemes(doc: ReturnType<typeof nlp>, sourceDocId: string): LexemeNode[] {
    const lexemeMap = new Map<string, { lemma: string; pos: POSTag; count: number }>();

    // Process all terms
    doc.terms().forEach((term) => {
      const text = term.text('normal');
      if (!text || text.length < 3 || STOPWORDS.has(text.toLowerCase())) return;

      // Get lemma (root form)
      const lemma = term.text('root') || text.toLowerCase();

      // Determine POS tag
      let pos: POSTag = 'other';
      if (term.has('#Noun')) pos = 'noun';
      else if (term.has('#Verb')) pos = 'verb';
      else if (term.has('#Adjective')) pos = 'adjective';
      else if (term.has('#Adverb')) pos = 'adverb';

      // Aggregate by lemma
      const key = `${lemma}|${pos}`;
      const existing = lexemeMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        lexemeMap.set(key, { lemma, pos, count: 1 });
      }
    });

    // Convert to LexemeNodes
    const lexemes: LexemeNode[] = [];
    lexemeMap.forEach(({ lemma, pos, count }) => {
      lexemes.push({
        id: uuidv4(),
        kind: 'Lexeme',
        lemma,
        pos,
        frequency: count,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          source_doc_id: sourceDocId,
        },
      });
    });

    return lexemes;
  }

  /**
   * Extract phrases using NER, noun phrases, and statistical n-grams
   */
  private extractPhrases(
    doc: ReturnType<typeof nlp>,
    content: string,
    sourceDocId: string
  ): PhraseNode[] {
    const entityMap = new Map<string, ExtractedEntity>();

    // 1. Named Entity Recognition - People
    doc.people().forEach((person) => {
      const text = person.text('normal').trim();
      if (text.length > 2) {
        this.addEntity(entityMap, text, 'entity', 'person');
      }
    });

    // 2. Named Entity Recognition - Places
    doc.places().forEach((place) => {
      const text = place.text('normal').trim();
      if (text.length > 2) {
        this.addEntity(entityMap, text, 'entity', 'place');
      }
    });

    // 3. Named Entity Recognition - Organizations
    doc.organizations().forEach((org) => {
      const text = org.text('normal').trim();
      if (text.length > 2) {
        this.addEntity(entityMap, text, 'entity', 'organization');
      }
    });

    // 4. Noun phrases (compound nouns, adjective+noun combinations)
    doc.nouns().forEach((noun) => {
      // Check if it's a multi-word phrase
      const text = noun.text('normal').trim();
      if (text.includes(' ') && text.length > 5) {
        this.addEntity(entityMap, text, 'concept');
      }
    });

    // 5. Statistical bigrams (fallback for content without many named entities)
    const bigrams = this.extractStatisticalBigrams(content);
    bigrams.forEach((count, text) => {
      // Only add if not already captured by NER
      const normalized = text.toLowerCase();
      if (!entityMap.has(normalized) && count >= 2) {
        this.addEntity(entityMap, text, 'n-gram', undefined, count);
      }
    });

    // Convert to PhraseNodes
    const phrases: PhraseNode[] = [];
    entityMap.forEach((entity) => {
      phrases.push({
        id: uuidv4(),
        kind: 'Phrase',
        text: entity.text,
        normalized_text: entity.text.toLowerCase(),
        type: entity.phraseType,
        entity_type: entity.entityType,
        frequency: entity.count,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          source_doc_id: sourceDocId,
        },
      });
    });

    return phrases;
  }

  private addEntity(
    map: Map<string, ExtractedEntity>,
    text: string,
    phraseType: ExtractedEntity['phraseType'],
    entityType?: string,
    count = 1
  ): void {
    const key = text.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += count;
    } else {
      map.set(key, { text, phraseType, entityType, count });
    }
  }

  private extractStatisticalBigrams(content: string): Map<string, number> {
    const normalized = content.toLowerCase().replace(/[^\w\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));

    const bigrams = new Map<string, number>();
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }

    return bigrams;
  }

  /**
   * clusterTopics
   * Aggregates phrases into Topic nodes using TF-IDF scoring and co-occurrence.
   */
  public clusterTopics(phrases: PhraseNode[]): TopicNode[] {
    if (phrases.length === 0) return [];

    // 1. Calculate TF-IDF scores for all phrases
    const tfidfScores = this.calculateTfIdf(phrases);

    // 2. Group phrases by shared tokens (union-find clustering)
    const clusters = this.clusterBySharedTokens(phrases);

    // Convert clusters to Topics
    const topics: TopicNode[] = [];

    clusters.forEach((clusterPhrases, clusterIndex) => {
      if (clusterPhrases.length < 2) return; // Skip singleton clusters

      // Calculate topic strength using TF-IDF weighted scores
      const totalTfIdf = clusterPhrases.reduce(
        (sum, p) => sum + (tfidfScores.get(p.normalized_text) || p.frequency),
        0
      );
      const avgTfIdf = totalTfIdf / clusterPhrases.length;
      const strength = Math.min(1.0, avgTfIdf / 5); // Normalize TF-IDF to 0-1

      // Extract keywords ranked by TF-IDF (not just frequency)
      const sortedPhrases = [...clusterPhrases].sort((a, b) => {
        const scoreA = tfidfScores.get(a.normalized_text) || a.frequency;
        const scoreB = tfidfScores.get(b.normalized_text) || b.frequency;
        return scoreB - scoreA;
      });
      const keywords = sortedPhrases.slice(0, 5).map((p) => p.text);

      // Generate topic name from highest TF-IDF keyword
      const topKeyword = keywords[0] || 'Topic';
      const name = this.generateTopicName(topKeyword, clusterPhrases);

      topics.push({
        id: uuidv4(),
        kind: 'Topic',
        name,
        description: `Topic cluster containing: ${keywords.slice(0, 3).join(', ')}`,
        keywords,
        strength,
        topic_status: 'suggested' as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: {
          phrase_count: clusterPhrases.length,
          total_frequency: clusterPhrases.reduce((sum, p) => sum + p.frequency, 0),
          avg_tfidf: avgTfIdf,
          cluster_index: clusterIndex,
        },
      });
    });

    return topics;
  }

  /**
   * Calculate TF-IDF scores for phrases
   * TF = term frequency (phrase.frequency)
   * IDF = log(total_phrases / doc_frequency)
   */
  private calculateTfIdf(phrases: PhraseNode[]): Map<string, number> {
    const scores = new Map<string, number>();
    const totalPhrases = phrases.length;
    if (totalPhrases === 0) return scores;

    // Build document frequency: how many phrases contain each token
    const docFrequency = new Map<string, number>();
    phrases.forEach((phrase) => {
      const tokens = new Set(phrase.normalized_text.split(/\s+/));
      tokens.forEach((token) => {
        if (token.length > 2 && !STOPWORDS.has(token)) {
          docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
        }
      });
    });

    // Calculate TF-IDF for each phrase
    phrases.forEach((phrase) => {
      const tokens = phrase.normalized_text.split(/\s+/);
      let phraseScore = 0;

      tokens.forEach((token) => {
        if (token.length > 2 && !STOPWORDS.has(token)) {
          const df = docFrequency.get(token) || 1;
          const idf = Math.log(totalPhrases / df);
          // TF is normalized by phrase frequency
          const tf = phrase.frequency;
          phraseScore += tf * idf;
        }
      });

      // Average by token count
      const tokenCount = tokens.filter((t) => t.length > 2 && !STOPWORDS.has(t)).length;
      if (tokenCount > 0) {
        scores.set(phrase.normalized_text, phraseScore / tokenCount);
      }
    });

    return scores;
  }

  /**
   * Cluster phrases by shared tokens using a simple union-find approach
   */
  private clusterBySharedTokens(phrases: PhraseNode[]): Map<number, PhraseNode[]> {
    // Build token -> phrase index mapping
    const tokenToPhrases = new Map<string, number[]>();

    phrases.forEach((phrase, index) => {
      const tokens = phrase.normalized_text.split(/\s+/);
      tokens.forEach((token) => {
        if (token.length > 3 && !STOPWORDS.has(token)) {
          const existing = tokenToPhrases.get(token) || [];
          existing.push(index);
          tokenToPhrases.set(token, existing);
        }
      });
    });

    // Union-find for clustering
    const parent = phrases.map((_, i) => i);
    const find = (i: number): number => {
      if (parent[i] !== i) parent[i] = find(parent[i]);
      return parent[i];
    };
    const union = (i: number, j: number) => {
      const pi = find(i);
      const pj = find(j);
      if (pi !== pj) parent[pi] = pj;
    };

    // Union phrases that share tokens
    tokenToPhrases.forEach((phraseIndices) => {
      for (let i = 1; i < phraseIndices.length; i++) {
        union(phraseIndices[0], phraseIndices[i]);
      }
    });

    // Group by cluster root
    const clusters = new Map<number, PhraseNode[]>();
    phrases.forEach((phrase, index) => {
      const root = find(index);
      const cluster = clusters.get(root) || [];
      cluster.push(phrase);
      clusters.set(root, cluster);
    });

    return clusters;
  }

  /**
   * Generate a descriptive topic name
   */
  private generateTopicName(topKeyword: string, phrases: PhraseNode[]): string {
    // Check if we have named entities
    const namedEntities = phrases.filter(
      (p) => p.entity_type && ['person', 'place', 'organization'].includes(p.entity_type)
    );

    if (namedEntities.length > 0) {
      const entityType = namedEntities[0].entity_type;
      return `${this.capitalizeFirst(entityType || 'entity')}: ${this.capitalizeFirst(topKeyword)}`;
    }

    return `Topic: ${this.capitalizeFirst(topKeyword)}`;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
