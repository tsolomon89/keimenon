# Keimenon

Keimenon is a local-first AI knowledge graph and agent runtime for turning large personal or organizational knowledge corpora into structured, provenance-preserving, agent-operable graph data.

It is designed to ingest messy source material — starting with AI chat exports, then broader documents and code — and convert it into a navigable graph of sources, spans, packets, topics, groups, objectives, principals, conversations, and verified claims.

Core framing:

> **Obsidian meets Poppy for private, user-owned data.**

Keimenon is not only a graph viewer. It is a local-first knowledge operating system with:

- configurable import pipelines;
- similarity-weighted graph materialization;
- account/principal isolation;
- raw source preservation;
- provenance and trust tracking;
- 2D/3D/ND graph investigation surfaces;
- objective and verification layers;
- AI agent tasks for analysis, summarization, deduplication, and verification;
- a repo-level Agent OS for coordinating development workflows.

## What Keimenon Does

Keimenon takes unstructured or semi-structured source material and turns it into a graph that can be explored, queried, summarized, verified, and extended by humans or agents.

The primary workflow is:

```txt
Raw source material
  -> import pipeline
  -> normalized source records
  -> source spans / packets / atomic units
  -> similarity-weighted graph
  -> groups / topics / objectives / verified claims
  -> human and agent workflows
```

The system is intended for users who have accumulated a large body of thinking, chat logs, research, code, documents, or AI-assisted outputs and need to consolidate it into a single navigable corpus.

## Core Product Model

### Local-first knowledge graph

Keimenon stores raw personal content locally. The maintained runtime contract is local disk-backed storage using SQLite and a local document path.

The current production assumption is a single local API instance. Shared network filesystems, serverless API deployment, and horizontally scaled API instances are outside the current SQLite contract.

### Similarity-first graph birth

Imported data is not treated as a flat file archive. Keimenon materializes a graph from semantic and structural similarity.

The import system is designed to produce:

- `AccountNode`;
- `Principal`;
- `Source`;
- `SourceDoc`;
- `SourceSpan`;
- `Packet`;
- `AtomicUnit`;
- `Group`;
- hierarchy edges;
- similarity edges;
- provenance links.

### Raw source fidelity

Raw source content is preserved. Derived outputs — summaries, groups, objectives, verified claims, artifacts, and agent outputs — must not overwrite the original source material.

This is a core trust boundary: Keimenon can derive from sources, but it should not silently rewrite them.

### Provenance and trust

Keimenon tracks where information came from, who introduced it, how it entered the system, and whether it is user-generated, externally claimed, or verified.

The node model includes enhanced provenance fields such as:

- `origin_principal_id`;
- `origin_type`;
- `origin_ref`;
- `trust_state`;
- `attested_by`.

### Account and principal hierarchy

The canonical hierarchy is:

```txt
Account -> Principal -> Sources / Groups / Objectives
```

A `Principal` can represent a human, agent, or contact. Authorization is based on capabilities, not merely on whether something is classified as human or agent.

In this model, human users, contacts, and agents are all first-class graph actors.

### Conversations as graph joins

A conversation is not only a chat UI record. In Keimenon, a conversation is modeled as a formal join between:

```txt
human principal
  <-> agent principal
  <-> context set
  <-> purpose
  <-> outputs / runs
```

Conversation threads can be attached to specific sources, groups, workspaces, or context expansion rules.

## AI Agent Runtime

Keimenon includes an in-app agent runtime.

Agents execute auditable tasks against graph-scoped data. Tasks are persisted, versioned, retried, cancellable, and associated with runs and artifacts.

Current task types include:

- `GROUP_SUMMARY_BUILD` — generate a canonical summary document from group sources;
- `DUPLICATE_SUGGEST` — propose duplicate clusters without destructive merging;
- `VERIFY_SOURCE_CHAIN` — create evidence chains from web search;
- `ANALYZE_SOURCE` — analyze a source with an LLM and extract structured claims/tags;
- `VERIFY_TOPIC` — verify a topic using external evidence and credibility scoring.

The agent runtime supports:

- task creation;
- task retry;
- task cancellation;
- task history;
- task detail retrieval;
- run records;
- artifact records;
- server-sent progress events;
- entitlement gating by account tier;
- graceful degradation when required providers are unavailable.

Agent routes are exposed under:

```txt
/api/v1/agent
```

Key endpoints include:

```txt
GET    /api/v1/agent/health
GET    /api/v1/agent/types
GET    /api/v1/agent/events
POST   /api/v1/agent/tasks
GET    /api/v1/agent/tasks
GET    /api/v1/agent/tasks/:id
POST   /api/v1/agent/tasks/:id/retry
DELETE /api/v1/agent/tasks/:id
```

## Tool Adapters

The agent runtime uses pluggable tool adapters.

Supported adapter categories include:

- LLM;
- web search;
- local execution;
- proof verification;
- git operations.

The production registry currently wires:

- LiteLLM for LLM access;
- SearXNG for web search;
- local execution adapter;
- local proof adapter;
- local git adapter.

Relevant environment variables include:

```txt
LITELLM_URL
LITELLM_API_KEY
DEFAULT_MODEL
SEARXNG_URL
```

In production mode, missing LLM or web provider configuration can prevent agent runtime startup for tasks that require those providers.

## Objective and Verification Layer

Keimenon includes an objective/trust layer for turning raw material into more stable machine-usable claims.

Objective and verification nodes include:

- `ObjectiveClaim`;
- `VerifiedSource`;
- `VerifiedClaim`;
- `UnifiedDoc`;
- evidence-style relationships.

Objective claims can move through lifecycle states such as:

```txt
provisional -> verifying -> verified | contested | stale
```

The intended trust model is that higher-level claims remain linked back to source evidence.

## Import Pipeline

The canonical import path is the chunked upload rail:

```txt
POST /api/v1/uploads/initiate
POST /api/v1/uploads/:sessionId/chunks/:chunkIndex
GET  /api/v1/uploads/:sessionId
```

The old multipart import endpoint is retained only as a compatibility shim and should return `410 Gone`.

Import processing supports:

- automatic mode;
- manual mode;
- hybrid mode;
- role-aware extraction;
- branch handling;
- code extraction;
- duplicate detection;
- similarity preview;
- import presets;
- import progress events;
- terminal state tracking.

The import contract includes:

- canonical conversation reconstruction;
- source span extraction;
- atomic substrate generation using characters and trigrams;
- packet derivation;
- deterministic mass scoring;
- graph layer linking.

The intended graph path is:

```txt
Source -> SourceSpan -> Packet -> AtomicUnit
```

## Graph Investigation UI

Keimenon includes a graph-first investigation interface.

The graph experience is designed around:

- deterministic node positioning;
- account-centered radial shell layout;
- 2D graph lens;
- 3D graph lens;
- projected N-dimensional graph lens;
- multi-scale level-of-detail;
- focus mode;
- pinned sub-galaxies;
- edge inspection;
- hierarchy-preserving graph navigation.

Canonical graph hierarchy:

```txt
AccountNode
  -> Principal
  -> Group / Folder
  -> Source / SourceDoc / ConversationThread
  -> ObjectiveClaim / VerifiedSource / VerifiedClaim
  -> Topic / Phrase / Lexeme / Packet / SourceSpan / CodeBlock
```

The graph renderer is intended to use Three.js and instanced rendering for scale.

## Repo-Level Agent OS

The repository also includes a separate `.agent/` operating layer for development agents.

This is not the same thing as the product agent runtime.

The `.agent/` system defines:

- personas;
- skills;
- workflows;
- workflow triggers;
- permissions;
- files/directories inspected;
- commands usually run;
- evidence requirements;
- risk levels;
- required gates.

Examples of repo-level workflows include:

- `sqlite-schema-migration`;
- `golden-path-verification`;
- `chat-import-pipeline`;
- `graph-canvas-development`;
- `api-backend-contract`;
- `web-ui-development`;
- `desktop-runtime`;
- `graph-data-model`;
- `security-privacy-review`;
- `documentation-sync`;
- `full-stack-feature-builder`.

This layer exists to coordinate coding agents working on the Keimenon codebase.

## Applications

The monorepo contains:

- `apps/api` — Express API and runtime services;
- `apps/web` — Next.js web client;
- `apps/desktop` — Electron desktop app;
- `apps/desktop-e2e` — desktop E2E tests.

## Packages

Shared packages include:

- `packages/types` — canonical graph, feature, task, and policy types;
- `packages/db` — SQLite schema, migrations, and database access;
- `packages/parsers` — source/chat export parsers;
- `packages/graph` — graph utilities;
- `packages/agent-core` — agent task runner, interfaces, events, storage, and task types;
- `packages/task-handlers` — concrete agent task implementations;
- `packages/tool-adapters` — LLM, web, exec, proof, and git adapters;
- `packages/ui` — shared UI primitives.

## API Surface

The API includes routes for:

- authentication;
- accounts;
- users;
- analytics;
- groups;
- settings;
- admin;
- data management;
- deduplication;
- jobs;
- upload sessions;
- import previews and presets;
- graph snapshots;
- nodes;
- edges;
- boards;
- content;
- search;
- spine;
- principals;
- workspaces;
- conversations;
- agents;
- metrics;
- system operations.

Base endpoint:

```txt
http://localhost:4001/api/v1
```

## Prerequisites

- Node.js `24.x`
- npm `>=9`

This repo intentionally supports npm only. `pnpm` and `yarn` are rejected by the preinstall check.

## Quick Start

```bash
npm install
npm run doctor:runtime
npm run dev
```

Default endpoints:

- API: `http://localhost:4001/api/v1`
- API ready: `http://localhost:4001/ready`
- API health: `http://localhost:4001/health`
- Web: `http://localhost:3000`

## Required Quality Gates

All root commands are authoritative and runnable from the repository root:

```bash
npm run doctor:runtime
npm run lint
npm run type-check
npm run test
npm run build
npm run test:auth
npm run migrate:to-local:dry-run
npm run sqlite:check
```

## Workspace Commands

```bash
npm run dev              # Orchestrated API + web startup
npm run dev:boot         # Env/dependency boot helper, then dev startup
npm run dev:check        # Check if API/web dev services are running
npm run dev:clean        # Same as dev, with port cleanup
npm run dev:reset        # Canonical reset: ports + local test DB cleanup
npm run validate         # Environment validation
npm run doctor:runtime   # Verify Node 24 + better-sqlite3 runtime health
npm run sqlite:check     # Run PRAGMA integrity_check on the configured DB
npm run sqlite:backup    # Create an online SQLite backup
npm run check-ports      # Detect port conflicts
npm run kill-ports       # Stop port conflicts
npm run factory-reset    # Full fresh reset; preserves admin@admin.com
npm run factory-reset:db-only
```

## Storage and Configuration

The maintained runtime contract is local-only:

- `STORAGE_MODE=local`
- `LOCAL_DOCS_PATH` is required
- `SQLITE_PATH` is required
- production support is limited to a single API instance on local disk-backed storage
- shared network filesystems are unsupported
- horizontal API scaling is unsupported
- serverless API deployment is unsupported with the current SQLite contract

Environment templates:

- API: `apps/api/.env.example`
- Web: `apps/web/.env.example`

Default local paths:

```txt
~/.keimenon
~/.keimenon/keimenon.db
```

## Authentication and Isolation

- Tenancy unit is `Account`.
- Canonical isolation key is `account_id`.
- Admin users may run cross-account operations where explicitly permitted.
- Client users are restricted to their own account scope.
- Agent participation is entitlement-gated.
- Conversation context references are validated against account scope.

## Account Tiers

The intended tier model is:

### Free

- similarity graph;
- objective layer;
- local-first storage;
- no autonomous agent runtime.

### Pro / Professional

- Free features;
- agent runtime;
- proof verification;
- external research;
- manual activation of agent workflows.

### Business

- Pro features;
- multi-principal account hierarchy;
- organization-scale collaboration semantics.

## Troubleshooting

### Node version failures

Use Node 24 and re-run:

```bash
npm run doctor:runtime
npm run node:check
```

`npm install` fails on the wrong Node major by design because `.npmrc` enforces `engine-strict=true`.

Only npm is supported for this monorepo. `pnpm` and `yarn` are intentionally rejected in `preinstall`.

If native modules were built under the wrong runtime, repair them with:

```bash
npm run runtime:repair
```

### Stuck dev/test processes

```bash
npm run kill-ports
npm run dev
```

### Reset local state manually

Back up your local SQLite file before deleting it:

- Default docs path: `~/.keimenon`
- Default DB file: `~/.keimenon/keimenon.db`

### Backup and restore

Use the SQLite-aware backup path instead of copying the live database file directly:

```bash
npm run sqlite:backup
npm run sqlite:backup -- --compress
npm run restore -- --file "<backup-file>"
```

Production backups should come from the mounted SQLite volume via SQLite's online backup path, not from ad hoc file copies while the API is live.
