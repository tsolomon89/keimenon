# Theme 06: Tenancy and Operations

## Canonical statements
1. Account switching must not leak prior account graph/view state.
2. Startup route behavior should be mode-aware:
   - admin can default to dashboard
   - users with no graph data should see a welcome/onboarding state
3. Settings/data controls are scoped:
   - user-level clear for own canvas data
   - admin-level clear for all client canvas data
4. Tenancy boundaries and UI mode transitions are part of core correctness, not optional polish.

## De-duplication resolution
- Bug-report style prompts were normalized into explicit operational requirements.

## Source refs
- `agent_context/Kiemenon.md:197`
- `agent_context/Kiemenon.md:225`
- `agent_context/Kiemenon.md:237`
- `agent_context/Kiemenon.md:53`