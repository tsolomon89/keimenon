# Kiemenon UI/UX Architecture Spec (AGENTS-canonical)

Status: Active
Last updated: 2026-03-27

## 1) Shell Architecture

The shell is a persistent multi-region workspace:
- Header (global navigation/search/account)
- Toolbar (workspace/mode controls)
- Navigator sidebar (left)
- Inspector sidebar (right)
- Footer/console bar (bottom)
- Main viewport (center canvas/dashboard/settings content)

Requirements: `KV-UX-001`, `KV-UX-002`, `KV-UX-003`

### Region behavior
- Navigator, inspector, and footer are independently togglable.
- Header remains visible across all modes.
- Toolbar remains visible across all modes, but center-group controls are canvas-only.

Requirements: `KV-UX-003`, `KV-UX-004`

## 2) Toolbar Contract

### Left group
- Toggle navigator
- Toggle inspector
- Toggle footer/console

### Center group (canvas mode only)
- Lens controls (`2D`, `3D`, `ND`)
- Camera controls (zoom in/out, center)
- LOD controls (focus mode, connector visibility, pinned-subgraph clear)
- ND slice controls when ND lens is active

### Right group
- Mode controls (canvas/dashboard/settings)
- Import entry point
- Dashboard mode must be unavailable to client accounts

Requirements: `KV-UX-004`, `KV-UX-005`

## 3) Navigation + Inspector Contract

### Navigator information architecture
- Boards section
- Groups/Folders tree
- Filters section

### Selection semantics
- Group/folder selection updates canvas scope and inspector context
- Canvas selection updates navigator highlights and inspector details
- Multi-select uses standard ctrl/cmd and shift patterns

Requirements: `KV-UX-006`, `KV-UX-007`, `KV-FEAT-004`

## 4) Canvas and LOD Contract

### Visual model
- Memory-board graph with linked sources
- Three.js canonical rendering for all graph canvas surfaces
- Dimensional lenses (`2D`, `3D`, `ND`) with deterministic ND projection/slicing
- Multi-scale abstraction (galactic to detailed)
- Progressive detail/culling behavior by zoom and focus

### Labeling
- Prefer human-readable source/title labels
- Use technical IDs only as fallback

Requirements: `KV-FEAT-001`, `KV-FEAT-003`, `KV-UX-008`

## 5) Mode Model

- `keimenon` mode: graph workspace and import/investigation operations
- `dashboard` mode: analytics/CRM/admin workspace
- `settings` mode: system/user controls and data management

Client-mode restrictions:
- Dashboard path is not user-selectable for client accounts

Requirements: `KV-UX-005`, `KV-TIER-001`, `KV-TIER-003`

## 6) Responsive Behavior

- Mobile viewport may auto-collapse sidebars.
- Desktop retains concurrent multi-panel workflows.
- Core actions (import, mode switch, selection inspection) remain reachable.

Requirements: `KV-UX-001`, `KV-UX-007`

## 7) Drift Status

- No open AGENTS-canonical UI/UX drift items in this revision.
- Traceability status and evidence are maintained in the canonical matrix artifacts.
