# Chat Import Feature - Testing Checklist

## Phase 1: Configuration UI Testing

### Basic Configuration Panel

- [ ] Panel renders correctly with all sections
- [ ] Default values are loaded correctly
- [ ] All form inputs are interactive (checkboxes, sliders, dropdowns)
- [ ] Configuration sections collapse/expand properly
- [ ] Help text tooltips display correctly

### Extraction Settings

- [ ] Include User Messages toggle works
- [ ] Include Assistant Messages toggle works
- [ ] Minimum Message Length slider updates value display
- [ ] Value range validation (1-1000 characters)

### Processing Mode

- [ ] Processing mode selection updates (Automatic/Manual)
- [ ] Branch handling selection works (Merged/Separate)
- [ ] Selection changes reflect in configuration state

### Code Extraction

- [ ] Extract Code toggle enables/disables code settings
- [ ] Deduplicate toggle works
- [ ] Minimum Code Length slider updates correctly
- [ ] Code settings are disabled when extraction is off

### Duplicate Detection (10 settings)

- [ ] Enable Duplicate Detection toggle works
- [ ] Exact Match Only checkbox works
- [ ] Similarity Threshold slider (0.0 - 1.0) works
- [ ] Cross-Conversation Detection checkbox works
- [ ] Algorithm dropdown (jaccard/levenshtein/cosine) works
- [ ] Normalize Tokens checkbox works
- [ ] Min Token Overlap slider works
- [ ] Length Ratio Tolerance slider works
- [ ] Ignore Whitespace checkbox works
- [ ] Ignore Case checkbox works
- [ ] Ignore Timestamp checkbox works
- [ ] Require Review checkbox works
- [ ] Auto-approve Exact Matches checkbox works
- [ ] Auto-merge Threshold slider works

### Configuration Presets

- [ ] Quick preset buttons render
- [ ] Speed preset applies correct config
- [ ] Balance preset applies correct config
- [ ] Thorough preset applies correct config
- [ ] Preset changes update all related fields
- [ ] Custom changes don't reset to preset

### Configuration Summary

- [ ] Summary displays current settings accurately
- [ ] Summary updates when settings change
- [ ] Key metrics are visible (extraction mode, code extraction, etc.)

## Phase 2: Duplicate Review Panel Testing

### UI Components

- [ ] Three-panel layout renders correctly (tree, comparison, actions)
- [ ] Progress bar updates as decisions are made
- [ ] Keyboard shortcut help text is visible

### Tree View (LHS)

- [ ] Groups display with candidate counts
- [ ] Groups can be selected
- [ ] Candidates within groups can be selected
- [ ] Selected items are highlighted
- [ ] Decision icons show next to reviewed items

### Comparison View (Center)

- [ ] Side-by-side view displays both messages
- [ ] Unified diff view works
- [ ] View mode toggle works
- [ ] Similarity score is visible
- [ ] Metadata (timestamps, conversation info) displays
- [ ] Content scrolling works for long messages

### Actions Panel (RHS)

- [ ] All four action buttons render (Keep Primary, Keep Duplicate, Keep Both, Merge)
- [ ] Action buttons are clickable
- [ ] Selected action is highlighted
- [ ] Action metadata/help text displays

### Keyboard Shortcuts

- [ ] `1` key triggers Keep Primary
- [ ] `2` key triggers Keep Duplicate
- [ ] `3` key triggers Keep Both
- [ ] `4` key triggers Merge
- [ ] `↑` arrow navigates to previous candidate
- [ ] `↓` arrow navigates to next candidate
- [ ] `Ctrl+Z` / `Cmd+Z` undoes last decision
- [ ] `Ctrl+Y` / `Cmd+Y` redoes last decision
- [ ] `Ctrl+Shift+Z` / `Cmd+Shift+Z` redoes
- [ ] `Esc` cancels review
- [ ] `Ctrl+Enter` / `Cmd+Enter` completes review

### Undo/Redo Functionality

- [ ] Undo button is disabled when no history
- [ ] Undo button is enabled after making decision
- [ ] Clicking undo reverts last decision
- [ ] Redo button is disabled when no future
- [ ] Redo button is enabled after undo
- [ ] Clicking redo re-applies decision
- [ ] History limit is respected (50 states)

### Bulk Actions

- [ ] Bulk Actions dropdown displays
- [ ] "Keep Primary for All" applies to current group
- [ ] "Keep Duplicate for All" applies to current group
- [ ] "Keep Both for All" applies to current group
- [ ] "Keep Primary Everywhere" applies to all groups
- [ ] "Keep Duplicate Everywhere" applies to all groups
- [ ] "Keep Both Everywhere" applies to all groups
- [ ] Bulk actions can be undone
- [ ] Progress updates after bulk action

### Navigation

- [ ] Auto-advance to next candidate after decision
- [ ] Auto-advance to next group when group completed
- [ ] Manual navigation doesn't lose decisions
- [ ] Progress percentage is accurate

### Completion

- [ ] Complete Review button is always visible
- [ ] Clicking Complete Review triggers callback with decisions
- [ ] Cancel button works
- [ ] Partial review can be completed

## Phase 3: Backend Integration Testing

### Import API Endpoints

- [ ] `POST /api/v1/import/chat` accepts single file
- [ ] `POST /api/v1/import/chat/batch` accepts multiple files
- [ ] `GET /api/v1/import/config/defaults` returns default config
- [ ] `POST /api/v1/import/chat/apply-decisions` accepts decisions
- [ ] `GET /api/v1/import/chat/decisions/status/:import_id` returns status

### File Upload

- [ ] JSON files upload successfully
- [ ] JSONL files upload successfully
- [ ] Multiple files upload in batch
- [ ] File size validation (max 10MB)
- [ ] File type validation (.json, .jsonl only)
- [ ] Invalid files show error message

### Configuration Conversion

- [ ] Frontend config converts to backend format correctly
- [ ] All duplicate detection settings are passed
- [ ] Code extraction settings are passed
- [ ] Processing mode settings are passed

### Import Processing

- [ ] Conversations are parsed correctly
- [ ] Messages are extracted
- [ ] Sources are generated
- [ ] Code blocks are extracted
- [ ] Duplicate groups are detected (when enabled)

### Response Handling

- [ ] Success response includes all data
- [ ] Error responses are handled gracefully
- [ ] Network errors show user-friendly message
- [ ] Timeout errors are handled
- [ ] Retry logic works for transient failures

### Apply Decisions

- [ ] Keep Primary removes duplicate
- [ ] Keep Duplicate removes primary
- [ ] Keep Both preserves both
- [ ] Merge combines messages
- [ ] Decision statistics are accurate

## Phase 4: Canvas Integration Testing

### State Management

- [ ] Canvas store initializes correctly
- [ ] Nodes can be added to store
- [ ] Edges can be added to store
- [ ] Selected nodes update in store
- [ ] Viewport state persists

### Data Conversion

- [ ] Import results convert to canvas nodes
- [ ] Conversation nodes are created
- [ ] Message nodes are created
- [ ] Source nodes are created
- [ ] Code asset nodes are created
- [ ] Edges connect nodes correctly

### Selection Sync

- [ ] Selecting node in canvas updates store
- [ ] Selecting multiple nodes works (Cmd/Ctrl+click)
- [ ] Select all (Cmd/Ctrl+A) works
- [ ] Clear selection (Esc) works
- [ ] Delete selected nodes (Delete/Backspace) works
- [ ] Selection state syncs between views

### Viewport Controls

- [ ] Zoom in button works
- [ ] Zoom out button works
- [ ] Fit view button works
- [ ] Pan viewport works
- [ ] Viewport limits are respected

## Phase 5: UI/UX Testing

### Toast Notifications

- [ ] Success toasts appear with green styling
- [ ] Error toasts appear with red styling
- [ ] Info toasts appear with blue styling
- [ ] Warning toasts appear with yellow styling
- [ ] Toasts auto-dismiss after duration
- [ ] Toasts can be manually dismissed
- [ ] Multiple toasts stack correctly
- [ ] Progress bar animates during duration

### Loading States

- [ ] Spinner loader displays during API calls
- [ ] Progress bar shows during file upload
- [ ] Skeleton loaders show while loading content
- [ ] Pulsing dot indicator works
- [ ] Loading overlay blocks interaction
- [ ] Processing steps show status icons
- [ ] Step status updates (pending → processing → completed → error)

### Error Handling

- [ ] File type errors show helpful message
- [ ] File size errors show max size
- [ ] Network errors suggest checking connection
- [ ] Validation errors highlight specific fields
- [ ] API errors show user-friendly messages
- [ ] 401 errors redirect to login
- [ ] 403 errors show access denied
- [ ] 404 errors show not found
- [ ] 500 errors show server error

### Responsive Design

- [ ] Layout works on desktop (1920x1080)
- [ ] Layout works on laptop (1366x768)
- [ ] Layout works on tablet (768x1024)
- [ ] Sidebars collapse on smaller screens
- [ ] Modals are scrollable on small screens
- [ ] Touch interactions work on mobile

## Phase 6: Integration Testing

### End-to-End Flow

- [ ] User can upload file from empty canvas
- [ ] File analysis shows preview
- [ ] Configuration panel allows customization
- [ ] Import starts with loading indicator
- [ ] Duplicate review panel opens (if duplicates found)
- [ ] User can review and make decisions
- [ ] Decisions can be applied
- [ ] Canvas updates with imported data
- [ ] Nodes appear in canvas viewport
- [ ] Success toast shows confirmation

### Chat Import Modal

- [ ] Modal opens when triggered
- [ ] File drop zone works
- [ ] File browse button works
- [ ] Selected files display with names and sizes
- [ ] Files can be removed before upload
- [ ] Platform detection shows correct platform
- [ ] Configuration expands/collapses
- [ ] Import button disabled without files
- [ ] Import button triggers upload
- [ ] Modal shows processing state
- [ ] Modal can be closed/cancelled

### First Time Experience

- [ ] Welcome modal shows for new users
- [ ] Welcome modal has clear CTAs
- [ ] Upload option button works
- [ ] Chat import option button works
- [ ] Dismiss button hides welcome modal
- [ ] Welcome flag is saved to localStorage
- [ ] Modal doesn't show again after dismiss

## Phase 7: Performance Testing

### File Processing

- [ ] Small files (<100KB) process quickly (<1s)
- [ ] Medium files (1-5MB) process reasonably (<5s)
- [ ] Large files (5-10MB) show progress indicator
- [ ] Batch upload handles 10 files
- [ ] Memory usage stays reasonable

### UI Performance

- [ ] No lag when typing in inputs
- [ ] Smooth scrolling in comparison view
- [ ] Fast navigation between candidates
- [ ] Keyboard shortcuts respond instantly
- [ ] Bulk actions complete in reasonable time

### Store Performance

- [ ] Canvas store handles 100+ nodes
- [ ] Selection updates are fast
- [ ] Viewport changes are smooth
- [ ] No memory leaks on repeated actions

## Phase 8: Edge Cases

### File Handling

- [ ] Empty file shows error
- [ ] Malformed JSON shows error
- [ ] Missing required fields handled
- [ ] Very long messages display correctly
- [ ] Special characters in content preserved
- [ ] Unicode characters render correctly

### Duplicate Detection

- [ ] Zero duplicates found (no review panel)
- [ ] One duplicate found
- [ ] Hundreds of duplicates handled
- [ ] Identical messages detected
- [ ] Similar but not exact messages detected
- [ ] Cross-conversation duplicates work

### User Actions

- [ ] Rapid clicking doesn't cause issues
- [ ] Concurrent actions are handled
- [ ] Undo/redo edge cases work
- [ ] Closing modal during upload handled
- [ ] Network disconnect during upload handled

### Data Integrity

- [ ] Decisions map is not corrupted
- [ ] Node IDs are unique
- [ ] Edge references are valid
- [ ] No orphaned nodes
- [ ] No circular references

## Phase 9: Accessibility Testing

### Keyboard Navigation

- [ ] All interactive elements are focusable
- [ ] Tab order is logical
- [ ] Focus indicators are visible
- [ ] Shortcuts don't conflict with browser

### Screen Readers

- [ ] Form labels are present
- [ ] Button purposes are clear
- [ ] Status updates are announced
- [ ] Error messages are announced

### Visual

- [ ] Color contrast meets WCAG AA
- [ ] Text is readable at default size
- [ ] Icons have text alternatives
- [ ] Focus states are visible

## Phase 10: Security Testing

### Input Validation

- [ ] File types are validated
- [ ] File sizes are validated
- [ ] File content is sanitized
- [ ] XSS attempts are blocked
- [ ] SQL injection attempts are blocked (if applicable)

### API Security

- [ ] Authentication is required
- [ ] Authorization is enforced
- [ ] Rate limiting works
- [ ] CORS is configured correctly
- [ ] File upload limits enforced

## Completion Criteria

All checkboxes above should be checked before considering the feature production-ready. Priority levels:

- **P0 (Critical)**: Must work for feature to function
- **P1 (High)**: Should work for good UX
- **P2 (Medium)**: Nice to have, can be fixed later
- **P3 (Low)**: Polish items

Any P0 or P1 failures must be fixed before release.
