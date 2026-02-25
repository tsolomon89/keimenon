/**
 * LSH Service (Locality Sensitive Hashing)
 * 
 * Implements MinHash with Banding for O(1) duplicate candidate lookup.
 * 
 * Configuration:
 * - Permutations: 128 (standard for high recall)
 * - Bands: 16
 * - Rows per Band: 8
 * 
 * Probability of collision (s = Jaccard similarity):
 * P(candidate) = 1 - (1 - s^r)^b
 * with r=8, b=16:
 * s=0.5 -> P ~= 0.05 (Low)
 * s=0.7 -> P ~= 0.86 (High)
 * s=0.8 -> P ~= 0.99 (Very High)
 */

import crypto from 'crypto';

export class LSHService {
  private readonly numPermutations = 128;
  private readonly numBands = 16;
  private readonly rowsPerBand = 8;
  private readonly prime = 4294967311; // 32-bit prime
  private permA: number[];
  private permB: number[];

  constructor() {
    // Initialize random permutations (stable seed needed for consistency across restarts?)
    //Ideally we persist these coefficients, but for now we generate them deterministically
    // based on a fixed seed logic or just random if persistence isn't an issue across restarts.
    // For a distributed system, these MUST be constant. 
    // We will use a pseudo-random generator seeded with indices to be consistent.
    
    this.permA = new Array(this.numPermutations);
    this.permB = new Array(this.numPermutations);
    
    this.initPermutations();
  }

  /**
   * Initialize permutation coefficients a * x + b mod p
   * We use a stable generation strategy so restarting the server doesn't invalidate old signatures.
   */
  private initPermutations() {
    // Simple LCG or similar to generate "random" but deterministic coefficients based on index
    for (let i = 0; i < this.numPermutations; i++) {
      // These are arbitrary but fixed constants mixed with i
      this.permA[i] = (i * 1337 + 12345) % this.prime; 
      // Ensure 'a' is odd/not 0 for better distribution
      if (this.permA[i] % 2 === 0) this.permA[i] += 1;

      this.permB[i] = (i * 54321 + 67890) % this.prime;
    }
  }

  /**
   * Generate MinHash signature for a set of tokens (shingles)
   * The set should be 32-bit integer hashes of the tokens (e.g. CRC32 or Murmur3)
   * But for simplicity here we take strings and hash them internally.
   */
  generateMinHashSignature(tokens: string[]): number[] {
    const signature = new Array(this.numPermutations).fill(Infinity);
    
    for (const token of tokens) {
      // Hash string to 32-bit integer
      const rawHash = this.fnv32a(token);
      
      for (let i = 0; i < this.numPermutations; i++) {
        // h_i(x) = (a_i * x + b_i) mod p
        const hashVal = ((this.permA[i] * rawHash + this.permB[i]) % this.prime);
        
        if (hashVal < signature[i]) {
          signature[i] = hashVal;
        }
      }
    }
    
    return signature;
  }

  /**
   * Split signature into bands and return locality-sensitive hash keys
   * Returns array of keys: "bandIndex:bandHash"
   */
  generateLSHKeys(signature: number[]): string[] {
    const keys: string[] = [];
    
    for (let b = 0; b < this.numBands; b++) {
      const start = b * this.rowsPerBand;
      const end = start + this.rowsPerBand;
      const band = signature.slice(start, end);
      
      // Hash the band to a string key
      // "b<band_index>:<hex_hash_of_band_values>"
      const bandHash = crypto.createHash('md5').update(band.join(',')).digest('hex').substring(0, 16);
      keys.push(`b${b}:${bandHash}`);
    }
    
    return keys;
  }

  /**
   * Calculate Jaccard similarity estimation from two MinHash signatures
   */
  estimateSimilarity(sig1: number[], sig2: number[]): number {
    if (sig1.length !== sig2.length) return 0;
    
    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) {
        matches++;
      }
    }
    
    return matches / sig1.length;
  }

  /**
   * FNV-1a 32-bit hash implementation
   */
  private fnv32a(str: string): number {
    let hval = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hval ^= str.charCodeAt(i);
      hval = (hval * 0x01000193) >>> 0;
    }
    return hval >>> 0;
  }
}
