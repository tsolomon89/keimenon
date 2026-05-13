# Keimenon Agent OS

This directory houses the autonomous operating system for Keimenon agents, following Antigravity rules:

- **Agents are deciders.** (See /personas)
- **Skills are actions.** (See /skills)
- **Workflows coordinate.** (See /workflows)

## Directories

- **/personas**: Domain experts providing judgment, boundaries, and rules (e.g. sqlite-storage-specialist).
- **/skills**: Executable actions, scripts, and black-box capabilities (e.g.
  un-e2e-tests).
- **/workflows**: Multi-step coordination mechanisms triggering skills and personas via /workflow-name. Max 12k characters.
