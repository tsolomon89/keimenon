/**
 * Sectioner: Extract section hierarchy from structured text
 *
 * Extracts hierarchical sections from:
 * - Markdown: # Heading hierarchy (h1-h6)
 * - LaTeX: \section, \subsection, \subsubsection
 * - HTML: <h1> through <h6>
 *
 * Generates structural signatures: "h1[2]|h2[5]|p[3]"
 * (Prevents false merges across different document sections)
 */

export interface Section {
  text: string;
  start: number;           // Byte offset
  end: number;             // Byte offset
  level: number;           // 1-6 (heading level)
  index: number;           // Section number at this level (0-indexed)
  parentId: string | null; // Parent section ID
  id: string;              // Unique section ID
  type: 'heading' | 'content';
  path: string;            // Structural signature: "h1[2]|h2[5]"
}

export interface SectionerConfig {
  modality?: 'markdown' | 'latex' | 'html' | 'auto';
  includeContent?: boolean; // Include content between headings (default: true)
  minContentSize?: number;  // Min chars for content sections (default: 10)
}

const DEFAULT_CONFIG: SectionerConfig = {
  modality: 'auto',
  includeContent: true,
  minContentSize: 10,
};

/**
 * Extract sections from text
 */
export function extractSections(
  text: string,
  config: SectionerConfig = {}
): Section[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Determine modality
  let modality = cfg.modality;
  if (modality === 'auto') {
    modality = detectModality(text);
  }

  if (modality === 'markdown') {
    return extractMarkdownSections(text, cfg);
  } else if (modality === 'latex') {
    return extractLatexSections(text, cfg);
  } else if (modality === 'html') {
    return extractHtmlSections(text, cfg);
  }

  // Fallback: treat as single section
  return [
    {
      text,
      start: 0,
      end: Buffer.byteLength(text, 'utf8'),
      level: 1,
      index: 0,
      parentId: null,
      id: 'sec_0',
      type: 'content',
      path: 'root',
    },
  ];
}

/**
 * Extract markdown sections (# Heading hierarchy)
 */
function extractMarkdownSections(
  text: string,
  config: SectionerConfig
): Section[] {
  const sections: Section[] = [];
  const headings: Array<{ level: number; text: string; start: number; end: number }> = [];

  // Extract all ATX headings: # Heading
  const atxRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = atxRegex.exec(text)) !== null) {
    const level = match[1].length;
    const headingText = match[2].trim();
    const start = match.index;
    const end = match.index + match[0].length;

    headings.push({ level, text: headingText, start, end });
  }

  // If no headings, return entire text as single section
  if (headings.length === 0) {
    const byteLength = Buffer.byteLength(text, 'utf8');
    sections.push({
      text,
      start: 0,
      end: byteLength,
      level: 1,
      index: 0,
      parentId: null,
      id: 'sec_0',
      type: 'content',
      path: 'root',
    });
    return sections;
  }

  // Build section hierarchy
  const levelCounters: Record<number, number> = {};
  const parentStack: Array<{ level: number; id: string; path: string }> = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];

    // Initialize counter for this level
    if (!(heading.level in levelCounters)) {
      levelCounters[heading.level] = 0;
    }

    // Reset deeper level counters
    for (let l = heading.level + 1; l <= 6; l++) {
      levelCounters[l] = 0;
    }

    const levelIndex = levelCounters[heading.level];
    levelCounters[heading.level]++;

    // Find parent (last section with level < current level)
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= heading.level) {
      parentStack.pop();
    }

    const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
    const parentId = parent ? parent.id : null;
    const sectionId = `sec_${sections.length}`;

    // Build path (structural signature)
    const pathSegment = `h${heading.level}[${levelIndex}]`;
    const path = parent ? `${parent.path}|${pathSegment}` : pathSegment;

    // Add heading section
    const byteStart = Buffer.byteLength(text.slice(0, heading.start), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(heading.text, 'utf8');

    sections.push({
      text: heading.text,
      start: byteStart,
      end: byteEnd,
      level: heading.level,
      index: levelIndex,
      parentId,
      id: sectionId,
      type: 'heading',
      path,
    });

    // Push to parent stack
    parentStack.push({ level: heading.level, id: sectionId, path });

    // Add content section (text between this heading and next)
    if (config.includeContent) {
      const contentStart = heading.end;
      const contentEnd = nextHeading ? nextHeading.start : text.length;
      const content = text.slice(contentStart, contentEnd).trim();

      if (content.length >= config.minContentSize!) {
        const contentByteStart = Buffer.byteLength(text.slice(0, contentStart), 'utf8');
        const contentByteEnd = contentByteStart + Buffer.byteLength(content, 'utf8');

        sections.push({
          text: content,
          start: contentByteStart,
          end: contentByteEnd,
          level: heading.level + 1,
          index: 0,
          parentId: sectionId,
          id: `sec_${sections.length}`,
          type: 'content',
          path: `${path}|p[0]`,
        });
      }
    }
  }

  return sections;
}

/**
 * Extract LaTeX sections (\section, \subsection, etc.)
 */
function extractLatexSections(
  text: string,
  config: SectionerConfig
): Section[] {
  const sections: Section[] = [];
  const headings: Array<{ level: number; text: string; start: number; end: number }> = [];

  // LaTeX section commands
  const sectionRegex = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\{([^}]+)\}/g;
  const levelMap: Record<string, number> = {
    part: 1,
    chapter: 2,
    section: 3,
    subsection: 4,
    subsubsection: 5,
    paragraph: 6,
    subparagraph: 7,
  };

  let match;

  while ((match = sectionRegex.exec(text)) !== null) {
    const command = match[1];
    const title = match[2].trim();
    const level = levelMap[command];
    const start = match.index;
    const end = match.index + match[0].length;

    headings.push({ level, text: title, start, end });
  }

  // If no sections, return entire text
  if (headings.length === 0) {
    const byteLength = Buffer.byteLength(text, 'utf8');
    sections.push({
      text,
      start: 0,
      end: byteLength,
      level: 1,
      index: 0,
      parentId: null,
      id: 'sec_0',
      type: 'content',
      path: 'root',
    });
    return sections;
  }

  // Build hierarchy (same logic as markdown)
  const levelCounters: Record<number, number> = {};
  const parentStack: Array<{ level: number; id: string; path: string }> = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];

    if (!(heading.level in levelCounters)) {
      levelCounters[heading.level] = 0;
    }

    for (let l = heading.level + 1; l <= 7; l++) {
      levelCounters[l] = 0;
    }

    const levelIndex = levelCounters[heading.level];
    levelCounters[heading.level]++;

    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= heading.level) {
      parentStack.pop();
    }

    const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
    const parentId = parent ? parent.id : null;
    const sectionId = `sec_${sections.length}`;

    const pathSegment = `sec${heading.level}[${levelIndex}]`;
    const path = parent ? `${parent.path}|${pathSegment}` : pathSegment;

    const byteStart = Buffer.byteLength(text.slice(0, heading.start), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(heading.text, 'utf8');

    sections.push({
      text: heading.text,
      start: byteStart,
      end: byteEnd,
      level: heading.level,
      index: levelIndex,
      parentId,
      id: sectionId,
      type: 'heading',
      path,
    });

    parentStack.push({ level: heading.level, id: sectionId, path });

    if (config.includeContent) {
      const contentStart = heading.end;
      const contentEnd = nextHeading ? nextHeading.start : text.length;
      const content = text.slice(contentStart, contentEnd).trim();

      if (content.length >= config.minContentSize!) {
        const contentByteStart = Buffer.byteLength(text.slice(0, contentStart), 'utf8');
        const contentByteEnd = contentByteStart + Buffer.byteLength(content, 'utf8');

        sections.push({
          text: content,
          start: contentByteStart,
          end: contentByteEnd,
          level: heading.level + 1,
          index: 0,
          parentId: sectionId,
          id: `sec_${sections.length}`,
          type: 'content',
          path: `${path}|p[0]`,
        });
      }
    }
  }

  return sections;
}

/**
 * Extract HTML sections (<h1> through <h6>)
 */
function extractHtmlSections(
  text: string,
  config: SectionerConfig
): Section[] {
  const sections: Section[] = [];
  const headings: Array<{ level: number; text: string; start: number; end: number }> = [];

  // HTML heading tags
  const headingRegex = /<h([1-6])(?:\s+[^>]*)?>([^<]+)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(text)) !== null) {
    const level = parseInt(match[1], 10);
    const headingText = match[2].trim();
    const start = match.index;
    const end = match.index + match[0].length;

    headings.push({ level, text: headingText, start, end });
  }

  // If no headings, return entire text
  if (headings.length === 0) {
    const byteLength = Buffer.byteLength(text, 'utf8');
    sections.push({
      text,
      start: 0,
      end: byteLength,
      level: 1,
      index: 0,
      parentId: null,
      id: 'sec_0',
      type: 'content',
      path: 'root',
    });
    return sections;
  }

  // Build hierarchy (same logic as markdown)
  const levelCounters: Record<number, number> = {};
  const parentStack: Array<{ level: number; id: string; path: string }> = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];

    if (!(heading.level in levelCounters)) {
      levelCounters[heading.level] = 0;
    }

    for (let l = heading.level + 1; l <= 6; l++) {
      levelCounters[l] = 0;
    }

    const levelIndex = levelCounters[heading.level];
    levelCounters[heading.level]++;

    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= heading.level) {
      parentStack.pop();
    }

    const parent = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
    const parentId = parent ? parent.id : null;
    const sectionId = `sec_${sections.length}`;

    const pathSegment = `h${heading.level}[${levelIndex}]`;
    const path = parent ? `${parent.path}|${pathSegment}` : pathSegment;

    const byteStart = Buffer.byteLength(text.slice(0, heading.start), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(heading.text, 'utf8');

    sections.push({
      text: heading.text,
      start: byteStart,
      end: byteEnd,
      level: heading.level,
      index: levelIndex,
      parentId,
      id: sectionId,
      type: 'heading',
      path,
    });

    parentStack.push({ level: heading.level, id: sectionId, path });

    if (config.includeContent) {
      const contentStart = heading.end;
      const contentEnd = nextHeading ? nextHeading.start : text.length;
      const content = text.slice(contentStart, contentEnd).trim();

      if (content.length >= config.minContentSize!) {
        const contentByteStart = Buffer.byteLength(text.slice(0, contentStart), 'utf8');
        const contentByteEnd = contentByteStart + Buffer.byteLength(content, 'utf8');

        sections.push({
          text: content,
          start: contentByteStart,
          end: contentByteEnd,
          level: heading.level + 1,
          index: 0,
          parentId: sectionId,
          id: `sec_${sections.length}`,
          type: 'content',
          path: `${path}|p[0]`,
        });
      }
    }
  }

  return sections;
}

/**
 * Detect text modality
 */
function detectModality(text: string): 'markdown' | 'latex' | 'html' {
  // Check for LaTeX
  if (text.includes('\\section') || text.includes('\\subsection') || text.includes('\\documentclass')) {
    return 'latex';
  }

  // Check for HTML
  if (/<h[1-6](?:\s+[^>]*)?>/.test(text)) {
    return 'html';
  }

  // Default to markdown
  return 'markdown';
}

/**
 * Get section at specific byte offset
 */
export function getSectionAtOffset(sections: Section[], offset: number): Section | null {
  for (const section of sections) {
    if (offset >= section.start && offset < section.end) {
      return section;
    }
  }
  return null;
}

/**
 * Get section hierarchy (parent-child relationships)
 */
export function getSectionHierarchy(sections: Section[]): Map<string, Section[]> {
  const hierarchy = new Map<string, Section[]>();

  for (const section of sections) {
    const parentId = section.parentId || 'root';
    if (!hierarchy.has(parentId)) {
      hierarchy.set(parentId, []);
    }
    hierarchy.get(parentId)!.push(section);
  }

  return hierarchy;
}

/**
 * Get section path (ancestors)
 */
export function getSectionPath(sections: Section[], sectionId: string): Section[] {
  const path: Section[] = [];
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  let current = sectionMap.get(sectionId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? sectionMap.get(current.parentId) : undefined;
  }

  return path;
}

/**
 * Generate structural signature for a section
 * Example: "h1[2]|h2[5]|p[3]"
 */
export function generateStructuralSignature(sections: Section[], sectionId: string): string {
  const path = getSectionPath(sections, sectionId);
  if (path.length === 0) return 'root';

  const target = path[path.length - 1];
  return target.path;
}

/**
 * Batch extract sections from multiple texts
 */
export function extractSectionsBatch(
  texts: string[],
  config: SectionerConfig = {}
): Section[][] {
  return texts.map((text) => extractSections(text, config));
}

/**
 * Filter sections by type
 */
export function filterSectionsByType(
  sections: Section[],
  type: 'heading' | 'content'
): Section[] {
  return sections.filter((s) => s.type === type);
}

/**
 * Get top-level sections (no parent)
 */
export function getTopLevelSections(sections: Section[]): Section[] {
  return sections.filter((s) => s.parentId === null);
}
