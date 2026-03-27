# Theme 01: Layout and Shell

## Canonical statements

1. The product shell is a multi-region workspace with header, toolbar, navigator (LHS), inspector (RHS), footer/console, and central viewport.
2. Header and toolbar are separate bars: header contains global navigation and account controls, toolbar contains mode and workspace controls.
3. Navigator and inspector are independently collapsible; footer/console is independently collapsible.
4. Toolbar groups are alignment-based:
   - Left: show/hide navigator, inspector, console
   - Center: canvas controls (view controls + camera controls)
   - Right: mode and import controls
5. Canvas-mode toolbar controls are only visible when the canvas is the active mode.
6. Dashboard mode should be hidden for client accounts.

## De-duplication resolution

- Multiple transcript variants describe shell layout; the more explicit alignment/control spec is treated as canonical.

## Source refs

- `agent_context/Kiemenon.md:61`
- `agent_context/Kiemenon.md:225`
- `agent_context/Kiemenon.md:237`
