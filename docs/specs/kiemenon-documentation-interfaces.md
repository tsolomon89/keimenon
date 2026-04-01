# Kiemenon Documentation Interfaces (AGENTS-canonical)

Status: Active
Last updated: 2026-03-27

## 1) Requirement Ledger Row Schema

Each requirement row must include the following fields:

```json
{
  "requirement_id": "KV-UX-001",
  "category": "ux|import|feature|tier|agent|data|ops",
  "statement": "Expected product behavior",
  "tier_scope": "free|pro|business|all",
  "ui_surface": "header|toolbar|canvas|import-modal|settings|api|worker|store|docs",
  "source_refs": ["agent_context/Kiemenon.md:61"],
  "priority": "P0|P1|P2",
  "acceptance_check": "Observable validation condition"
}
```

### ID prefixes

- `KV-UX`
- `KV-IMPORT`
- `KV-FEAT`
- `KV-TIER`
- `KV-AGENT`
- `KV-DATA`
- `KV-OPS`

## 2) Screen Spec Template Schema

```json
{
  "screen_id": "SCR-IMPORT-MODAL",
  "actors": ["client_user", "admin_user"],
  "entry_conditions": ["Precondition"],
  "controls": ["Visible interactive controls"],
  "states": ["idle", "loading", "error"],
  "events": ["user actions and system events"],
  "tier_visibility": "free|pro|business|all",
  "acceptance_checks": ["Expected outcomes"]
}
```

## 3) Traceability Matrix Row Schema

```json
{
  "requirement_id": "KV-IMPORT-001",
  "expected_behavior": "What should happen",
  "implementation_refs": ["apps/web/src/components/keimenon/ChatImportModal.tsx"],
  "status": "implemented|partial|missing|conflict",
  "gap_type": "none|coverage_gap|vision_drift|contract_drift",
  "risk": "user impact summary",
  "next_action": "concrete remediation"
}
```

## 4) Enforcement Rules

- Every `requirement_id` in modular specs must exist in `kiemenon-requirement-ledger.md`.
- Every matrix row must map to exactly one requirement ID.
- Every requirement must include at least one `source_ref` to `agent_context/Kiemenon.md`.
- `status=conflict` rows must set `gap_type=vision_drift` or `contract_drift`.
- AGENTS.md at repository root is canonical for this pass; `agent_context/Kiemenon.md` is supplementary evidence and must not override canonical AGENTS clauses.

## 5) Canvas Renderer Contracts

```json
{
  "GraphHierarchyNode": {
    "id": "string",
    "kind": "AccountNode|Principal|Source|Group|ObjectiveClaim|Derived",
    "account_id": "string",
    "parent_id": "string|null",
    "hierarchy_role": "account|owner|admin|member|agent|contact|content"
  },
  "ConversationContextScope": {
    "human_principal_id": "string",
    "agent_principal_id": "string|null",
    "context_spec": {
      "source_ids": "string[]",
      "group_ids": "string[]",
      "workspace_id": "string|null",
      "include_pinned": "boolean",
      "expansion_rule": "none|neighbors|connected"
    }
  },
  "RenderLens": "2d|3d|nd",
  "NdProjectionConfig": {
    "dims": 8,
    "axes": [0, 1, 2],
    "sliceDim": 3,
    "sliceCenter": 0,
    "sliceWidth": 0.35
  },
  "GraphInteractionContract": {
    "pick": "GraphPickResult(node|edge|null)",
    "selection": "replace|add|toggle semantics",
    "drag": "2d XY + 3d/nd projected-plane semantics",
    "hover": "edge tooltip metadata"
  }
}
```

- `GraphHierarchyNode` is the shared hierarchy visibility contract for account/principal/content graph rendering.
- `ConversationContextScope` is the server-validated principal/context binding for conversation thread creation and updates.
- `RenderLens` is the shared UI/runtime lens selector used across graph canvas surfaces.
- `NdProjectionConfig` defines deterministic ND projection and slicing behavior.
- `GraphInteractionContract` is shared across all graph canvas surfaces.
