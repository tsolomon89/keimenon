# Keimenon - Agent Skills

**Project-Specific Skills for AI-Assisted Development**

This directory contains executable Skills that operate within the Keimenon Agent OS.

## Antigravity Orchestration Architecture

- **Skills** are reusable capabilities/actions (execution).
- **Personas** decide _when_ and _how_ skills are used (judgment).
- **Workflows** orchestrate the interaction between personas and skills to achieve outcomes.

## Anatomy of a Skill

Each skill in this directory contains:

- **Purpose**: What the skill accomplishes.
- **When to Use**: Activation conditions.
- **When NOT to Use**: Boundary conditions.
- **Inputs Expected**: Parameters required.
- **Outputs Produced**: Evidence or code generated.
- **Tools**: Which CLI commands or MCP servers it is allowed to use.
- **Safety Constraints**: Rules preventing destructive actions.

_(Note: These skills were previously located in `.claude/skills` but have been migrated to `.agent/skills` to fit the Antigravity OS standards.)_
