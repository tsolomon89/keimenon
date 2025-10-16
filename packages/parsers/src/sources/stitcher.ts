import { UserSegment, SourceDoc, ImportConfig, TokenSet } from '../types';
import { tokenize, jaccard, normalizeTitle } from '../utils/fingerprint';
import { nanoid } from 'nanoid';

/**
 * Sources Mode stitching - combines user segments into thematic documents
 */
export class SourcesStitcher {
  constructor(private config: ImportConfig) {}

  /**
   * Build stitched sources from segments
   */
  buildSources(segments: UserSegment[]): SourceDoc[] {
    const { sources_stitch_strategy } = this.config;

    switch (sources_stitch_strategy) {
      case 'by_title':
        return this.stitchByTitle(segments);
      case 'by_chat':
        return this.stitchByChat(segments);
      case 'by_chat_role':
        return this.stitchByChatRole(segments);
      default:
        return this.stitchByTitle(segments);
    }
  }

  /**
   * Strategy: Stitch by title buckets with Jaccard attachment
   * This is the main algorithm from the spec
   */
  private stitchByTitle(segments: UserSegment[]): SourceDoc[] {
    const { sources_cap, similarity_threshold, sources_attach_mode } = this.config;

    // 1. Create title buckets
    const buckets = this.createTitleBuckets(segments);

    // 2. Select top N seeds by total character count
    const seeds = this.selectSeeds(buckets, sources_cap);

    // 3. Prepare token sets for seeds
    const seedTokens: Map<string, TokenSet> = new Map();
    for (const [title, segs] of seeds) {
      const combinedText = segs.map(s => s.content).join('\n');
      seedTokens.set(title, {
        tokens: tokenize(combinedText),
        text: combinedText,
      });
    }

    // 4. Greedy attach remaining segments
    const attachments = this.greedyAttach(
      segments,
      seeds,
      seedTokens,
      similarity_threshold,
      sources_attach_mode === 'unique'
    );

    // 5. Build SourceDoc objects
    const sources: SourceDoc[] = [];
    for (const [title, segmentIds] of attachments) {
      const segs = segments.filter(s => segmentIds.includes(s.segment_id));
      if (segs.length === 0) continue;

      const source = this.createSourceDoc(title, segs);
      sources.push(source);
    }

    // 6. Deduplicate within each source
    return sources.map(src => this.deduplicateSource(src, segments));
  }

  /**
   * Strategy: One source per conversation
   */
  private stitchByChat(segments: UserSegment[]): SourceDoc[] {
    const conversationMap = new Map<string, UserSegment[]>();

    for (const seg of segments) {
      if (!conversationMap.has(seg.conversation_id)) {
        conversationMap.set(seg.conversation_id, []);
      }
      conversationMap.get(seg.conversation_id)!.push(seg);
    }

    const sources: SourceDoc[] = [];
    for (const [_convId, segs] of conversationMap) {
      // Sort by timestamp
      segs.sort((a, b) => a.timestamp - b.timestamp);

      const title = segs[0].original_title;
      const source = this.createSourceDoc(title, segs);
      sources.push(source);
    }

    return sources;
  }

  /**
   * Strategy: One source per conversation × role
   */
  private stitchByChatRole(segments: UserSegment[]): SourceDoc[] {
    const chatRoleMap = new Map<string, UserSegment[]>();

    for (const seg of segments) {
      const key = `${seg.conversation_id}:${seg.role}`;
      if (!chatRoleMap.has(key)) {
        chatRoleMap.set(key, []);
      }
      chatRoleMap.get(key)!.push(seg);
    }

    const sources: SourceDoc[] = [];
    for (const [_key, segs] of chatRoleMap) {
      segs.sort((a, b) => a.timestamp - b.timestamp);

      const title = `${segs[0].original_title} (${segs[0].role})`;
      const source = this.createSourceDoc(title, segs);
      sources.push(source);
    }

    return sources;
  }

  /**
   * Create title buckets from segments
   */
  private createTitleBuckets(segments: UserSegment[]): Map<string, UserSegment[]> {
    const buckets = new Map<string, UserSegment[]>();

    for (const seg of segments) {
      const normalized = normalizeTitle(seg.original_title);
      if (!buckets.has(normalized)) {
        buckets.set(normalized, []);
      }
      buckets.get(normalized)!.push(seg);
    }

    return buckets;
  }

  /**
   * Select top N seeds by total character count
   */
  private selectSeeds(
    buckets: Map<string, UserSegment[]>,
    cap: number
  ): Map<string, UserSegment[]> {
    // Calculate total chars per bucket
    const bucketStats = Array.from(buckets.entries()).map(([title, segs]) => ({
      title,
      segments: segs,
      totalChars: segs.reduce((sum, s) => sum + s.char_count, 0),
    }));

    // Sort by total chars descending
    bucketStats.sort((a, b) => b.totalChars - a.totalChars);

    // Take top N
    const seeds = new Map<string, UserSegment[]>();
    for (let i = 0; i < Math.min(cap, bucketStats.length); i++) {
      seeds.set(bucketStats[i].title, bucketStats[i].segments);
    }

    return seeds;
  }

  /**
   * Greedy attach: attach remaining segments to best-matching seed
   */
  private greedyAttach(
    allSegments: UserSegment[],
    seeds: Map<string, UserSegment[]>,
    seedTokens: Map<string, TokenSet>,
    threshold: number,
    uniqueMode: boolean
  ): Map<string, string[]> {
    const attachments = new Map<string, Set<string>>();

    // Initialize with seed segments
    for (const [title, segs] of seeds) {
      attachments.set(title, new Set(segs.map(s => s.segment_id)));
    }

    // Track which segments have been attached (for unique mode)
    const attachedSegments = new Set<string>();
    for (const segs of seeds.values()) {
      segs.forEach(s => attachedSegments.add(s.segment_id));
    }

    // Try to attach remaining segments
    for (const seg of allSegments) {
      if (attachedSegments.has(seg.segment_id)) continue;

      const segTokens = tokenize(seg.content);
      let bestMatch: { title: string; score: number } | null = null;

      // Find best matching seed
      for (const [title, tokenSet] of seedTokens) {
        const score = jaccard(segTokens, tokenSet.tokens);
        if (score >= threshold) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { title, score };
          }
        }
      }

      if (bestMatch) {
        attachments.get(bestMatch.title)!.add(seg.segment_id);

        if (uniqueMode) {
          attachedSegments.add(seg.segment_id);
        }

        // Update seed tokens with new content (for non-unique mode)
        if (!uniqueMode) {
          const tokenSet = seedTokens.get(bestMatch.title)!;
          const newTokens = tokenize(seg.content);
          tokenSet.tokens = new Set([...tokenSet.tokens, ...newTokens]);
        }
      }
    }

    // Convert Sets to arrays
    return new Map(
      Array.from(attachments.entries()).map(([title, ids]) => [title, Array.from(ids)])
    );
  }

  /**
   * Create SourceDoc from title and segments
   */
  private createSourceDoc(title: string, segments: UserSegment[]): SourceDoc {
    // Sort by timestamp
    const sorted = [...segments].sort((a, b) => a.timestamp - b.timestamp);

    const totalChars = sorted.reduce((sum, s) => sum + s.char_count, 0);
    const timestamps = sorted.map(s => s.timestamp);

    // Build provenance
    const provenanceMap = new Map<string, {
      conversation_id: string;
      indices: number[];
      timestamps: number[];
      original_title: string;
    }>();

    for (const seg of sorted) {
      if (!provenanceMap.has(seg.conversation_id)) {
        provenanceMap.set(seg.conversation_id, {
          conversation_id: seg.conversation_id,
          indices: [],
          timestamps: [],
          original_title: seg.original_title,
        });
      }

      const prov = provenanceMap.get(seg.conversation_id)!;
      prov.indices.push(seg.message_idx_start);
      if (seg.message_idx_end !== seg.message_idx_start) {
        prov.indices.push(seg.message_idx_end);
      }
      prov.timestamps.push(seg.timestamp);
    }

    const provenance = Array.from(provenanceMap.values()).map(p => ({
      conversation_id: p.conversation_id,
      message_idx_start: Math.min(...p.indices),
      message_idx_end: Math.max(...p.indices),
      timestamp_min: Math.min(...p.timestamps),
      timestamp_max: Math.max(...p.timestamps),
      original_title: p.original_title,
    }));

    // Build markdown content
    const content_markdown = this.renderMarkdown(title, sorted);

    return {
      source_id: `srcdoc_${nanoid()}`,
      canonical_title: title,
      content_markdown,
      segments: sorted.map(s => s.segment_id),
      n_segments: sorted.length,
      n_chars: totalChars,
      created_ts_min: Math.min(...timestamps),
      created_ts_max: Math.max(...timestamps),
      provenance,
    };
  }

  /**
   * Render SourceDoc as Markdown
   */
  private renderMarkdown(title: string, segments: UserSegment[]): string {
    const lines: string[] = [];

    // Title
    lines.push(`# ${title}\n`);

    // Content
    for (const seg of segments) {
      if (seg.role === 'assistant' && this.config.include_assistant_context) {
        lines.push(`> ${seg.content.replace(/\n/g, '\n> ')}\n`);
      } else {
        lines.push(seg.content);
        lines.push('');
      }
    }

    lines.push('---\n');
    lines.push('## Provenance\n');

    // Group by conversation
    const convGroups = new Map<string, UserSegment[]>();
    for (const seg of segments) {
      if (!convGroups.has(seg.conversation_id)) {
        convGroups.set(seg.conversation_id, []);
      }
      convGroups.get(seg.conversation_id)!.push(seg);
    }

    for (const [_convId, segs] of convGroups) {
      const indices = segs.flatMap(s => [s.message_idx_start, s.message_idx_end]);
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      const title = segs[0].original_title;

      lines.push(`- **${title}**: messages ${minIdx}–${maxIdx}`);
    }

    return lines.join('\n');
  }

  /**
   * Deduplicate segments within a source (near-dup by Jaccard)
   */
  private deduplicateSource(source: SourceDoc, allSegments: UserSegment[]): SourceDoc {
    const segments = allSegments.filter(s => source.segments.includes(s.segment_id));

    // Keep track of which to keep
    const keep: UserSegment[] = [];
    const seen: Set<string> = new Set();

    for (const seg of segments) {
      // Check exact hash
      if (seen.has(seg.hash)) continue;

      // Check near-dup with kept segments
      let isDuplicate = false;
      const segTokens = tokenize(seg.content);

      for (const kept of keep) {
        const keptTokens = tokenize(kept.content);
        const similarity = jaccard(segTokens, keptTokens);

        if (similarity >= 0.9) {
          // Near-duplicate - keep longer one
          if (seg.char_count > kept.char_count) {
            // Replace kept with this segment
            const idx = keep.indexOf(kept);
            keep[idx] = seg;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        keep.push(seg);
        seen.add(seg.hash);
      }
    }

    // Rebuild source with deduplicated segments
    return this.createSourceDoc(source.canonical_title, keep);
  }
}
