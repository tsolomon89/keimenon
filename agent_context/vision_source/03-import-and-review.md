# Theme 03: Import and Review

## Canonical statements
1. Import starts in a modal with drag/drop, processing feedback, and platform detection.
2. Import configuration must expose:
   - extraction (user, assistant)
   - branches (merged, separate)
   - minimum message length (numeric input)
   - processing mode (automatic, manual, hybrid)
   - groups (manual keyword groups)
   - duplicate detection controls
   - code extraction controls/settings
3. Import flow should be reusable for additional source/file types.
4. Duplicate detection runs before approval and feeds a hierarchical review UI.
5. Duplicate review UX should allow granular keep/compare/apply actions at multiple levels.
6. Duplicate handling is user-controlled and approval-based.
7. Agent bootstrap at import-time is manual-by-default; auto requires explicit enablement.

## De-duplication resolution
- The long repeated import prompt blocks were collapsed into a single import contract summary.
- Latest detailed field list is preferred over earlier abbreviated descriptions.

## Source refs
- `agent_context/Kiemenon.md:99`
- `agent_context/Kiemenon.md:157`
- `agent_context/Kiemenon.md:167`
- `agent_context/Kiemenon.md:169`
- `agent_context/Kiemenon.md:1272`
- `agent_context/Kiemenon.md:1276`