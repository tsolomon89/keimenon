# Canonical Glossary

> **Statement of Truth**: This document defines the **Ubiquitous Language** of the Keimenon/Oblio system. All code, documentation, and communication MUST use these terms precisely as defined here. Synonyms are implicitly forbidden unless explicitly aliased.

## Core Entities

### Record
**Definition**: A persisted unit of state in the database.
**Contract**:
- MUST have a stable, globally unique `id`.
- MUST have a `kind` discriminator (e.g., `Asset`, `Entity`, `Link`).
- MUST be mutable via the `DatabaseClient`.
- **Constraint**: A Record is the "Source of Truth" at rest.

### Struct
**Definition**: An ephemeral, read-only projection of a Record, optimized for UI consumption (React props).
**Contract**:
- MUST be derived from a Record.
- MUST be immutable.
- SHOULD be shaped to match a specific UI component's interface.
- **Constraint**: A Struct is the "View State" in motion.

### Schema-as-Data
**Definition**: The architectural principle where the system's schema (types, fields, validation rules) is itself stored as Records in the database.
**Implication**: Modifying the schema is a runtime data operation (`INSERT`/`UPDATE`), not a compile-time code change.
**Contract**:
- Schema records MUST be loaded at runtime to validate data.
- Code generation based on schema records is PERMITTED but treated as a build-time optimization, not the source of truth.

## Architecture

### One App, Many Domains
**Definition**: The multi-tenant architecture where a single application instance serves multiple distinct websites (Domains) based on the incoming request's `Host` header.
**Synonyms**: Multi-Site Tenancy.

### Inventory Graph
**Definition**: The interconnected web of `Asset` and `Entity` records that represents the system's total knowledge base.
**Contract**:
- All nodes are reachable via traversal.
- Relationships are typed `Link` records.

### URL=Attribution
**Definition**: The principle that a Record's identity and provenance are intrinsically tied to its source URL.
**Contract**:
- If two records have the same canonical URL, they are the same Record.

## Runtime

### Entitlement
**Definition**: A specific feature or capacity granted to a Tenant.
**Examples**: "Can create 5 sites", "Access to AI Writer".

### Metering
**Definition**: The system that tracks usage of Entitlements against simplified limits.

### Tenant
**Definition**: An isolated customer account that owns resources (Domains, Records).
