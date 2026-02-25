/**
 * ToolRegistry Interface
 *
 * Registry for pluggable tool adapters.
 * Provides graceful degradation when tools are unavailable.
 */

/**
 * Chat message for LLM interactions
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat options for LLM calls
 */
export interface ChatOptions {
  /** Model to use */
  model?: string;
  /** Max tokens in response */
  max_tokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Stop sequences */
  stop?: string[];
  /** Response format */
  response_format?: { type: 'text' | 'json_object' };
}

/**
 * Topic extracted from text
 */
export interface ExtractedTopic {
  name: string;
  keywords: string[];
  confidence: number;
}

/**
 * LLM Adapter interface
 *
 * Provides unified access to LLM providers (OpenAI, Anthropic, Ollama, etc.)
 * via LiteLLM proxy or direct SDK.
 */
export interface LLMAdapter {
  /**
   * Check if LLM is available
   */
  isAvailable(): boolean;

  /**
   * Get the current provider name
   */
  getProvider(): string;

  /**
   * Extract topics from text
   */
  extractTopics(text: string): Promise<ExtractedTopic[]>;

  /**
   * Summarize multiple text chunks
   */
  summarize(chunks: string[], options?: { maxLength?: number }): Promise<string>;

  /**
   * Classify duplicate pairs
   */
  classifyDupes(
    pairs: Array<[string, string]>
  ): Promise<Array<{ similarity: number; isDuplicate: boolean }>>;

  /**
   * General chat completion
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Extract claims from text
   */
  extractClaims(
    text: string,
    context?: string
  ): Promise<Array<{ claim: string; confidence: number }>>;
}

/**
 * Search result from web search
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  score?: number;
}

/**
 * Web Adapter interface
 *
 * Provides web search and fetch capabilities via SearXNG or similar.
 */
export interface WebAdapter {
  /**
   * Check if web search is available
   */
  isAvailable(): boolean;

  /**
   * Get the current search provider
   */
  getProvider(): string;

  /**
   * Search the web
   */
  search(query: string, options?: { limit?: number }): Promise<SearchResult[]>;

  /**
   * Fetch a URL and return HTML
   */
  fetch(url: string): Promise<{ html: string; status: number }>;

  /**
   * Extract main text content from HTML
   */
  extractMainText(html: string): Promise<string>;
}

/**
 * Execution result
 */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration_ms: number;
}

/**
 * Exec Adapter interface
 *
 * Provides sandboxed code execution.
 */
export interface ExecAdapter {
  /**
   * Check if execution is available
   */
  isAvailable(): boolean;

  /**
   * Run Python script
   */
  runPython(script: string, args?: string[]): Promise<ExecResult>;

  /**
   * Run Node.js script
   */
  runNode(script: string, args?: string[]): Promise<ExecResult>;
}

/**
 * Proof verification result
 */
export interface ProofResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Proof Adapter interface
 *
 * Provides formal verification capabilities (Lean, Coq, etc.)
 */
export interface ProofAdapter {
  /**
   * Check if proof verification is available
   */
  isAvailable(): boolean;

  /**
   * Verify a Lean proof
   */
  checkLean(file: string): Promise<ProofResult>;

  /**
   * Verify a Coq proof
   */
  checkCoq(file: string): Promise<ProofResult>;
}

/**
 * Git Adapter interface
 *
 * Provides local git operations for artifact versioning.
 */
export interface GitAdapter {
  /**
   * Check if git is available
   */
  isAvailable(): boolean;

  /**
   * Write a file to the repo
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Read a file from the repo
   */
  readFile(path: string): Promise<string | null>;

  /**
   * Commit staged changes
   */
  commit(message: string): Promise<string>;

  /**
   * Get current commit hash
   */
  getHead(): Promise<string>;
}

/**
 * Tool availability status
 */
export interface ToolStatus {
  name: string;
  available: boolean;
  provider?: string;
  error?: string;
}

/**
 * ToolRegistry interface
 *
 * Central registry for all tool adapters.
 * Provides graceful degradation when tools are unavailable.
 */
export interface ToolRegistry {
  /**
   * Get LLM adapter (may be null if not configured)
   */
  getLLMAdapter(): LLMAdapter | null;

  /**
   * Get web adapter (may be null if not configured)
   */
  getWebAdapter(): WebAdapter | null;

  /**
   * Get execution adapter (may be null if not configured)
   */
  getExecAdapter(): ExecAdapter | null;

  /**
   * Get proof adapter (may be null if not configured)
   */
  getProofAdapter(): ProofAdapter | null;

  /**
   * Get git adapter (may be null if not configured)
   */
  getGitAdapter(): GitAdapter | null;

  /**
   * Get status of all tools
   */
  getStatus(): ToolStatus[];

  /**
   * Check if a specific tool is available
   */
  isAvailable(tool: 'llm' | 'web' | 'exec' | 'proof' | 'git'): boolean;

  /**
   * Refresh adapter configurations
   * Call after BYOK key updates
   */
  refresh(): Promise<void>;
}

/**
 * Null/Mock implementations for graceful degradation
 */

export class NullLLMAdapter implements LLMAdapter {
  isAvailable(): boolean {
    return false;
  }
  getProvider(): string {
    return 'none';
  }
  async extractTopics(): Promise<ExtractedTopic[]> {
    return [];
  }
  async summarize(): Promise<string> {
    throw new Error('LLM not available');
  }
  async classifyDupes(): Promise<Array<{ similarity: number; isDuplicate: boolean }>> {
    return [];
  }
  async chat(): Promise<string> {
    throw new Error('LLM not available');
  }
  async extractClaims(): Promise<Array<{ claim: string; confidence: number }>> {
    return [];
  }
}

export class NullWebAdapter implements WebAdapter {
  isAvailable(): boolean {
    return false;
  }
  getProvider(): string {
    return 'none';
  }
  async search(): Promise<SearchResult[]> {
    return [];
  }
  async fetch(): Promise<{ html: string; status: number }> {
    throw new Error('Web adapter not available');
  }
  async extractMainText(): Promise<string> {
    throw new Error('Web adapter not available');
  }
}
