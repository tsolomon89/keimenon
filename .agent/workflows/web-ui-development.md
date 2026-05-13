---
name: web-ui-development
description: 'Next.js/React changes ensuring data fetching, state, accessibility, and E2E impact.'
---

# web-ui-development

## Purpose

Next.js/React changes ensuring data fetching, state, accessibility, and E2E impact.

## Operational Details

- **Owning Persona**: web-app-engineer
- **When to Use**: Modifying Next.js pages or components
- **When NOT to Use**: Database migrations
- **Required Inputs**: Figma design or UI spec
- **Commands / Checks**: `npm run build`
- **Evidence Output**: Successful Next.js production build
- **Stop Conditions / Acceptance Criteria**: Build succeeds with no server-side hydration mismatches.

## Step-by-Step Procedure

1. Edit components in `apps/web`.
2. Ensure React context and props are typed.
3. Run build to ensure server/client boundaries are intact.
