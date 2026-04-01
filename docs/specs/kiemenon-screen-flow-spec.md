# Kiemenon Screen and Flow Spec (AGENTS-canonical)

Status: Active
Last updated: 2026-04-01

## Screen template

- `screen_id`
- `actors`
- `entry_conditions`
- `controls`
- `states`
- `events`
- `tier_visibility`
- `acceptance_checks`

## SCR-IMPORT-MODAL

- Actors: `client_user`, `admin_user`
- Entry conditions: user triggers import from toolbar/inspector
- Controls: drag/drop, platform detection badge, extraction, branches, min length, processing mode, groups, duplicate detection, code extraction
- States: `idle`, `analyzing`, `uploading`, `processing`, `review_required`, `complete`, `error`
- Events: submit import config, receive job updates, transition to duplicate review
- Tier visibility: all
- Acceptance checks: full config surface available before submit; job progress visible; review transition is explicit when required

Requirements: `KV-IMPORT-001` through `KV-IMPORT-008`

## SCR-DUPLICATE-REVIEW

- Actors: `client_user`, `admin_user`
- Entry conditions: import has review candidates and review is required
- Controls: per-candidate decisions, bulk actions, apply decisions, scope-level approvals
- States: `pending`, `partially_resolved`, `ready_to_apply`, `applied`, `error`
- Events: set decision, bulk decision, apply
- Tier visibility: all
- Acceptance checks: decisions are job-scoped; user actions are explicit; no silent destructive merge

Requirements: `KV-IMPORT-008`, `KV-DATA-003`

## SCR-CANVAS-WORKSPACE

- Actors: `client_user`, `admin_user`
- Entry conditions: user in keimenon mode
- Controls: toolbar groups, lens controls (`2D`/`3D`/`ND`), camera + LOD controls, navigator tree, inspector content panes
- States: `empty`, `loaded`, `filtered`, `multi_selected`
- Events: select node/group/folder, apply scope filter, inspect item
- Tier visibility: all
- Acceptance checks: selection synchronization across navigator/canvas/inspector; usable at large scale across all three lenses

Requirements: `KV-UX-001` through `KV-UX-008`, `KV-UX-013`, `KV-FEAT-003`, `KV-FEAT-006`

## SCR-CONVERSATION-CONTEXT

- Actors: `client_user`, `admin_user`, `agent_principal` (entitled)
- Entry conditions: user opens or creates a conversation thread in account context
- Controls: principal selection, optional agent attachment, context source/group/workspace selectors
- States: `draft`, `validated`, `created`, `invalid_scope`, `entitlement_blocked`
- Events: create thread, update context, validate principal/context scope
- Tier visibility: all for human context; agent participation constrained by entitlement
- Acceptance checks: invalid principal/context references are rejected; successful responses return context indicators and resolved principal identity

Requirements: `KV-AGENT-004`, `KV-TIER-001`

## SCR-DASHBOARD-AND-SETTINGS

- Actors: `admin_user` primary, `client_user` restricted
- Entry conditions: user switches mode from toolbar or shell defaults
- Controls: dashboard surface toggles, settings sections, data management actions
- States: `dashboard`, `settings`, `blocked` (when unauthorized)
- Events: mode switch, data clear trigger, account/user admin actions
- Tier visibility: dashboard/admin controls are role/tier constrained
- Acceptance checks: client users cannot access admin-only dashboard behavior; settings honor permission gates

Requirements: `KV-UX-005`, `KV-TIER-003`, `KV-OPS-002`

## SCR-ACCOUNT-SWITCH

- Actors: multi-account users, admins in operating mode
- Entry conditions: account switch selection event
- Controls: account switcher, reload/refresh semantics
- States: `switching`, `reloading`, `ready`, `error`
- Events: clear caches/state, token switch, hard reload, route re-entry
- Tier visibility: all (where multi-account applies)
- Acceptance checks: no cross-account graph bleed; destination account context is cleanly loaded

Requirements: `KV-OPS-001`, `KV-UX-006`, `KV-UX-007`
