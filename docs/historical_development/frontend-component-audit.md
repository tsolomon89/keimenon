# Frontend Component Audit (October 2025)

## Global Shell & Providers

- `apps/web/src/app/layout.tsx:8` composes the universal shell. The tree wraps Next content with `SentryProvider → ErrorBoundary → AuthProvider → OperatingProvider → ShellProvider → UIVersionProvider`. All downstream UI assumes these contexts exist.
- Auth, operating-mode, shell-mode, UI version, background job, import progress, and console contexts (`apps/web/src/contexts/*.tsx`) are the primary state sources the rest of the frontend consumes.

## Route Map & Entry Points

| Route                       | View / State           | Entry Component(s)                                                                  | Notes                                                                                                              |
| --------------------------- | ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/`                         | Auth redirect          | `apps/web/src/app/page.tsx:6`                                                       | Pushes authenticated users to `/canvas`, anonymous users to `/login`.                                              |
| `/canvas`                   | Main workspace         | `apps/web/src/app/canvas/page.tsx:14`                                               | Loads providers for console, background ops, import progress; hydrates graph via `useCanvasStore.loadGraphData()`. |
| `/board/[id]`               | Legacy board (CRM)     | `apps/web/src/app/board/[id]/page.tsx:10`                                           | Uses `@canvas-memory/ui/FourRegionLayout` and bare `Canvas2D`; edges still `TODO`.                                 |
| `/ingest`                   | Legacy ingest flow     | `apps/web/src/app/ingest/page.tsx:10`                                               | Directly posts files to `/api/v1/ingest/files`; bypasses new local-first pipeline.                                 |
| `/account`                  | Workspace summary      | `apps/web/src/app/account/page.tsx:10`                                              | Fetches account stats and surfaces plan/tier badges.                                                               |
| `/users`                    | User directory         | `apps/web/src/app/users/page.tsx:11`                                                | Lists account users, links to create/edit views.                                                                   |
| `/users/new`, `/users/[id]` | User create/edit       | `apps/web/src/app/users/new/page.tsx:11`, `apps/web/src/app/users/[id]/page.tsx:11` | Mutations via `createUser`, `updateUser`.                                                                          |
| `/login`, `/register`       | Auth screens           | `apps/web/src/app/login/page.tsx:9`, `apps/web/src/app/register/page.tsx:9`         | Pure client forms hooked into `AuthContext`.                                                                       |
| `/test-error`               | Error boundary sandbox | `apps/web/src/app/test-error/page.tsx:22`                                           | Retained for QA; flagged as deletable when finished.                                                               |

## Canvas Workspace (`/canvas`)

### Mode & State Sources

- `CanvasLayout` (`apps/web/src/components/canvas/CanvasLayout.tsx:30`) is the top-level workspace frame. It reacts to:
  - `shellMode`/`canvasMode` from `ShellContext` (`apps/web/src/contexts/ShellContext.tsx:55`).
  - Operating account data from `OperatingContext` (`apps/web/src/contexts/OperatingContext.tsx:36`).
  - UI variant from `UIVersionContext` (`apps/web/src/contexts/UIVersionContext.tsx:33`).
  - Graph data and selection from `useCanvasStore` (`apps/web/src/store/canvasStore.ts:26`).
  - Background job feed via `useJobStream` (`apps/web/src/hooks/useJobStream.ts:27`).

### Component Tree (Legacy UI mode)

- Header: `CanvasHeader` (`apps/web/src/components/canvas/CanvasHeader.tsx:12`) renders breadcrumbs, search CTA, tier badges, account switcher, import progress indicator, and user menu.
- Left rail: `CanvasSidebar` with `side="left"` (`apps/web/src/components/canvas/CanvasSidebar.tsx:48`) hosts mode-aware navigation:
  - Uses `NavigationModelFactory` to switch between groups, accounts, and settings trees.
  - Integrates `useGroupsTree`, `useAccountTree`, `useSettingsTree` for data.
  - Opens `CreateAccountModal` (`apps/web/src/components/modals/CreateAccountModal.tsx:11`) when CRM tree exposes a create button.
- Toolbar: `CanvasToolbar` (`apps/web/src/components/canvas/CanvasToolbar.tsx:42`) toggles sidebars, console, zoom controls, and canvas/dashboard/settings modes. Only the 2D view is implemented; 3D toggles are placeholders.
- Main viewport: wrapped by `PortalWrapper` (`apps/web/src/components/canvas/PortalWrapper.tsx:16`) to show admin-only banners. Content switches on `canvasMode`:
  - `canvas`: `CanvasViewport` (`apps/web/src/components/canvas/CanvasViewport.tsx:22`) → `Canvas2D` (`apps/web/src/components/canvas/Canvas2D.tsx:23`) for graph rendering.
  - `dashboard`: `CRMDashboard` (`apps/web/src/components/canvas/CRMDashboard.tsx:89`) for analytics; falls back to a client placeholder when `shellMode !== 'crm'`.
  - `settings`: `SettingsPage` (`apps/web/src/components/settings/SettingsPage.tsx:34`) with on-demand inspectors.
- Right rail: `CanvasSidebar` with `side="right"` hosts inspectors (`SelectionStack`, `SourceInspector`, `AccountInspector`, `ImportFlowPanel`, `SettingsInspector`, `UserDetailInspector`).
- Footer: `CanvasFooter` (`apps/web/src/components/canvas/CanvasFooter.tsx:15`) surfaces console/log/task panes backed by `ConsoleContext`.
- Overlays & modals:
  - `FirstTimeUploadModal` (`apps/web/src/components/canvas/FirstTimeUploadModal.tsx:7`) on first run.
  - `LocalFirstImportModal` (`apps/web/src/components/canvas/LocalFirstImportModal.tsx:46`) – new local-first ingestion flow tied to `ImportProgressContext`.
  - `UploadModal` (`apps/web/src/components/canvas/UploadModal.tsx:12`) – legacy server upload, reachable via shift-click.
  - `ChatImportModal` (`apps/web/src/components/canvas/ChatImportModal.tsx:28`) – job-backed chat ingestion.
  - `NodeDetailPanel` (`apps/web/src/components/canvas/NodeDetailPanel.tsx`) overlays node details when opened from inspectors.

### Navigation Behaviour Highlights

- Navigation model switching lives in `NavigationModelFactory` (`packages/types/src/navigation.model.ts:56`). Settings mode always shows the settings tree; CRM dashboard shows account tree; default falls back to groups.
- Group selection triggers `fetchGroupMembers` and filters the canvas store (`apps/web/src/components/canvas/CanvasSidebar.tsx:200` onward), but zoom-to-fit remains `TODO`.
- Inspector panels push/pop local history for back-navigation (`CanvasSidebar.tsx:380`).

### Primitives UI Variant

- When `uiVersion === 'primitives'`, `CanvasLayout` swaps to `PrimitivesBody` (`apps/web/src/components/primitives/PrimitivesBody.tsx:18`). This path currently uses mock data and adapters (`components/adapters/*`); it is suitable for demos but not wired to live data yet.

### Modals, Their Triggers, and Status

| Component                     | Path                                                                                     | Trigger(s)                                | Backend / Store Hook                               | Status                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| FirstTimeUploadModal          | `apps/web/src/components/canvas/FirstTimeUploadModal.tsx:7`                              | Auto on first visit (`localStorage` flag) | None yet (just CTA)                                | Shipping, contains non-ASCII glyphs in copy.            |
| LocalFirstImportModal         | `…/LocalFirstImportModal.tsx:46`                                                         | Toolbar upload, default path              | Uses `LocalImportService`, `ImportProgressContext` | Primary ingestion path; TODO refresh IndexedDB results. |
| UploadModal                   | `…/UploadModal.tsx:12`                                                                   | Shift+upload                              | Direct POST to `/api/v1/ingest/files`              | Legacy; kept for comparison.                            |
| ChatImportModal               | `…/ChatImportModal.tsx:28`                                                               | Toolbar “Import & Review”                 | Jobs API + SSE (`useJobStream`)                    | Active; duplicate review panels wired.                  |
| CreateAccountModal            | `…/CreateAccountModal.tsx:11`                                                            | CRM nav `+` button                        | POST `/api/v1/accounts`                            | Needs account tree refetch on success (`TODO`).         |
| CreateUserInAccountModal      | `…/CreateUserInAccountModal.tsx:15`                                                      | CRM inspector actions                     | POST `/api/v1/accounts/:id/users`                  | For single/multi-account flows.                         |
| StreamingUploadModal          | `apps/web/src/components/import/StreamingUploadModal.tsx:30`                             | _Not referenced_                          | Legacy job uploader                                | Orphaned.                                               |
| ChatImportModal.old / .backup | `apps/web/src/components/canvas/ChatImportModal.old.tsx`, `…/ChatImportModal.tsx.backup` | _Not referenced_                          | —                                                  | Safe to delete or archive.                              |

## Legacy & Secondary Views

- **BoardPage** (`apps/web/src/app/board/[id]/page.tsx:10`): Fetches nodes directly and renders via `Canvas2D`. Edges remain stubbed (`TODO`), and the layout bypasses new contexts. Acts as a fallback/legacy CRM board.
- **IngestPage** (`apps/web/src/app/ingest/page.tsx:10`): Uses the old `FileUploadZone`, `UploadProgress`, and `IngestResults` components. Uploads synchronously and calls `alert` on error. Consider retiring once local-first flow is fully adopted.
- **Account/User Management** (`apps/web/src/app/account/page.tsx:10`, `/users` stack): Mostly functional but rely on `console.error`/`alert` instead of routed logging. Permissions and redirects handled via `AuthContext`.
- **Test Error Playground** (`apps/web/src/app/test-error/page.tsx:22`): Exercises `ErrorBoundary`; flagged for deletion when QA is complete.

## Orphaned / Stale Components

- `apps/web/src/components/canvas/StorageStatsDashboard.tsx:4` – legacy stats card, unused.
- `apps/web/src/components/canvas/GraphControls.tsx:20` and `GroupCard.tsx:15` – extracted for earlier demos; no current imports.
- `apps/web/src/components/canvas/SourceTreeView.tsx:24` – unused tree viewer.
- `apps/web/src/components/import/StreamingUploadModal.tsx:30` – superseded by local-first flow.
- Duplicate backup files `ChatImportModal.old.tsx` and `ChatImportModal.tsx.backup`.
  These should either be wired into new flows, moved to an archive namespace, or removed to prevent drift.

## Logging & Console Integration

### Already Instrumented

- Hooks and services interacting with APIs (`useAccountTree`, `useGroupsTree`, `useSettingsTree`, `useSettings`, `ImportFlowPanel`, `CRMDashboard`, `DataManagementCard`, `ImportsTableCard`) consistently call `errorCapture` or the `log*` helpers.
- `AuthContext` logs significant events with `logApiEvent` (`apps/web/src/contexts/AuthContext.tsx:399`).
- `BackgroundOperationsContext` merges SSE job events into the console/state feeds (`apps/web/src/contexts/BackgroundOperationsContext.tsx:199`).

### Gaps & Recommendations

- Core workspace components still rely on `console.log` / `console.error`:
  - `CanvasHeader` search hotkey placeholder shows as garbled text (`apps/web/src/components/canvas/CanvasHeader.tsx:117`) and lacks structured logging around account switching failures.
  - `CanvasSidebar` emits verbose `console.log` for navigation and selection (`apps/web/src/components/canvas/CanvasSidebar.tsx:156`, `:220`) but does not forward failures (e.g., `fetchGroupMembers` catch block) to `errorCapture`.
  - `CanvasViewport` debug logs and error UI rely on `console` (`apps/web/src/components/canvas/CanvasViewport.tsx:96`, `:150`); hook into `logDataEvent` for load success/failure and bubble errors to the console footer.
  - `Canvas2D` traces renders through `console.log` (`apps/web/src/components/canvas/Canvas2D.tsx:43`); convert to `errorCapture.debug` or remove for production.
  - Auth-adjacent components (`UserList`, `UserForm`, account/users pages) surface errors via `alert` or `console.error`. Wrap mutations with `errorCapture.capture` and push summaries to the console footer for supportability.
- SSE logging in `useJobStream` includes corrupted glyphs (`apps/web/src/hooks/useJobStream.ts:128`, `:170`). Normalise to plain ASCII and forward connection state changes to the console via `errorCapture.info`.
- `AccountSwitcher` hardcodes emoji-like glyphs (`apps/web/src/components/auth/AccountSwitcher.tsx:32`) that render as mojibake; migrate to Lucide icons and log switch failures with `errorCapture`.
- Adopt `logDataEvent` for high-value events (imports completed, graph filtered) so they surface cleanly inside `CanvasFooter`’s Logs tab.

## UI & UX Issues Observed

- Non-ASCII artefacts appear across the UI (search hotkey, SSE logs, AccountSwitcher icons, modal copy). These should be replaced with real keyboard shortcut hints and icons.
- `CanvasToolbar` exposes 3D view toggles but no 3D renderer exists; button should be hidden or flagged as “coming soon” to avoid confusion (`apps/web/src/components/canvas/CanvasToolbar.tsx:95`–`:136`).
- Admins lack an explicit “Portal/Manager” mode toggle. Currently, clicking “Canvas” retains `shellMode='crm'`; consider adding an explicit portal switch in the toolbar or header badge to mirror product terminology.
- `FirstTimeUploadModal` “Don’t show again” checkbox is inert; the dismissal logic only uses `localStorage` in the parent (`apps/web/src/app/canvas/page.tsx:52`). Persist checkbox state.
- Settings panels (`SettingsPage.tsx:210`) rely on `TODO` references for audit/history and refresh semantics; ensure backend integration is tracked.

## Suggested Next Actions

1. **Normalize logging:** Replace ad-hoc `console` usage in workspace, auth, and ingest flows with `errorCapture` / `logApiEvent` / `logDataEvent` so everything surfaces in the console footer.
2. **Retire or migrate legacy views:** Archive `board/[id]`, `ingest`, and orphaned canvas components once the local-first + primitives flows are production ready.
3. **Fix mojibake & UX polish:** Update keyboard shortcut hints, replace corrupted glyphs, hide unfinished view toggles, and wire “Don’t show again” behaviour.
4. **Navigation clarity:** Expose shell-mode switching UI (Manager ↔ Portal) and document current behaviour for dashboard vs canvas vs settings.
5. **Document primitives path:** Clarify that `PrimitivesBody` is experimental; surface telemetry/logging there before rolling out.

This audit should provide the full component map, highlight unused/deprecated pieces, and pinpoint logging gaps so future agents (and the console component) receive actionable telemetry.
