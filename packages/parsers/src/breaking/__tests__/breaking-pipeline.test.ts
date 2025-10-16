/**
 * Tests for the breaking pipeline
 *
 * Tests multi-level text decomposition: Token → Phrase → Sentence → Block → Section
 */

import { extractBlocks } from '../blocker';
import { extractSentences } from '../sentencer';
import { extractPhrases } from '../phraser';
import { tokenize } from '../tokenizer';
import { extractSections, generateStructuralSignature } from '../sectioner';
import { generateContentSignature } from '../signature-generator';

const sampleMarkdown = `# Introduction

This is a sample document with multiple sections.

## Features

The breaking pipeline provides:
- Token extraction
- Phrase detection
- Sentence boundaries

\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`

## Conclusion

This demonstrates the multi-level breaking system.
`;

describe('Breaking Pipeline', () => {
  describe('Tokenizer', () => {
    it('should tokenize prose', () => {
      const text = 'Hello, world! This is a test.';
      const tokens = tokenize(text);

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].text).toBe('Hello');
      expect(tokens[0].type).toBe('word');
    });

    it('should tokenize code', () => {
      const code = 'const x = 42;';
      const tokens = tokenize(code, { language: 'code' });

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some(t => t.text === 'const')).toBe(true);
    });

    it('should preserve byte offsets', () => {
      const text = 'Hello world';
      const tokens = tokenize(text);

      expect(tokens[0].start).toBe(0);
      expect(tokens[0].end).toBeGreaterThan(0);
    });
  });

  describe('Phraser', () => {
    it('should extract n-grams', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const phrases = extractPhrases(text, { minTokens: 2, maxTokens: 3 });

      expect(phrases.length).toBeGreaterThan(0);
      expect(phrases.some(p => p.text.includes('quick brown'))).toBe(true);
    });

    it('should extract shingles for short text', () => {
      const text = 'Hello';
      const phrases = extractPhrases(text, { useShingles: true });

      expect(phrases.length).toBeGreaterThan(0);
    });
  });

  describe('Sentencer', () => {
    it('should extract sentences', () => {
      const text = 'First sentence. Second sentence! Third sentence?';
      const sentences = extractSentences(text);

      expect(sentences).toHaveLength(3);
      expect(sentences[0].text).toContain('First sentence');
      expect(sentences[1].text).toContain('Second sentence');
      expect(sentences[2].text).toContain('Third sentence');
    });

    it('should handle abbreviations', () => {
      const text = 'Dr. Smith went to the store. He bought milk.';
      const sentences = extractSentences(text);

      // Should not split on "Dr."
      expect(sentences.length).toBeLessThanOrEqual(2);
    });

    it('should not split code', () => {
      const code = 'const x = 42; const y = 3.14;';
      const sentences = extractSentences(code);

      // Code should be treated as single unit
      expect(sentences).toHaveLength(1);
    });
  });

  describe('Blocker', () => {
    it('should extract paragraphs', () => {
      const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
      const blocks = extractBlocks(text);

      expect(blocks.length).toBeGreaterThanOrEqual(3);
      expect(blocks[0].type).toBe('paragraph');
    });

    it('should detect code fences', () => {
      const blocks = extractBlocks(sampleMarkdown);

      const codeBlocks = blocks.filter(b => b.type === 'code_fence');
      expect(codeBlocks.length).toBeGreaterThan(0);
    });

    it('should detect lists', () => {
      const text = '- Item 1\n- Item 2\n- Item 3';
      const blocks = extractBlocks(text);

      const listBlocks = blocks.filter(b => b.type === 'list');
      expect(listBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Sectioner', () => {
    it('should extract section hierarchy', () => {
      const sections = extractSections(sampleMarkdown);

      expect(sections.length).toBeGreaterThan(0);

      // Should have headings
      const headings = sections.filter(s => s.type === 'heading');
      expect(headings.length).toBeGreaterThanOrEqual(3);
    });

    it('should build structural paths', () => {
      const sections = extractSections(sampleMarkdown);
      const headings = sections.filter(s => s.type === 'heading');

      // First heading should have simple path
      expect(headings[0].path).toContain('h1[0]');

      // Second heading should be nested
      expect(headings[1].path).toContain('|');
    });

    it('should generate structural signatures', () => {
      const sections = extractSections(sampleMarkdown);
      const signature = generateStructuralSignature(sections, sections[0].id);

      expect(signature).toBeTruthy();
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  describe('Signature Generator', () => {
    it('should generate complete signature', () => {
      const text = 'This is a sample paragraph for signature generation.';
      const signature = generateContentSignature(
        text,
        0,
        Buffer.byteLength(text, 'utf8'),
        'paragraph',
        sampleMarkdown
      );

      expect(signature.contentId).toBeTruthy();
      expect(signature.structural).toBeTruthy();
      expect(signature.minHash).toBeTruthy();
      expect(signature.minHash.hashes.length).toBe(128);
    });

    it('should generate token sketch for code', () => {
      const code = 'function hello() { return 42; }';
      const signature = generateContentSignature(
        code,
        0,
        Buffer.byteLength(code, 'utf8'),
        'block',
        code,
        { modality: 'code' }
      );

      expect(signature.tokenSketch).toBeTruthy();
      expect(signature.tokenSketch!.sketch.length).toBeGreaterThan(0);
    });

    it('should generate TF-IDF for prose', () => {
      const prose = 'The quick brown fox jumps over the lazy dog. The dog was very lazy.';
      const signature = generateContentSignature(
        prose,
        0,
        Buffer.byteLength(prose, 'utf8'),
        'paragraph',
        prose,
        { modality: 'prose' }
      );

      expect(signature.tfIdf).toBeTruthy();
      expect(signature.tfIdf!.totalTerms).toBeGreaterThan(0);
    });
  });

  describe('Integration: Full Pipeline', () => {
    it('should process document at all levels', () => {
      // Section level
      const sections = extractSections(sampleMarkdown);
      expect(sections.length).toBeGreaterThan(0);

      // Block level
      const blocks = extractBlocks(sampleMarkdown);
      expect(blocks.length).toBeGreaterThan(0);

      // Sentence level (on first paragraph)
      const firstParagraph = blocks.find(b => b.type === 'paragraph');
      if (firstParagraph) {
        const sentences = extractSentences(firstParagraph.text);
        expect(sentences.length).toBeGreaterThan(0);
      }

      // Token level
      const tokens = tokenize(sampleMarkdown);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should maintain byte offset consistency', () => {
      const blocks = extractBlocks(sampleMarkdown);

      // Byte offsets should be valid
      for (const block of blocks) {
        expect(block.start).toBeGreaterThanOrEqual(0);
        expect(block.end).toBeGreaterThan(block.start);
        expect(block.end).toBeLessThanOrEqual(Buffer.byteLength(sampleMarkdown, 'utf8'));
      }
    });
  });
});
