import { describe, it, expect } from 'vitest';
import { ContentExtractorService } from '../content-extractor';

describe('ContentExtractorService', () => {
  const service = new ContentExtractorService();

  describe('extract', () => {
    it('should extract title from HTML', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Article | Example Site</title></head>
          <body>
            <article>
              <h1>Main Heading</h1>
              <p>This is the article content with multiple sentences. It should be extracted properly.</p>
            </article>
          </body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/article');

      expect(result.title).toBeDefined();
      expect(result.textContent).toContain('article content');
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.charCount).toBeGreaterThan(0);
    });

    it('should extract Open Graph metadata', () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta property="og:title" content="OG Title">
            <meta property="og:site_name" content="Example Blog">
            <meta name="author" content="John Doe">
            <meta property="article:published_time" content="2024-01-15T10:00:00Z">
          </head>
          <body>
            <article>
              <p>Article body text here.</p>
            </article>
          </body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/blog/post');

      expect(result.siteName).toBe('Example Blog');
      expect(result.author).toBe('John Doe');
      expect(result.publishedDate).toBe('2024-01-15T10:00:00Z');
      expect(result.language).toBe('en');
    });

    it('should extract code blocks with language detection', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <article>
              <h1>Tutorial</h1>
              <p>Here is some code:</p>
              <pre><code class="language-javascript">
function hello() {
  console.log('Hello, World!');
}
              </code></pre>
              <pre><code class="python">
def greet():
    print("Hello")
              </code></pre>
            </article>
          </body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/tutorial');

      expect(result.codeBlocks.length).toBeGreaterThanOrEqual(1);
      const jsBlock = result.codeBlocks.find((b) => b.language === 'javascript');
      expect(jsBlock).toBeDefined();
      expect(jsBlock?.code).toContain('console.log');
    });

    it('should extract image URLs', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <article>
              <img src="/images/photo1.jpg" alt="Photo 1">
              <img src="https://cdn.example.com/photo2.png" alt="Photo 2">
              <img src="data:image/gif;base64,R0lGOD" alt="Data URI - should be skipped">
            </article>
          </body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/gallery');

      // Should have 2 images (data URI should be skipped)
      expect(result.imageUrls).toContain('https://example.com/images/photo1.jpg');
      expect(result.imageUrls).toContain('https://cdn.example.com/photo2.png');
      expect(result.imageUrls.some((u) => u.startsWith('data:'))).toBe(false);
    });

    it('should generate excerpt from long content', () => {
      const longText = 'This is a very long article. '.repeat(50);
      const html = `
        <!DOCTYPE html>
        <html>
          <body><article><p>${longText}</p></article></body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/long');

      expect(result.excerpt.length).toBeLessThanOrEqual(210); // 200 + "..."
      expect(result.excerpt.endsWith('...')).toBe(true);
    });

    it('should count words correctly', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <article>
              <p>One two three four five.</p>
              <p>Six seven eight nine ten.</p>
            </article>
          </body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/count');

      // Should have at least 10 words
      expect(result.wordCount).toBeGreaterThanOrEqual(10);
    });

    it('should handle HTML with no readable content gracefully', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Empty Page</title></head>
          <body>
            <nav>Navigation only</nav>
            <script>console.log('script');</script>
          </body>
        </html>
      `;

      const result = service.extract(html, 'https://example.com/empty');

      // Should not throw, should return some result
      expect(result.title).toBeDefined();
      expect(result.textContent).toBeDefined();
    });
  });

  describe('toMarkdown', () => {
    it('should generate markdown with frontmatter', () => {
      const content = {
        title: 'Test Article',
        textContent: 'This is the article body.',
        excerpt: 'This is the article...',
        author: 'Jane Doe',
        publishedDate: '2024-01-15',
        siteName: 'Example Blog',
        imageUrls: [],
        codeBlocks: [],
        wordCount: 5,
        charCount: 26,
        language: 'en',
      };

      const markdown = service.toMarkdown(content, 'https://example.com/article');

      expect(markdown).toContain('---');
      expect(markdown).toContain('title: "Test Article"');
      expect(markdown).toContain('url: https://example.com/article');
      expect(markdown).toContain('author: "Jane Doe"');
      expect(markdown).toContain('# Test Article');
      expect(markdown).toContain('This is the article body.');
    });

    it('should include code blocks in markdown', () => {
      const content = {
        title: 'Code Tutorial',
        textContent: 'Tutorial text.',
        excerpt: 'Tutorial...',
        author: null,
        publishedDate: null,
        siteName: null,
        imageUrls: [],
        codeBlocks: [
          { language: 'javascript', code: 'const x = 1;' },
          { language: null, code: 'unknown language code' },
        ],
        wordCount: 2,
        charCount: 14,
        language: null,
      };

      const markdown = service.toMarkdown(content, 'https://example.com/tutorial');

      expect(markdown).toContain('## Code Blocks');
      expect(markdown).toContain('```javascript');
      expect(markdown).toContain('const x = 1;');
      expect(markdown).toContain('```');
    });

    it('should escape quotes in title', () => {
      const content = {
        title: 'Article with "quotes" in title',
        textContent: 'Body text.',
        excerpt: 'Body...',
        author: null,
        publishedDate: null,
        siteName: null,
        imageUrls: [],
        codeBlocks: [],
        wordCount: 2,
        charCount: 10,
        language: null,
      };

      const markdown = service.toMarkdown(content, 'https://example.com/quoted');

      // Quotes should be escaped in YAML frontmatter
      expect(markdown).toContain('title: "Article with \\"quotes\\" in title"');
    });
  });

  describe('configuration', () => {
    it('should respect extractCodeBlocks option', () => {
      const serviceNoCode = new ContentExtractorService({ extractCodeBlocks: false });
      const html = `
        <html><body>
          <pre><code class="javascript">const x = 1;</code></pre>
        </body></html>
      `;

      const result = serviceNoCode.extract(html, 'https://example.com');
      expect(result.codeBlocks).toHaveLength(0);
    });

    it('should respect extractImages option', () => {
      const serviceNoImages = new ContentExtractorService({ extractImages: false });
      const html = `
        <html><body>
          <img src="photo.jpg">
        </body></html>
      `;

      const result = serviceNoImages.extract(html, 'https://example.com');
      expect(result.imageUrls).toHaveLength(0);
    });

    it('should respect maxExcerptLength option', () => {
      const serviceShortExcerpt = new ContentExtractorService({ maxExcerptLength: 50 });
      const html = `
        <html><body>
          <article><p>${'word '.repeat(100)}</p></article>
        </body></html>
      `;

      const result = serviceShortExcerpt.extract(html, 'https://example.com');
      expect(result.excerpt.length).toBeLessThanOrEqual(60); // 50 + "..."
    });
  });
});
