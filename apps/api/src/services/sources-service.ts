/**
 * Sources Service
 * 
 * Implements "Sources Mode":
 * 1. Filter conversation messages by role (User/Assistant/Both).
 * 2. Stich "Segments" (consecutive messages or by time/topic).
 * 3. Generate "SourceDocs" (Markdown files) representing the "Authentic User".
 * 4. Deduplicate segments using LSH/Exact matching.
 */

import { ConversationChunk } from './streaming-json-parser-v2';
import { TokenizerService } from './tokenizer-service';
import { LSHService } from './lsh-service';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface SourcesConfig {
  outputDir: string;
  roleSubset: 'user' | 'assistant' | 'both';
  minChars: number;
  stitchStrategy: 'by_title' | 'by_chat'; 
  maxSourceDocs: number; 
  similarityThreshold?: number; // 0.0 - 1.0 (default 0.85)
}

export interface SourceDoc {
  id: string;
  title: string;
  content: string; // Markdown content
  segments: SourceSegment[];
  stats: {
    charCount: number;
    segmentCount: number;
  };
}

export interface SourceSegment {
  content: string;
  role: string;
  conversationId: string;
  messageId: string;
  timestamp?: string;
  signature?: number[];
}

export class SourcesService {
  private tokenizer: TokenizerService;
  private lsh: LSHService;
  private config: SourcesConfig;
  
  // LSH Indexing State
  private lshBuckets: Map<string, Set<string>> = new Map(); // bandKey -> Set<segmentId>
  private segmentSignatures: Map<string, number[]> = new Map(); // segmentId -> signature
  private segmentMap: Map<string, SourceSegment> = new Map(); // segmentId -> segment

  // State for aggregation (if by_title)
  private titleBuckets: Map<string, SourceSegment[]> = new Map();
  private processedHashes: Set<string> = new Set(); // content_hash -> seen

  constructor(config: SourcesConfig) {
    this.config = config;
    this.tokenizer = new TokenizerService();
    this.lsh = new LSHService();
  }

  /**
   * Process a batch of conversations
   */
  processBatch(conversations: ConversationChunk[]) {
    for (const conv of conversations) {
      this.extractSegments(conv);
    }
  }

  /**
   * Finalize and write SourceDocs to disk
   */
  async flush(): Promise<void> {
    const docs = this.buildSourceDocs();
    
    // Ensure output dir exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Write docs
    for (const doc of docs) {
      const filename = `${this.sanitizeFilename(doc.title)}.md`;
      const filepath = path.join(this.config.outputDir, filename);
      
      const fileContent = this.renderMarkdown(doc);
      await fs.promises.writeFile(filepath, fileContent, 'utf-8');
    }
  }

  private extractSegments(conv: ConversationChunk) {
    for (const msg of conv.messages) {
      const role = msg.role === 'model' ? 'assistant' : msg.role; // Normalize Gemini 'model'
      
      // Filter by role
      if (this.config.roleSubset !== 'both' && role !== this.config.roleSubset) {
        continue;
      }

      // Check min length
      if (msg.content.length < this.config.minChars) {
        continue;
      }

      // 1. Exact Dedupe
      const hash = this.hashContent(msg.content);
      if (this.processedHashes.has(hash)) {
         // Log duplicate?
         continue; 
      }
      this.processedHashes.add(hash);

      const segmentId = `${conv.id}_${msg.metadata?.id || 'unknown'}_${Date.now()}`;

      // 2. Near-Duplicate Check (LSH)
      const tokens = this.tokenizer.tokenize(msg.content);
      const signature = this.lsh.generateMinHashSignature(tokens);
      
      // Check for candidates
      const candidates = this.findLSHCandidates(signature);
      let isDuplicate = false;

      for (const candidateId of candidates) {
        const candidateSig = this.segmentSignatures.get(candidateId);
        if (candidateSig) {
          const similarity = this.lsh.estimateSimilarity(signature, candidateSig);
          if (similarity >= (this.config.similarityThreshold || 0.85)) {
             // Found near-duplicate
             isDuplicate = true;
             // We could mark it or link it, but for "Sources Mode" we usually skip duplicates 
             // or defer to Review. For now, we skip to keep SourceIndex clean.
             break;
          }
        }
      }

      if (isDuplicate) {
        continue;
      }

      // Add to LSH Index
      this.indexSegmentLSH(segmentId, signature);
      this.segmentSignatures.set(segmentId, signature);

      const segment: SourceSegment = {
        content: msg.content,
        role: role,
        conversationId: conv.id,
        messageId: msg.metadata?.id || 'unknown',
        timestamp: msg.timestamp,
        signature // Store for debugging/verification
      };
      
      this.segmentMap.set(segmentId, segment);

      // Bucket strategy
      const bucketKey = this.config.stitchStrategy === 'by_chat' 
        ? conv.title 
        : this.normalizeTitle(conv.title);

      if (!this.titleBuckets.has(bucketKey)) {
        this.titleBuckets.set(bucketKey, []);
      }
      this.titleBuckets.get(bucketKey)!.push(segment);
    }
  }

  private findLSHCandidates(signature: number[]): Set<string> {
    const candidates = new Set<string>();
    const keys = this.lsh.generateLSHKeys(signature);
    
    for (const key of keys) {
      if (this.lshBuckets.has(key)) {
        for (const id of this.lshBuckets.get(key)!) {
          candidates.add(id);
        }
      }
    }
    
    return candidates;
  }

  private indexSegmentLSH(segmentId: string, signature: number[]) {
    const keys = this.lsh.generateLSHKeys(signature);
    for (const key of keys) {
      if (!this.lshBuckets.has(key)) {
        this.lshBuckets.set(key, new Set());
      }
      this.lshBuckets.get(key)!.add(segmentId);
    }
  }

  private buildSourceDocs(): SourceDoc[] {
    const docs: SourceDoc[] = [];
    
    const sortedBuckets = Array.from(this.titleBuckets.entries())
      .map(([title, segments]) => ({
        title,
        segments,
        totalChars: segments.reduce((acc, s) => acc + s.content.length, 0)
      }))
      .sort((a, b) => b.totalChars - a.totalChars); 
      
    const limitedBuckets = sortedBuckets.slice(0, this.config.maxSourceDocs);
    
    for (const bucket of limitedBuckets) {
      bucket.segments.sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

      docs.push({
        id: `src_${this.hashContent(bucket.title).substring(0, 8)}`,
        title: bucket.title,
        content: '', 
        segments: bucket.segments,
        stats: {
          charCount: bucket.totalChars,
          segmentCount: bucket.segments.length
        }
      });
    }

    return docs;
  }

  private renderMarkdown(doc: SourceDoc): string {
    let md = `# ${doc.title}\n\n`;
    
    if (this.config.roleSubset === 'both') {
       md += `> Mixed User/Assistant Source\n\n`;
    }

    for (const seg of doc.segments) {
      md += `### ${seg.timestamp ? new Date(seg.timestamp).toISOString() : 'Unknown Time'}\n`;
      md += `${seg.content}\n\n`;
      md += `---\n`; 
      md += `_Provenance: ${seg.conversationId} / ${seg.messageId}_\n\n`;
    }

    return md;
  }

  private normalizeTitle(title: string): string {
    return title.trim().toLowerCase().replace(/[^\w\s]/g, '');
  }

  private sanitizeFilename(title: string): string {
    return title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
