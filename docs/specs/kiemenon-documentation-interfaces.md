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
  "RenderLens": "2d|3d|nd",
  "NdProjectionConfig": {
    "dims": 8,
    "axes": [0, 1, 2],
    "sliceDim": 3,
    "sliceCenter": 0,
    "sliceWidth": 0.35
  }
}
```

- `RenderLens` is the shared UI/runtime lens selector used across graph canvas surfaces.
- `NdProjectionConfig` defines deterministic ND projection and slicing behavior.
