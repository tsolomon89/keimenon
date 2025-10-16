/**
 * TF-IDF Keyword Extraction Service
 * Extracts important keywords from messages for auto-grouping
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

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(token => token.length > 2); // Min 3 chars
}

/**
 * Common stopwords to exclude
 */
const STOPWORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
  'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
  'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first',
  'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day',
  'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had', 'were', 'said', 'did',
  'having', 'may', 'should', 'am', 'being', 'does', 'doing', 'would', 'could', 'ought',
  // Code-related common words to exclude
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'do',
  'class', 'def', 'import', 'from', 'true', 'false', 'null', 'undefined',
]);

/**
 * Filter stopwords
 */
function filterStopwords(tokens: string[]): string[] {
  return tokens.filter(token => !STOPWORDS.has(token));
}

/**
 * Compute term frequency (TF) for a document
 */
function computeTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const totalTokens = tokens.length;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  // Normalize by total tokens
  for (const [token, count] of tf) {
    tf.set(token, count / totalTokens);
  }

  return tf;
}

/**
 * Compute document frequency (DF) across all documents
 */
function computeDocumentFrequency(messages: Message[]): Map<string, number> {
  const df = new Map<string, number>();

  for (const msg of messages) {
    const tokens = new Set(filterStopwords(tokenize(msg.content)));

    for (const token of tokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }

  return df;
}

/**
 * Compute TF-IDF scores for all messages
 */
export function extractKeywords(
  messages: Message[],
  topN: number = 100
): KeywordScore[] {
  const numDocuments = messages.length;

  if (numDocuments === 0) {
    return [];
  }

  // Compute document frequency
  const df = computeDocumentFrequency(messages);

  // Compute TF-IDF for each message
  const globalTfidf = new Map<string, number>();
  const globalFreq = new Map<string, number>();

  for (const msg of messages) {
    const tokens = filterStopwords(tokenize(msg.content));
    const tf = computeTermFrequency(tokens);

    for (const [token, termFreq] of tf) {
      const docFreq = df.get(token) || 1;
      const idf = Math.log(numDocuments / docFreq);
      const tfidf = termFreq * idf;

      globalTfidf.set(token, (globalTfidf.get(token) || 0) + tfidf);
      globalFreq.set(token, (globalFreq.get(token) || 0) + 1);
    }
  }

  // Convert to sorted array
  const keywords: KeywordScore[] = Array.from(globalTfidf.entries())
    .map(([keyword, score]) => ({
      keyword,
      score,
      frequency: globalFreq.get(keyword) || 0,
      documentFrequency: df.get(keyword) || 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return keywords;
}

/**
 * Build keyword co-occurrence matrix
 */
export function buildCooccurrenceMatrix(
  messages: Message[],
  keywords: KeywordScore[]
): Map<string, Map<string, number>> {
  const keywordSet = new Set(keywords.map(k => k.keyword));
  const cooccurrence = new Map<string, Map<string, number>>();

  // Initialize matrix
  for (const kw of keywords) {
    cooccurrence.set(kw.keyword, new Map());
  }

  // Count co-occurrences
  for (const msg of messages) {
    const tokens = new Set(filterStopwords(tokenize(msg.content)));
    const presentKeywords = Array.from(tokens).filter(t => keywordSet.has(t));

    // Update co-occurrence counts
    for (let i = 0; i < presentKeywords.length; i++) {
      for (let j = i + 1; j < presentKeywords.length; j++) {
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

/**
 * Cluster keywords using hierarchical clustering
 */
export function clusterKeywords(
  cooccurrence: Map<string, Map<string, number>>,
  targetCount: number
): Map<string, string[]> {
  const keywords = Array.from(cooccurrence.keys());

  if (keywords.length === 0) {
    return new Map();
  }

  // Start with each keyword as its own cluster
  let clusters: string[][] = keywords.map(k => [k]);

  // Merge until we reach target count
  while (clusters.length > targetCount && clusters.length > 1) {
    let maxSim = -1;
    let mergeIndices: [number, number] = [-1, -1];

    // Find most similar pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = clusterSimilarity(clusters[i], clusters[j], cooccurrence);
        if (sim > maxSim) {
          maxSim = sim;
          mergeIndices = [i, j];
        }
      }
    }

    // No more mergeable clusters
    if (maxSim <= 0) {
      break;
    }

    // Merge clusters
    const [i, j] = mergeIndices;
    clusters[i] = [...clusters[i], ...clusters[j]];
    clusters.splice(j, 1);
  }

  // Convert to map with cluster names
  const result = new Map<string, string[]>();

  for (const cluster of clusters) {
    // Use most central keyword as cluster name
    const mainKeyword = findMostCentralKeyword(cluster, cooccurrence);
    result.set(mainKeyword, cluster);
  }

  return result;
}

/**
 * Calculate similarity between two clusters
 */
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
      if (row) {
        const cooc = row.get(kw2) || 0;
        totalSim += cooc;
        count++;
      }
    }
  }

  return count > 0 ? totalSim / count : 0;
}

/**
 * Find most central keyword in cluster
 */
function findMostCentralKeyword(
  cluster: string[],
  cooccurrence: Map<string, Map<string, number>>
): string {
  let maxCentrality = -1;
  let centralKeyword = cluster[0];

  for (const kw of cluster) {
    const row = cooccurrence.get(kw);
    if (!row) continue;

    // Sum of connections to other keywords in cluster
    let centrality = 0;
    for (const otherKw of cluster) {
      if (kw !== otherKw) {
        centrality += row.get(otherKw) || 0;
      }
    }

    if (centrality > maxCentrality) {
      maxCentrality = centrality;
      centralKeyword = kw;
    }
  }

  return centralKeyword;
}

/**
 * Assign messages to keyword clusters
 */
export function assignMessagesToClusters(
  messages: Message[],
  keywordClusters: Map<string, string[]>
): Map<string, Message[]> {
  const assignments = new Map<string, Message[]>();

  // Initialize empty arrays for each cluster
  for (const [clusterName] of keywordClusters) {
    assignments.set(clusterName, []);
  }

  // Assign each message to best matching cluster
  for (const msg of messages) {
    const tokens = new Set(filterStopwords(tokenize(msg.content)));

    let bestCluster: string | null = null;
    let maxOverlap = 0;

    for (const [clusterName, keywords] of keywordClusters) {
      // Count how many cluster keywords appear in message
      const overlap = keywords.filter(kw => tokens.has(kw)).length;

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestCluster = clusterName;
      }
    }

    if (bestCluster && maxOverlap > 0) {
      assignments.get(bestCluster)!.push(msg);
    }
  }

  return assignments;
}

/**
 * Find messages matching specific keywords
 */
export function findMessagesByKeywords(
  messages: Message[],
  keywords: string[]
): Message[] {
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

  return messages.filter(msg => {
    const tokens = new Set(filterStopwords(tokenize(msg.content)));

    // Check if any keyword matches
    for (const kw of keywordSet) {
      if (tokens.has(kw)) {
        return true;
      }
    }
    return false;
  });
}
