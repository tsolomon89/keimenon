# Architecture Overview

## Runtime Model

Keimenon operates as a single runtime with account-based tenancy.

### High-Level Invariants

1. Single Runtime: all users run the same application code paths.
2. Account Isolation: data access is scoped by `account_id`.
3. Host/Client Routing: request routing is resolved by API/web runtime configuration.

## Layered Architecture

### 1. Core Engine

- Data model: `Record` persistence + `Struct` projections.
- Query model: `DatabaseClient` abstraction.
- Schema: validated through shared type contracts.

### 2. Domain Model

- Identity and account lifecycle.
- Knowledge graph entities and relationships.
- Import, deduplication, and verification workflows.

### 3. Presentation Layer

- Web and desktop clients render account-scoped graph views.
- UI state is derived from typed API responses.

### 4. Runtime Enforcement

- Authentication and permission checks.
- Account-scoped middleware and query filtering.
- Usage limits and operational guardrails.

## Deployment Topology

- Apps: `api`, `web`, `desktop`, `desktop-e2e`.
- Storage: local SQLite + local document store.
