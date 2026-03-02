import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

/**
 * Content Extractor Service
 *
 * Extracts readable content from HTML using Mozilla Readability.
 * Also extracts metadata, code blocks, and calculates content statistics.
 */

export interface ExtractedContent {
  title: string;
  textContent: string;
  excerpt: string;
  author: string | null;
  publishedDate: string | null;
  siteName: string | null;
  imageUrls: string[];
  codeBlocks: CodeBlock[];
  wordCount: number;
  charCount: number;
  language: string | null;
}

export interface CodeBlock {
  language: string | null;
  code: string;
}

export interface ExtractionOptions {
  extractCodeBlocks?: boolean;
  extractImages?: boolean;
  maxExcerptLength?: number;
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  extractCodeBlocks: true,
  extractImages: true,
  maxExcerptLength: 200,
};

export class ContentExtractorService {
  private options: ExtractionOptions;

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Extract readable content from HTML
   */
  extract(html: string, url: string): ExtractedContent {
    // Parse HTML with JSDOM
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // Extract code blocks before Readability processes them
    const codeBlocks = this.options.extractCodeBlocks ? this.extractCodeBlocks(document) : [];

    // Extract images
    const imageUrls = this.options.extractImages ? this.extractImageUrls(document, url) : [];

    // Extract metadata from meta tags
    const metadata = this.extractMetadata(document);

    // Use Readability to extract main content
    const reader = new Readability(document, {
      charThreshold: 100,
    });
    const article = reader.parse();

    // Fallback if Readability fails
    const title = article?.title || metadata.title || this.extractTitleFallback(document);
    const textContent = article?.textContent || this.extractTextFallback(document);
    const excerpt = this.generateExcerpt(textContent, this.options.maxExcerptLength!);

    // Calculate statistics
    const wordCount = this.countWords(textContent);
    const charCount = textContent.length;

    return {
      title,
      textContent,
      excerpt,
      author: metadata.author,
      publishedDate: metadata.publishedDate,
      siteName: metadata.siteName,
      imageUrls,
      codeBlocks,
      wordCount,
      charCount,
      language: metadata.language,
    };
  }

  /**
   * Extract code blocks from the document
   */
  private extractCodeBlocks(document: Document): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const codeElements = document.querySelectorAll('pre code, pre');

    codeElements.forEach((element) => {
      const code = element.textContent?.trim();
      if (!code || code.length < 10) return; // Skip very short snippets

      // Try to detect language from class names
      let language: string | null = null;
      const classList = element.className.split(/\s+/);
      for (const cls of classList) {
        if (cls.startsWith('language-') || cls.startsWith('lang-')) {
          language = cls.replace(/^(language-|lang-)/, '');
          break;
        }
        // Common class patterns
        if (
          [
            'javascript',
            'typescript',
            'python',
            'java',
            'cpp',
            'csharp',
            'ruby',
            'go',
            'rust',
            'sql',
            'bash',
            'shell',
            'html',
            'css',
            'json',
            'yaml',
            'xml',
          ].includes(cls.toLowerCase())
        ) {
          language = cls.toLowerCase();
          break;
        }
      }

      // Check data attributes
      if (!language) {
        const dataLang = element.getAttribute('data-language') || element.getAttribute('data-lang');
        if (dataLang) language = dataLang;
      }

      blocks.push({ language, code });
    });

    return blocks;
  }

  /**
   * Extract image URLs from the document
   */
  private extractImageUrls(document: Document, baseUrl: string): string[] {
    const urls: string[] = [];
    const images = document.querySelectorAll('img[src]');

    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (!src) return;

      try {
        // Resolve relative URLs
        const absoluteUrl = new URL(src, baseUrl).toString();

        // Skip data URIs and very small images (likely icons)
        if (absoluteUrl.startsWith('data:')) return;

        urls.push(absoluteUrl);
      } catch {
        // Ignore invalid URLs
      }
    });

    return [...new Set(urls)]; // Deduplicate
  }

  /**
   * Extract metadata from meta tags and Open Graph
   */
  private extractMetadata(document: Document): {
    title: string | null;
    author: string | null;
    publishedDate: string | null;
    siteName: string | null;
    language: string | null;
  } {
    const getMeta = (selectors: string[]): string | null => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        const content = el?.getAttribute('content') || el?.textContent;
        if (content?.trim()) return content.trim();
      }
      return null;
    };

    return {
      title: getMeta([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]',
      ]),
      author: getMeta([
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="twitter:creator"]',
      ]),
      publishedDate: getMeta([
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
        'meta[property="og:published_time"]',
        'time[datetime]',
      ]),
      siteName: getMeta(['meta[property="og:site_name"]', 'meta[name="application-name"]']),
      language:
        document.documentElement.getAttribute('lang') ||
        getMeta(['meta[http-equiv="content-language"]']),
    };
  }

  /**
   * Fallback title extraction when Readability fails
   */
  private extractTitleFallback(document: Document): string {
    const titleEl = document.querySelector('title');
    if (titleEl?.textContent) {
      // Clean up common title patterns like "Article Title | Site Name"
      return titleEl.textContent.split(/[|\-–—]/)[0].trim();
    }

    const h1 = document.querySelector('h1');
    if (h1?.textContent) {
      return h1.textContent.trim();
    }

    return 'Untitled';
  }

  /**
   * Fallback text extraction when Readability fails
   */
  private extractTextFallback(document: Document): string {
    // Remove script, style, nav, header, footer elements
    const elementsToRemove = document.querySelectorAll(
      'script, style, nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]'
    );
    elementsToRemove.forEach((el) => el.remove());

    // Get text from body or main
    const main = document.querySelector('main, article, [role="main"]');
    const container = main || document.body;

    return container?.textContent?.trim() || '';
  }

  /**
   * Generate excerpt from text content
   */
  private generateExcerpt(text: string, maxLength: number): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    // Find word boundary
    const truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const excerpt = lastSpace > maxLength * 0.8 ? truncated.slice(0, lastSpace) : truncated;

    return excerpt + '...';
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0);
    return words.length;
  }

  /**
   * Convert extracted content to Markdown
   */
  toMarkdown(content: ExtractedContent, url: string): string {
    const lines: string[] = [];

    // YAML frontmatter for metadata
    lines.push('---');
    lines.push(`title: "${content.title.replace(/"/g, '\\"')}"`);
    lines.push(`url: ${url}`);
    if (content.author) lines.push(`author: "${content.author}"`);
    if (content.publishedDate) lines.push(`published: ${content.publishedDate}`);
    if (content.siteName) lines.push(`site: "${content.siteName}"`);
    lines.push(`wordCount: ${content.wordCount}`);
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${content.title}`);
    lines.push('');

    // Source reference
    lines.push(`> Source: [${url}](${url})`);
    lines.push('');

    // Main content
    lines.push(content.textContent);
    lines.push('');

    // Code blocks if any
    if (content.codeBlocks.length > 0) {
      lines.push('## Code Blocks');
      lines.push('');
      content.codeBlocks.forEach((block, index) => {
        lines.push(`### Code Block ${index + 1}`);
        lines.push('');
        lines.push('```' + (block.language || ''));
        lines.push(block.code);
        lines.push('```');
        lines.push('');
      });
    }

    return lines.join('\n');
  }
}

// Singleton instance
let instance: ContentExtractorService | null = null;

export function getContentExtractorService(
  options?: Partial<ExtractionOptions>
): ContentExtractorService {
  if (!instance || options) {
    instance = new ContentExtractorService(options);
  }
  return instance;
}
