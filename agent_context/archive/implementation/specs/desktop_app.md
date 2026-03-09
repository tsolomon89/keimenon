# Spec: Desktop Application

> **Invariant**: "Single Install = Full Product". The desktop app contains the full engine, UI, and storage. Cloud is only for identity and licensing.

## Architecture: Local-First

- **Shell**: Chromium-based window (Electron).
- **Local Engine**:
  - **Storage**: SQLite (Content, Search, Ops).
  - **Compute**: Ingestion, Graph Builder, and AI Parsing run on-device.
  - **Networking**: Offline-tolerant. Syncs entitlements on connection.

## Data Residency Contract

1.  **User Content**: Stays local by default.
2.  **Cloud Plane**: Stores Identity, Billing, and License Entitlements.
3.  **AI Providers**: Data only leaves when user explicitly invokes an AI Agent (BYOK).

## Subsystems

### AI JSON Combo Parser (Ingestion)

A specialized pipeline for dealing with messy AI exports.

- **Inputs**: JSON/MD mixtures, truncated arrays, trailing commas.
- **Output**: Canonical "NIR" (Normalized Intermediate Representation).
- **Failure Mode**: Partial success with warnings (never crash on bad JSON).

### Job System

- **State**: Persistent (SQLite).
- **Behavior**: Resumable, crash-safe, detailed progress UI.

## Desktop/Web Feature Parity

> **Invariant**: Desktop and Web are functionally identical. The only difference is deployment topology.

| Layer        | Desktop                                | Web                                |
| :----------- | :------------------------------------- | :--------------------------------- |
| **API**      | Embedded (localhost)                   | Remote server                      |
| **Database** | Local SQLite                           | Same schema, remote or local       |
| **UI**       | Same Next.js app (loaded via `app://`) | Same Next.js app (served via HTTP) |
| **Auth**     | Same JWT/session system                | Same JWT/session system            |

**Shared capabilities** (no feature gaps):

- Account management and multi-account switching
- User RBAC (junior/senior/leader/admin)
- Full graph operations (nodes, edges, traversal)
- Import/export workflows
- Job system with progress tracking
- Agent/Task execution
