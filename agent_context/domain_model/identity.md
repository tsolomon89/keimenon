# Domain Model: Identity

> **Invariant**: Identity is hierarchical. A User exists *within* a Tenant context for most operations ("Member"), but has a global existence for Authentication ("Principal").

## Core Entities

### User
**Definition**: A human or agent principal capable of authenticating.
**Contract**:
- MUST have a global `id` (UUID).
- ALIAS: Refers to the "Principal" record.

### Tenant
**Definition**: The unit of isolation and billing.
**Contract**:
- MUST own all data Resources (Assets, Entities).
- MUST have > 0 Member Users.
- **Isolation**: Data leakage between tenants is a critical failure.

### Member
**Definition**: The association between a User and a Tenant.
**Contract**:
- Defines `roles` (e.g., `admin`, `editor`) specific to that Tenant.
- A User MAY be a Member of multiple Tenants.

## Authentication vs Authorization

| Layer | Responsibility | Entity |
| :--- | :--- | :--- |
| **AuthN** (Who) | Verify credentials (JWT/Password) | `User` |
| **AuthZ** (Can) | Verify permissions (Roles/Entitlements) | `Member`, `Entitlement` |
