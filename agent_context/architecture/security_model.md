# Architecture: Security Model

> **Invariant**: Security is enforced at the **Middleware Chain**, not in the Business Logic. Every request must pass `AuthN` -> `RBAC` -> `Isolation` gates.

## Authentication (AuthN)
- **Mechanism**: JWT (JSON Web Tokens).
- **Persistence**: Database-backed Sessions (revocable).
- **Lifecycle**:
    - Creation: Login/Register -> Session Row + JWT (7d expiry).
    - Verification: Middleware checks Signature + Expiry + DB Row existence.
    - Revocation: `DELETE FROM sessions` (logout or security event).

## Authorization (AuthZ) & RBAC
Hierarchy: `junior` < `senior` < `leader` < `admin`

| Role | Read | Create | Delete | Admin | Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **junior** | ✅ | ❌ | ❌ | ❌ | Viewers / Analysts |
| **senior** | ✅ | ✅ | ❌ | ❌ | Editors / Contributors |
| **leader** | ✅ | ✅ | ✅ | ❌ | Team Leads |
| **admin** | ✅ | ✅ | ✅ | ✅ | Account Owners |

## Multi-Tenant Isolation
**Strict Data Segregation**:
- **Schema**: Every active table (`nodes`, `edges`, `files`) MUST have `account_id`.
- **Query**: Every SQL query MUST include `WHERE account_id = ?`.
- **Middleware**: `isolateByAccount` middleware injects the filter automatically.
- **Exception**: System Admins (`account_type: admin`) may bypass filters for support.
