/**
 * Signature Service
 * 
 * Coordinates the generation of multi-modal signatures for content:
 * 1. MinHash (LSH) - For near-duplicate detection (high recall)
 * 2. Semantic (TF/Keywords) - For clustering and topic modeling
 * 3. Structural (Code Sketches) - For code block similarity
 * 
 * usage:
 * const signatures = signatureService.generateSignatures(text);
 */

import { TokenizerService } from './tokenizer-service';
import { LSHService } from './lsh-service';
import { createHash } from 'crypto';

export interface ContentSignatures {
  minHash: number[];
  lshKeys: string[];
  semanticVector: Map<string, number>; // Term Frequency for now
  codeSketch?: string; // Hash of code structure if present
}

export class SignatureService {
  private tokenizer: TokenizerService;
  private lsh: LSHService;

  constructor() {
    this.tokenizer = new TokenizerService();
    this.lsh = new LSHService();
  }

  /**
   * Generate all signatures for a given text
   */
  generateSignatures(text: string): ContentSignatures {
    // 1. Tokenize
    const tokens = this.tokenizer.tokenize(text);
    
    // 2. Generate MinHash and LSH Keys
    // We use 3-grams (shingles) for MinHash to capture local context
    const shingles = this.generateShingles(tokens, 3);
    const minHash = this.lsh.generateMinHashSignature(shingles); // Pass shingles directly, LSHService hashes them
    const lshKeys = this.lsh.generateLSHKeys(minHash);

    // 3. Generate Semantic Vector (Term Frequency)
    const semanticVector = new Map<string, number>();
    const totalTokens = tokens.length;
    for (const token of tokens) {
      semanticVector.set(token, (semanticVector.get(token) || 0) + 1);
    }
    // Normalize TF
    if (totalTokens > 0) {
        for (const [term, count] of semanticVector) {
            semanticVector.set(term, count / totalTokens);
        }
    }

    // 4. Generate Code Sketch (if applicable)
    // Extract code blocks, remove comments/whitespace, hash structure
    const { code } = this.tokenizer.extractCodeBlocks(text);
    let codeSketch: string | undefined;
    
    if (code.length > 0) {
      // Simple sketch: Concatenate all code, strip non-structural chars, hash
      const combinedCode = code.join('\n');
      const structure = combinedCode
        .replace(/\/\/.*$/gm, '') // Remove single line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .replace(/\s+/g, '') // Remove all whitespace
        .replace(/["'`].*?["'`]/g, '""'); // Normalize strings
      
      codeSketch = createHash('sha256').update(structure).digest('hex');
    }

    return {
      minHash,
      lshKeys,
      semanticVector,
      codeSketch
    };
  }

  /**
   * Helper to generate n-grams (shingles) from tokens
   */
  private generateShingles(tokens: string[], n: number): string[] {
    if (tokens.length < n) return tokens; // Fallback for short text
    
    const shingles: string[] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
        shingles.push(tokens.slice(i, i + n).join(' '));
    }
    return shingles;
  }
}
