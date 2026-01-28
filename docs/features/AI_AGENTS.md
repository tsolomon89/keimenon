# AI Agents Framework

**Status**: Experimental / Alpha
**Package**: `@keimenon/agents`

## Overview

The AI Agents Framework provides specialized autonomous agents for maintaining and enhancing the Knowledge Graph. These agents operate on the graph data to gather info, organize nodes, and verify claims.

## Core Agents

### 1. Gatherer Agent (`gatherer.ts`)

**Purpose**: Collects external information and ingests it into the graph as Source nodes.

- **Input**: `GathererInput` (seeds, intent)
- **Output**: `GathererOutput` (list of `SourceNode`s found)
- **Current State**: Mock implementation. Simulates finding sources and optionally expanding search based on intent.

### 2. Autogrouper Agent (`autogrouper.ts`)

**Purpose**: Automatically organizes ungrouped sources into logical Clusters/Groups based on semantic similarity or rules.

- **Input**: `AutogrouperInput` (list of `SourceNode`s to group)
- **Output**: `AutogrouperOutput` (created `GroupNode`s and edges)
- **Current State**: Mock implementation. Places all inputs into a single "Auto-Grouped Cluster".

### 3. Verifier Agent (`verifier.ts`)

**Purpose**: Validates claims and data integrity within the graph.

- **Input**: `VerifierInput` (claims to verify, plan)
- **Output**: `VerifierOutput` (run report, status updates)
- **Current State**: Mock implementation. Marks all submitted claims as `verified` and generation a pass report.

## Integration

The agents are integrated into the main API via `apps/api/src/routes/agents.routes.ts`.

### Endpoints

- `POST /api/v1/agents/gatherer`
- `POST /api/v1/agents/autogrouper`
- `POST /api/v1/agents/verifier`

## Future Roadmap

- [ ] Connect Gatherer to real search APIs (Bravado/SerpApi)
- [ ] Implement vector-based clustering for Autogrouper
- [ ] Implement LLM-based verification logic
