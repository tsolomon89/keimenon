# AI Agent Workflow

**Status**: `ACTIVE`
**Invariant**: This module defines the canonical workflow and explicit constraints for all AI agents (including Corpus-Bot and others) operating within the Keimenon/Oblio system.
**Rule**: Agents MUST strictly adhere to this workflow to ensure data consistency, architectural adherence, and predictable outcomes.

## Core Operations

### 1. Initialization and Context Gathering

When an agent starts a task or conversation, it MUST establish its context:

- **MUST** read `manifest.yaml` to build a load plan of the system's architecture and domain boundaries.
  - _Acceptance Check_: The agent's first file interactions explicitly include reading `manifest.yaml`.
- **MUST** consult `glossary.md` to ensure term precision and avoid unauthorized synonyms.
  - _Acceptance Check_: Artifacts and outputs use strict terminology; no unapproved synonyms are introduced without corresponding updates to the glossary.
- **SHOULD** review existing modules in `agent_context/` that are relevant to the task before writing any code or documentation.

### 2. Execution Constraints

Agents are permitted to act autonomously within bounds:

- **MUST** verify the effects of changes using automated tools (e.g., test suites) before concluding a task.
  - _Acceptance Check_: A visible run of a bash command (like a syntax check or testing hook) or equivalent MCP server query is present before task conclusion.
- **MUST NOT** fabricate details, parameters, or specifications not grounded in the existing Homoiconic Fact Store.
  - _Acceptance Check_: Every technical claim maps to an explicit record, `.mcp.json` definition, or explicit user instruction.
- **SHOULD** use Model Context Protocol (MCP) servers (as defined in `.mcp.json`) to interact with databases, testing frameworks, and external tools instead of writing custom connection code.

### 3. Documentation Synthesis (Corpus-Bot Role)

When acting as a synthesizer or updating the `agent_context` corpus:

- **MUST** write atomic micro-modules (one concept per file).
  - _Acceptance Check_: Any new Markdown file targets 1-4k tokens. Exceeding boundaries triggers a file split.
- **MUST** enforce behavioral contracts using RFC 2119 keywords (`MUST`/`SHOULD`/`MAY`).
  - _Acceptance Check_: "We might" or "probably" verbiage is replaced by explicit `SHOULD` or formal `Open Decision` blocks constraint.
- **MUST** explicitly quarantine ambiguities or unverified assumptions in the `60_open_questions` directory.
  - _Acceptance Check_: The documentation clearly states a minimal falsification test for the unverified assumption ("What observation would choose option A over B?").
- **MAY** propose new canonical terms, but these MUST be added to `glossary.md`.

## Resolution Rules

If an agent encounters a contradiction between documentation and codebase reality:

- **MUST** prefer codebase reality if it is functioning and tested.
  - _Acceptance Check_: Codebase functionality, especially when backed by recent Git history or tests, overrides stale prose in the corpus.
- **MUST** update the documentation to match the codebase, logging the change if required.
- **SHOULD** alert the user if the contradiction implies a fundamental architectural violation.
