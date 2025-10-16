import { CodeAsset } from '../types';
import { fingerprint } from './fingerprint';
import { nanoid } from 'nanoid';

// Code fence regex (non-greedy, captures language)
const CODE_FENCE_RE = /```([a-zA-Z0-9_+\-\.]*)\n(.*?)```/gs;

// Language to extension mapping
const LANG_TO_EXT: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  rust: 'rs',
  go: 'go',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  scala: 'scala',
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  sql: 'sql',
  html: 'html',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
};

export interface ExtractedCode {
  language: string;
  code: string;
  start_index: number;
}

/**
 * Extract code blocks from markdown text
 */
export function extractCodeBlocks(text: string): ExtractedCode[] {
  const blocks: ExtractedCode[] = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_FENCE_RE.exec(text)) !== null) {
    const language = (match[1] || 'txt').toLowerCase();
    const code = match[2].trim();

    if (code.length > 0) {
      blocks.push({
        language,
        code,
        start_index: match.index,
      });
    }
  }

  return blocks;
}

/**
 * Convert code blocks to CodeAsset nodes
 */
export function codeBlocksToAssets(
  blocks: ExtractedCode[],
  messageId: string,
  conversationId: string,
  timestamp: number,
  minChars: number = 50
): CodeAsset[] {
  return blocks
    .filter(block => block.code.length >= minChars)
    .map(block => {
      const ext = LANG_TO_EXT[block.language] || block.language || 'txt';

      return {
        id: `code_${nanoid()}`,
        language: block.language,
        ext: ext, // without leading dot
        code: block.code,
        hash: fingerprint(block.code),
        derived_from_message_id: messageId,
        conversation_id: conversationId,
        timestamp,
      };
    });
}

/**
 * Deduplicate code assets by hash
 * Keep first occurrence
 */
export function deduplicateCodeAssets(assets: CodeAsset[]): CodeAsset[] {
  const seen = new Set<string>();
  const unique: CodeAsset[] = [];

  for (const asset of assets) {
    if (!seen.has(asset.hash)) {
      seen.add(asset.hash);
      unique.push(asset);
    }
  }

  return unique;
}

/**
 * Generate unique filename for code export
 */
export function generateCodeFilename(
  asset: CodeAsset,
  existingNames: Set<string>
): string {
  const baseName = `${asset.language}_${asset.id.slice(-8)}`;
  let filename = `${baseName}.${asset.ext}`;
  let counter = 1;

  while (existingNames.has(filename)) {
    filename = `${baseName}_${counter}.${asset.ext}`;
    counter++;
  }

  existingNames.add(filename);
  return filename;
}
