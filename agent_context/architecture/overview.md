# Architecture Overview

## The "One App, Many Domains" Model

Keimenon/Oblio version 5 operates on a **Multi-Site Tenancy** architecture. A single deployment (the "App") serves multiple, distinct, customer-facing websites ("Domains").

### High-Level Invariants
1.  **Single Runtime**: All tenants share the same executed code (Next.js/Node.js).
2.  **Data Isolation**: Data is logically isolated by `tenant_id` at the database query level.
3.  **Host-Based Routing**: The active Domain is resolved exclusively via the HTTP `Host` header.

## Layered Architecture

### 1. The Core Engine (Physics)
The foundation of the system.
- **Data Model**: Everything is a `Record`.
- **Query Model**: Universal `DatabaseClient` abstraction.
- **Schema**: Stored as data, loaded at runtime.

### 2. The Domain Model (Business Logic)
The rules that govern the entities.
- **Inventory Graph**: Assets, Entities, and their relationships.
- **Identity**: System-wide user and tenant management.
- **Attribution**: URL-based provenance.

### 3. The Visual Engine (Presentation)
The projection of data onto the screen.
- **Record -> Struct Transformation**: Converting database rows to React props.
- **Component Registry**: Dynamic loading of UI blocks.
- **Theme System**: Domain-specific styling.

### 4. The Runtime (Enforcement)
The guardrails of the system.
- **Tenancy**: Account isolation.
- **Entitlements**: Feature gating.
- **Metering**: Usage tracking.

## Deployment Topology
- **Apps**: `api` (Backend), `web` (Frontend/Admin), `marketing` (Public sites).
- **Storage**: SQLite (Local/Dev) or Neo4j (Production Graph).
