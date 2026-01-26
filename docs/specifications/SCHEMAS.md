# Data Schemas & Type Definitions

**Package**: `@canvas-memory/types`

## Overview

Canvas Memory OS uses a shared type system to ensure consistency between the database, API, and frontend. This document defines the core data structures.

## Core Entities

### Node

The fundamental unit of the graph.

```typescript
export interface Node {
  id: string; // UUID
  kind: NodeKind; // Discriminator
  properties: Record<string, any>;
  account_id: string; // Multi-tenant isolation
  created_by: string; // User ID
  created_at: number; // Unix timestamp
  updated_at: number; // Unix timestamp
}
```

### Edge

A directed relationship between two nodes.

```typescript
export interface Edge {
  id: string;
  kind: EdgeKind;
  from_id: string;
  to_id: string;
  properties: Record<string, any>;
  account_id: string;
  created_by: string;
  created_at: number;
}
```

## Enums

### NodeKind

```typescript
export type NodeKind =
  | 'Source'
  | 'Group'
  | 'Folder'
  | 'Board'
  | 'ChatThread'
  | 'Message'
  | 'CodeBlock'
  | 'ObjectiveClaim'
  | 'UnifiedDoc'
  | 'Constellation'
  | 'UserNode'
  | 'BusinessNode';
```

### EdgeKind

```typescript
export type EdgeKind =
  | 'CONTAINS'
  | 'DERIVES_FROM'
  | 'DUP_OF'
  | 'SIMILAR_TO'
  | 'COMPILED_FROM'
  | 'STITCHED_FROM'
  | 'EXTRACTED_FROM'
  | 'SEQUESTERS'
  | 'SUPPORTS'
  | 'REFUTES'
  | 'VERIFIED_BY';
```

## Feature Schemas

### Code Block

Standardized structure for extracted code.

```typescript
interface CodeBlockProperties {
  language: string;
  content: string;
  fingerprint: string; // SHA-256
  char_count: number;
  line_count: number;
  has_comments: boolean;
}
```

### Source

Represents an ingested file or URL.

```typescript
interface SourceProperties {
  title: string;
  url?: string;
  mime_type: string;
  size_bytes: number;
  fingerprint: string;
  content_summary?: string;
}
```

> **Note**: For exact type definitions and Zod schemas, refer to `packages/types/src/index.ts`.
