Import Flow Architecture - Generalization Analysis
Based on comprehensive-test.test.ts, knowledge-extractor-enhancements.py, and CHAT_IMPORT.md, here's the complete picture:
🎯 The Generalization Architecture
Current State: Chat-Specific Implementation
Problem: The system is currently designed primarily for AI chat JSON imports, but needs to handle any content type (HTML, MD, single files, structured multi-source JSON).
📋 The Correct Processing Flow (Generalized)
Phase 1: File Type Detection & Parsing ✅ COMPLETE
Location: comprehensive-test.test.ts:108-202, ImportFlowPanel.tsx:259-430
// User adds file →
// System checks what it is:

1. Read first 2KB (detect encoding: UTF-8 vs UTF-16)
2. Identify format:
   - JSON: Check structure (array vs object vs unknown)
   - HTML: Parse with HTML parser
   - Markdown: Parse with MD parser
   - Plain text: Treat as single document
   - PDF: Extract text
   - Code files (.py, .js, etc.): Treat as code

3. For JSON specifically:
   IF matches expected pattern → - ChatGPT: `mapping` + `messages` - Claude: `chat_messages` + `uuid`  
    - Gemini: Similar structure
   → Multi-source upload (many conversations in one file)
   ELSE → - Unknown JSON structure
   → Single-source upload (treat as single document)
   Key Insight: JSON detection has TWO paths:
   Multi-source (AI chat exports) → Many conversations
   Single-source (random JSON) → One document
   🔧 Config Sections: General vs Chat-Specific
   Universal Settings (Apply to ALL file types) ✅
   ExtractionSection: Include user/assistant (or author/content for non-chat)
   MinLengthSection: Minimum content length filter
   CodeExtractionSection: Extract code blocks (works for HTML, MD, JSON, any text)
   DuplicateDetectionSection: Detect duplicates (universal text comparison)
   Chat-Specific Settings (ONLY for AI chat JSON)
   BranchesSection: Conversation branches (chat-specific)
   GroupsSection: Auto-grouping strategy (by_chat, by_title, by_topic)
   ProcessingModeSection: Sequential vs parallel (more relevant for multi-conversation)
   Decision Logic:
   if (detectedType === 'chat' && platform !== 'unknown') {
   // Show ALL 7 sections (universal + chat-specific)
   showSections: [
   'Extraction', 'MinLength', 'CodeExtraction', 'DuplicateDetection',
   'Branches', 'Groups', 'ProcessingMode'
   ]
   } else if (detectedType === 'document' || detectedType === 'unknown') {
   // Show only UNIVERSAL sections
   showSections: [
   'Extraction', 'MinLength', 'CodeExtraction', 'DuplicateDetection'
   ]
   }
   📊 Phase 2: Normalization to JSON Document Model
   Purpose: Convert ANY input format → Unified NormalizedConversation[] structure From: knowledge-extractor-enhancements.py:150-256 (StreamingJSONParser)
   // Normalization Target (packages/parsers/src/types.ts):
   interface NormalizedConversation {
   conversation_id: string,
   title: string,
   platform: string,
   created_at: number,
   messages: NormalizedMessage[],
   metadata: Record<string, any>
   }

interface NormalizedMessage {
index: number,
role: 'user' | 'assistant' | 'system',
content: string,
timestamp: number,
hash: string
}
Normalization by Input Type:
Multi-Source JSON (AI Chats):
// Input: conversations.json → [{ mapping: {...}, title: "..." }, ...]
// Output: NormalizedConversation[] (already structured)
const parser = new ChatGPTParser(); // or ClaudeParser, GeminiParser
const normalized = parser.parse(jsonData);
// Result: conversations[] ready for Phase 3
Single HTML File:
// Input: documentation.html
// Output: NormalizedConversation with ONE conversation

const htmlContent = extractTextFromHTML(file);
const normalized: NormalizedConversation[] = [{
conversation*id: `html*${generateId()}`,
title: extractTitle(htmlContent) || file.name,
platform: 'html_import',
created_at: Date.now(),
messages: [{
index: 0,
role: 'system', // or 'assistant' for imported docs
content: htmlContent,
timestamp: Date.now(),
hash: md5(htmlContent)
}],
metadata: { source_type: 'html', file_name: file.name }
}];
Single Markdown File:
// Input: notes.md
// Output: NormalizedConversation with sections as messages

const mdSections = parseMarkdownSections(fileContent);
const normalized: NormalizedConversation[] = [{
conversation_id: `md_${generateId()}`,
title: extractFirstHeading(fileContent) || file.name,
platform: 'markdown_import',
created_at: Date.now(),
messages: mdSections.map((section, idx) => ({
index: idx,
role: 'system',
content: section.content,
timestamp: Date.now(),
hash: md5(section.content)
})),
metadata: { source_type: 'markdown', sections: mdSections.length }
}];
Single Code File (.py, .js):
// Input: script.py
// Output: NormalizedConversation with code as content

const codeContent = readFile(file);
const normalized: NormalizedConversation[] = [{
conversation*id: `code*${generateId()}`,
  title: file.name,
  platform: 'code_import',
  created_at: Date.now(),
  messages: [{
    index: 0,
    role: 'system',
    content: `\`\`\`${detectLanguage(file.name)}\n${codeContent}\n\`\`\``,
timestamp: Date.now(),
hash: md5(codeContent)
}],
metadata: { source_type: 'code', language: detectLanguage(file.name) }
}];
⚙️ Phase 3: Content Processing (Phase 1-3 Pipeline)
From: comprehensive-test.test.ts:290-478, import-enhanced.ts:549-689
After normalization, ALL content goes through:

1. ContentProcessor (Phase 1-2):
   - Multi-level breaking (tokens, sentences, blocks, sections)
   - Signature generation (MinHash, TF-IDF)
   - Insert into SQLite (blobs, node_spans, node_signatures, lsh_bands)

2. DeduplicationEngine (Phase 3):
   - Find exact duplicates (hash-based)
   - Create canonical nodes
   - Link duplicates to canonicals

3. ClusteringEngine (Phase 3):
   - Cluster by level (sentence, block, section)
   - Cluster by modality (prose, code)
   - Create NEAR_DUP edges
   - Compute evidence scores
     Key Point: This phase is UNIVERSAL - works on ANY normalized content.
     🗂️ Phase 4: Source Extraction & Graph Indexing
     From: import-enhanced.ts:292-350
     After processing, create graph nodes:

4. SourcesBuilder:
   - Extract meaningful segments (based on min length config)
   - Stitch messages into sources (by_chat, by_title, by_topic)
   - Creates Source nodes

5. CodeExtractor:
   - Detect code blocks (fenced or indented)
   - Extract language + code
   - Creates CodeBlock nodes

6. Graph Storage:
   - ChatThread nodes (or Document nodes for non-chat)
   - Message nodes
   - Source nodes → DERIVES_FROM edges
   - CodeBlock nodes → DERIVES_FROM edges
   - DUP_OF edges for duplicates
   - Group/Folder nodes for organization
     🎨 Multi-File Handling: Current vs Needed
     Current Behavior ✅:
     // Backend handles multiple FILES:
     for (const file of files) {
     await processEnhancedImport(file, config, accountId, userId);
     }

// Each file processed independently
// Same config applies to all files
Multi-Source vs Single-Source (Clarification):
Multi-Source JSON = ONE file containing MANY conversations
// conversations.json (single file)
[
{ "id": "conv1", "messages": [...] },
{ "id": "conv2", "messages": [...] },
{ "id": "conv3", "messages": [...] }
]
Multi-File Upload = MANY files uploaded at once
User selects:

- file1.json
- file2.md
- file3.html
  Both are supported ✅
  🔍 Code Extraction: Universal Feature
  Question: "Would we process code in the same way?" Answer: YES! Code extraction is UNIVERSAL. From: knowledge-extractor-enhancements.py + CodeExtractor service
  // Code extraction works on ANY text content:

1. HTML doc with <code> blocks → Extract
2. Markdown with ```python blocks → Extract
3. Plain text with indented code → Extract
4. JSON with code in messages → Extract

// The CodeExtractor doesn't care about SOURCE:
const extractor = new CodeExtractor({
minLength: 50,
deduplicate: true,
extractInline: false
});

// Processes ANY message content:
const codeBlocks = await extractor.extractFromMessages(allMessages);
📝 HTML/MD Document Handling
Question: "What if the user is just adding an HTML doc or MD doc?" Answer: They go through the SAME pipeline with ADAPTED parsing:
// HTML Document:

1. Parse HTML → Extract text content
2. Normalize to NormalizedConversation (single conversation, one "message")
3. Run through ContentProcessor (Phase 1-3)
4. Extract code blocks (if any <code> tags)
5. Create Document node (instead of ChatThread)
6. Same grouping/clustering applies

// Markdown Document:

1. Parse MD → Extract sections (headings create boundaries)
2. Normalize to NormalizedConversation (one message per section)
3. Run through ContentProcessor
4. Extract code blocks (```code blocks)
5. Create Document node
6. Same grouping/clustering
   🧩 The Missing Pieces (What Needs Building)
7. Universal Parser Registry (Partially Exists)
   Location: packages/parsers/src/services/parser-registry.ts Needed: Extend to handle ALL formats:
   class UniversalParserRegistry {
   parsers = {
   'json': [ChatGPTParser, ClaudeParser, GeminiParser, GenericJSONParser],
   'html': HTMLParser,
   'markdown': MarkdownParser,
   'text': PlainTextParser,
   'pdf': PDFParser,
   'code': CodeFileParser
   };

async parse(file: File): Promise<NormalizedConversation[]> {
const format = detectFormat(file);
const parser = this.selectParser(format, file);
return parser.parse(file);
}
} 2. Dynamic Config UI (Needs Implementation)
Location: ImportFlowPanel.tsx:432 (StageConfiguration) Current: Shows placeholder checkboxes Needed: Show sections based on detected type:
<StageConfiguration files={files} config={config}>
{files[0].detectedType === 'chat' && (
<>
<BranchesSection />
<GroupsSection />
<ProcessingModeSection />
</>
)}
{/_ Always show universal sections _/}
<ExtractionSection />
<MinLengthSection />
<CodeExtractionSection />
<DuplicateDetectionSection />
</StageConfiguration> 3. Document Node Type (Needs Addition)
Location: Graph schema Current: Only ChatThread nodes Needed: Document nodes for non-chat imports:
type NodeKind =
| 'ChatThread' // AI chat conversations
| 'Document' // HTML, MD, PDF imports
| 'CodeFile' // .py, .js, etc imports
| 'Source' // Extracted sources
| 'CodeBlock' // Extracted code
| 'Message' // Chat messages
| 'Group' // Organizational
| 'Folder'; // Organizational
✅ Summary: What Works vs What's Needed
Currently Works ✅:
✅ Multi-file upload support (batch processing)
✅ JSON format detection (ChatGPT, Claude, Gemini)
✅ Code extraction (universal - works on any text)
✅ Phase 1-3 processing (universal content breaking/clustering)
✅ Duplicate detection (universal text comparison)
✅ All 7 config sections exist and work
Needs Implementation 🔨:
🔨 HTML parser → NormalizedConversation converter
🔨 Markdown parser → NormalizedConversation converter
🔨 PDF parser → NormalizedConversation converter
🔨 Plain text parser → NormalizedConversation converter
🔨 Code file parser → NormalizedConversation converter
🔨 Dynamic config UI (show/hide sections based on file type)
🔨 Document node type (vs ChatThread for non-chat content)
🔨 UniversalParserRegistry to route to correct parser
🎯 Implementation Plan
Step 1: Create Universal Parsers
packages/parsers/src/services/
├── html-parser.ts (NEW)
├── markdown-parser.ts (NEW)
├── pdf-parser.ts (NEW)
├── plaintext-parser.ts (NEW)
├── code-file-parser.ts (NEW)
└── universal-parser.ts (NEW - orchestrator)
Step 2: Extend File Detection
// ImportFlowPanel.tsx:346 (detectFileMetadata)
// Add detection for:

- HTML (check for <!DOCTYPE or <html>)
- MD (check for # headings or frontmatter)
- PDF (check magic bytes %PDF)
- Code (check extension + syntax patterns)
  Step 3: Dynamic Config UI
  // Import StageConfig.tsx:20
  // Add conditional rendering:
  {files[0].detectedType === 'chat' ? (
  <ChatSpecificSections />
  ) : (
  <DocumentSpecificSections /> // Different options for docs
  )}
  Step 4: Backend Normalization
  // import-enhanced.ts:253 (processEnhancedImport)
  // Replace StreamingJSONParserV2 with:
  const universalParser = new UniversalParser();
  const conversations = await universalParser.parse(filePath, fileType);
  // Returns NormalizedConversation[] regardless of input type
  Conclusion: The system is 90% generalized already. The Phase 1-3 pipeline, code extraction, and duplicate detection are all universal. We just need to add format-specific parsers that convert ANY input → NormalizedConversation[], then everything else works automatically.
