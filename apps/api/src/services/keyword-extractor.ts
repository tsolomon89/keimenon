/**
 * Deterministic keyword and phrase extraction for auto-grouping.
 *
 * Feature model:
 * - unigrams (keyword baseline)
 * - bi/tri-grams (context signal)
 * - phrase candidates (quoted + title-case spans)
 */

export interface KeywordScore {
  keyword: string;
  score: number;
  frequency: number;
  documentFrequency: number;
}

export interface Message {
  id: string;
  content: string;
  role: string;
}

const WORD_REGEX = /[A-Za-z0-9_]+/g;
const QUOTED_PHRASE_REGEX = /"([^"\n]{6,180})"/g;
const TITLE_PHRASE_REGEX = /\b(?:[A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,}){1,3}\b/g;

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
  'people',
  'into',
  'year',
  'your',
  'good',
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
  'new',
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
  'ought',
  // Code-heavy stop words.
  'function',
  'const',
  'let',
  'var',
  'return',
  'else',
  'while',
  'class',
  'def',
  'import',
  'true',
  'false',
  'null',
  'undefined',
]);

function tokenizeWords(text: string): string[] {
  const lower = text.toLowerCase();
  const matches = lower.match(WORD_REGEX) || [];
  return matches.filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function buildNgrams(tokens: string[], n: 2 | 3): string[] {
  if (tokens.length < n) {
    return [];
  }

  const ngrams: string[] = [];
  for (let index = 0; index <= tokens.length - n; index += 1) {
    const window = tokens.slice(index, index + n);
    // Avoid phrases made solely of low-signal duplicates.
    if (new Set(window).size === 1) {
      continue;
    }
    ngrams.push(`${n === 2 ? 'bi' : 'tri'}:${window.join('_')}`);
  }
  return ngrams;
}

function normalizePhrase(raw: string): string | null {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  const words = normalized.split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 6) {
    return null;
  }
  if (words.every((word) => STOPWORDS.has(word))) {
    return null;
  }

  return words.join('_');
}

function extractPhraseCandidates(text: string): string[] {
  const phrases: string[] = [];

  for (const regex of [QUOTED_PHRASE_REGEX, TITLE_PHRASE_REGEX]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      const candidate = normalizePhrase(match[1] || match[0]);
      if (candidate) {
        phrases.push(`phrase:${candidate}`);
      }
    }
  }

  return phrases;
}

function extractFeatureTokens(content: string): string[] {
  const unigrams = tokenizeWords(content);
  const bigrams = buildNgrams(unigrams, 2);
  const trigrams = buildNgrams(unigrams, 3);
  const phrases = extractPhraseCandidates(content);

  // Keep deterministic ordering while de-duplicating.
  const seen = new Set<string>();
  const features: string[] = [];
  for (const token of [...unigrams, ...bigrams, ...trigrams, ...phrases]) {
    if (!seen.has(token)) {
      seen.add(token);
      features.push(token);
    }
  }
  return features;
}

function computeTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const totalTokens = tokens.length || 1;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  for (const [token, count] of tf) {
    tf.set(token, count / totalTokens);
  }

  return tf;
}

function computeDocumentFrequency(cachedTokens: Map<string, string[]>): Map<string, number> {
  const df = new Map<string, number>();

  for (const tokens of cachedTokens.values()) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }

  return df;
}

export function extractKeywords(messages: Message[], topN: number = 100): KeywordScore[] {
  const numDocuments = messages.length;
  if (numDocuments === 0) {
    return [];
  }

  const cachedTokens = new Map<string, string[]>();
  for (const msg of messages) {
    cachedTokens.set(msg.id, extractFeatureTokens(msg.content));
  }

  const df = computeDocumentFrequency(cachedTokens);
  const globalTfidf = new Map<string, number>();
  const globalFreq = new Map<string, number>();

  for (const msg of messages) {
    const tokens = cachedTokens.get(msg.id) || [];
    const tf = computeTermFrequency(tokens);

    for (const [token, termFreq] of tf) {
      const docFreq = df.get(token) || 1;
      const idf = Math.log(numDocuments / docFreq);
      const tfidf = termFreq * idf;

      globalTfidf.set(token, (globalTfidf.get(token) || 0) + tfidf);
      globalFreq.set(token, (globalFreq.get(token) || 0) + 1);
    }
  }

  return Array.from(globalTfidf.entries())
    .map(([keyword, score]) => ({
      keyword,
      score,
      frequency: globalFreq.get(keyword) || 0,
      documentFrequency: df.get(keyword) || 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return a.keyword.localeCompare(b.keyword);
    })
    .slice(0, topN);
}

export function buildCooccurrenceMatrix(
  messages: Message[],
  keywords: KeywordScore[]
): Map<string, Map<string, number>> {
  const keywordSet = new Set(keywords.map((k) => k.keyword));
  const cooccurrence = new Map<string, Map<string, number>>();

  for (const kw of keywords) {
    cooccurrence.set(kw.keyword, new Map());
  }

  for (const msg of messages) {
    const tokens = new Set(extractFeatureTokens(msg.content));
    const presentKeywords = Array.from(tokens)
      .filter((token) => keywordSet.has(token))
      .sort((a, b) => a.localeCompare(b));

    for (let i = 0; i < presentKeywords.length; i += 1) {
      for (let j = i + 1; j < presentKeywords.length; j += 1) {
        const kw1 = presentKeywords[i];
        const kw2 = presentKeywords[j];

        const row1 = cooccurrence.get(kw1)!;
        row1.set(kw2, (row1.get(kw2) || 0) + 1);

        const row2 = cooccurrence.get(kw2)!;
        row2.set(kw1, (row2.get(kw1) || 0) + 1);
      }
    }
  }

  return cooccurrence;
}

function clusterSimilarity(
  cluster1: string[],
  cluster2: string[],
  cooccurrence: Map<string, Map<string, number>>
): number {
  let totalSim = 0;
  let count = 0;

  for (const kw1 of cluster1) {
    for (const kw2 of cluster2) {
      const row = cooccurrence.get(kw1);
      if (!row) {
        continue;
      }
      totalSim += row.get(kw2) || 0;
      count += 1;
    }
  }

  return count > 0 ? totalSim / count : 0;
}

function findMostCentralKeyword(
  cluster: string[],
  cooccurrence: Map<string, Map<string, number>>
): string {
  let maxCentrality = -1;
  let centralKeyword = cluster[0];

  for (const kw of cluster) {
    const row = cooccurrence.get(kw);
    if (!row) {
      continue;
    }

    let centrality = 0;
    for (const otherKw of cluster) {
      if (kw !== otherKw) {
        centrality += row.get(otherKw) || 0;
      }
    }

    if (centrality > maxCentrality) {
      maxCentrality = centrality;
      centralKeyword = kw;
      continue;
    }
    if (centrality === maxCentrality && kw.localeCompare(centralKeyword) < 0) {
      centralKeyword = kw;
    }
  }

  return centralKeyword;
}

export function clusterKeywords(
  cooccurrence: Map<string, Map<string, number>>,
  targetCount: number
): Map<string, string[]> {
  const keywords = Array.from(cooccurrence.keys()).sort((a, b) => a.localeCompare(b));
  if (keywords.length === 0) {
    return new Map();
  }

  const clusters: string[][] = keywords.map((keyword) => [keyword]);

  while (clusters.length > targetCount && clusters.length > 1) {
    let maxSim = -1;
    let mergeIndices: [number, number] = [-1, -1];

    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const sim = clusterSimilarity(clusters[i], clusters[j], cooccurrence);
        if (sim > maxSim) {
          maxSim = sim;
          mergeIndices = [i, j];
        }
      }
    }

    if (maxSim <= 0) {
      break;
    }

    const [i, j] = mergeIndices;
    clusters[i] = [...clusters[i], ...clusters[j]].sort((a, b) => a.localeCompare(b));
    clusters.splice(j, 1);
  }

  const sortedEntries = clusters
    .map((cluster) => {
      const mainKeyword = findMostCentralKeyword(cluster, cooccurrence);
      return [mainKeyword, cluster] as const;
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  return new Map<string, string[]>(sortedEntries);
}

export function assignMessagesToClusters(
  messages: Message[],
  keywordClusters: Map<string, string[]>
): Map<string, Message[]> {
  const assignments = new Map<string, Message[]>();
  const clusterEntries = Array.from(keywordClusters.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [clusterName] of clusterEntries) {
    assignments.set(clusterName, []);
  }

  for (const msg of messages) {
    const tokens = new Set(extractFeatureTokens(msg.content));

    let bestCluster: string | null = null;
    let maxOverlap = 0;

    for (const [clusterName, keywords] of clusterEntries) {
      const overlap = keywords.filter((kw) => tokens.has(kw)).length;
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestCluster = clusterName;
        continue;
      }
      if (overlap === maxOverlap && overlap > 0 && bestCluster && clusterName < bestCluster) {
        bestCluster = clusterName;
      }
    }

    if (bestCluster && maxOverlap > 0) {
      assignments.get(bestCluster)!.push(msg);
    }
  }

  return assignments;
}

function keywordCandidates(rawKeyword: string): string[] {
  const normalized = rawKeyword.toLowerCase().trim();
  if (!normalized) {
    return [];
  }

  const cleaned = normalized
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    return [];
  }

  const words = cleaned.split(' ').filter(Boolean);
  const candidates = new Set<string>();
  candidates.add(cleaned);

  if (words.length >= 2) {
    const normalizedPhrase = normalizePhrase(words.join(' '));
    if (normalizedPhrase) {
      candidates.add(`phrase:${normalizedPhrase}`);
      if (words.length === 2) {
        candidates.add(`bi:${words.join('_')}`);
      }
      if (words.length === 3) {
        candidates.add(`tri:${words.join('_')}`);
      }
    }
  }

  return Array.from(candidates);
}

export function findMessagesByKeywords(messages: Message[], keywords: string[]): Message[] {
  const keywordTokenCandidates = keywords.flatMap((keyword) => keywordCandidates(keyword));
  const keywordTokenSet = new Set(keywordTokenCandidates);

  return messages.filter((msg) => {
    if (keywordTokenSet.size === 0) {
      return false;
    }

    const loweredContent = msg.content.toLowerCase();
    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedKeyword.length > 0 && loweredContent.includes(normalizedKeyword)) {
        return true;
      }
    }

    const tokens = new Set(extractFeatureTokens(msg.content));
    for (const candidate of keywordTokenSet) {
      if (tokens.has(candidate)) {
        return true;
      }
    }
    return false;
  });
}
