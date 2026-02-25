# Feature: AI Chat Import

> **Goal**: Ingest conversation exports (ChatGPT, Claude, Gemini) and transform them into a queryable Knowledge Graph.

## Core Concepts

### Sources Mode
Instead of storing raw chat logs, the system extracts **Sources**: meaningful, standalone segments of content.
- **Invariant**: A Source is a unit of *knowledge*, not just a unit of *communication*.
- **Role Subset**: Configurable to include `user`, `assistant`, or `both`.

### Stitching Strategies
How messages are grouped into Sources:
1.  **by_chat** (Default): One Source per Conversation. Preserves context.
2.  **by_title**: Groups conversations with similar titles. useful for "Part 1", "Part 2" chats.
3.  **by_topic**: (Advanced) Semantic clustering of messages into topic-based Sources.

## Import Pipeline
1.  **Ingest**: Stream JSON file (supports >2GB via `JSONStream`).
2.  **Parse**: Normalize vendor-specific formats (OpenAI `mapping` vs Anthropic `chat_messages`) into a canonical `Message` record.
3.  **Extract**: Run [Code Extraction](./code_extraction.md) and [Clustering](./clustering.md) inline.
4.  **Persist**: Write `Conversation`, `Message`, `Source`, and `CodeBlock` records to the DB.

## Configuration Schema
```typescript
interface ImportConfig {
  sources: {
    enabled: boolean;
    stitchStrategy: 'by_chat' | 'by_title' | 'by_topic';
    minChars: number; // Filter noise
  };
  deduplication: {
    algorithm: 'jaccard' | 'levenshtein' | 'cosine';
    threshold: number; // 0.0 - 1.0
  };
}
```
