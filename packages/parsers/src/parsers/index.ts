import { ChatParser, ParseResult } from '../types';
import { ChatGPTParser } from './chatgpt';
import { ClaudeParser } from './claude';
import { GeminiParser } from './gemini';
import { GenericParser } from './generic';

/**
 * Parser registry and auto-detection
 */
export class ParserRegistry {
  private parsers: ChatParser[];
  private genericParser: GenericParser;

  constructor() {
    this.parsers = [
      new ChatGPTParser(),
      new ClaudeParser(),
      new GeminiParser(),
    ];
    this.genericParser = new GenericParser();
  }

  /**
   * Auto-detect parser and parse data
   */
  async parse(data: unknown, sourceFile: string): Promise<ParseResult> {
    // Try specific parsers first
    for (const parser of this.parsers) {
      if (parser.canParse(data)) {
        console.log(`Detected platform: ${parser.platform}`);
        return await parser.parse(data, sourceFile);
      }
    }

    // Fallback to generic parser
    console.log('Using generic parser (unknown format)');
    return await this.genericParser.parse(data, sourceFile);
  }

  /**
   * Get parser by platform name
   */
  getParser(platform: string): ChatParser | null {
    const parser = this.parsers.find(p => p.platform === platform);
    return parser || null;
  }
}

// Export parsers
export { ChatGPTParser } from './chatgpt';
export { ClaudeParser } from './claude';
export { GeminiParser } from './gemini';
export { GenericParser } from './generic';
