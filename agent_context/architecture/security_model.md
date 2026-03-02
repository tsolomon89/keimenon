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

| Role       | Read | Create | Delete | Admin | Use Case               |
| :--------- | :--- | :----- | :----- | :---- | :--------------------- |
| **junior** | ✅   | ❌     | ❌     | ❌    | Viewers / Analysts     |
| **senior** | ✅   | ✅     | ❌     | ❌    | Editors / Contributors |
| **leader** | ✅   | ✅     | ✅     | ❌    | Team Leads             |
| **admin**  | ✅   | ✅     | ✅     | ✅    | Account Owners         |

## Multi-Tenant Isolation

**Strict Data Segregation**:

- **Schema**: Every active table (`nodes`, `edges`, `files`) MUST have `account_id`.
- **Query**: Every SQL query MUST include `WHERE account_id = ?`.
- **Middleware**: `isolateByAccount` middleware injects the filter automatically.
- **Exception**: System Admins (`account_type: admin`) may bypass filters for support.

## Graph Collaboration Model

> **Invariant**: All Members of an Account share the same graph. RBAC governs what each Member can do, not what they can see.

**Per-operation enforcement**:

| Role       | Traverse/View | Create Nodes/Edges | Delete Nodes/Edges | Manage Users |
| :--------- | :------------ | :----------------- | :----------------- | :----------- |
| **junior** | Yes           | No                 | No                 | No           |
| **senior** | Yes           | Yes                | No                 | No           |
| **leader** | Yes           | Yes                | Yes                | No           |
| **admin**  | Yes           | Yes                | Yes                | Yes          |

**Collaboration behavior**:

- Graph data (nodes, edges) is visible to all Members regardless of role.
- Creation/deletion actions are blocked at the API middleware layer for insufficient permissions.
- No per-node ownership—once created, a node belongs to the Account, not the creating user.
- Audit trails (via `created_by`, `updated_at` metadata) track who made changes.
