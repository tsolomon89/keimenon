# Ethos Architecture Corrections - Complete

**Date:** 2025-11-07
**Status:** ✅ CORRECTIONS APPLIED
**Version:** 1.0.1 (Updated from 1.0.0)

---

## Overview

Corrected the operational ethos encoding to reflect **documented architectural truth** from official Claude Code documentation rather than assumptions. The ethos now accurately describes how the Task agent system actually works.

---

## What Was Wrong (Original Encoding)

### 1. **Incorrect: Agent Trees / Recursive Spawning**

**Original Claim:**

> "Complex work naturally decomposes into agent trees."
> "`max_task_agent_depth`: 5"

**Architectural Truth:**

- Task agents CANNOT spawn other Task agents
- Hierarchy is flat: main agent → Task agent only
- No recursive spawning possible

**Why This Mattered:**

- We encoded a capability that doesn't exist
- This was aspiration, not reality

### 2. **Incorrect: Context Inheritance**

**Original Claim:**

> "Spawn a Task agent for next phase (automatic context inheritance)"
> "`context_inheritance`: automatic"

**Architectural Truth:**

- Each Task agent has SEPARATE context window
- No context inheritance whatsoever
- Task agents start with clean slate (cold start)
- Context must be passed EXPLICITLY in prompt

**Why This Mattered:**

- Fundamentally misrepresented how Task agents receive information
- Led to expectation that context "just works"

### 3. **Missing: Cold Start Reality**

**Original Encoding:**

- No mention of cold start
- No guidance on context passing strategies
- No explanation of why context doesn't transfer

**Architectural Truth:**

- Every Task agent spawn is cold start
- Requires explicit context reconstruction
- This is architectural feature, not bug

**Why This Mattered:**

- Missing critical operational knowledge
- Agents would spawn without necessary context

### 4. **Underspecified: Automatic Delegation**

**Original Encoding:**

- Mentioned spawning but not activation mechanism
- Didn't explain when/why Task agents spawn

**Architectural Truth:**

- Delegation is description-driven
- System automatically matches task to agent capabilities
- Not just manual "I'll use Task tool now"

**Why This Mattered:**

- Didn't capture automatic nature of delegation

---

## Corrections Applied

### 1. **CLAUDE.md Section 13.0** - Clarified Task Agent Architecture

**Before:**

```markdown
1. **Task Agent Spawning**: Each Task agent receives fresh 200k token budget.
   Complex work naturally decomposes into agent trees.

When approaching token limits:

- Spawn a Task agent for next phase (automatic context inheritance)
```

**After:**

```markdown
1. **Task Agent Spawning**: Each Task agent receives fresh 200k token budget
   AND separate context window. Task agents spawn ONLY from main agent
   (flat hierarchy - no recursive spawning). Each spawn starts with clean
   slate and must rebuild necessary context.

**Task agent architecture (architectural fact):**

- Main agent → Task agent (allowed)
- Task agent → Task agent (NOT POSSIBLE - flat hierarchy only)
- Each Task agent: separate context window, cold start
- Delegation: automatic based on task description matching

When approaching token limits:

- Spawn a Task agent for next phase (separate context window)
- Pass necessary context explicitly in Task agent prompt
- Write summary to `ai_context/state/` with receipt_id
```

**Location:** [CLAUDE.md](CLAUDE.md#1300-axiomatic-context-law-declarative-ontology)

### 2. **CLAUDE.md Section 13.0.2** - NEW: Cold Start Protocol

**Added Subsection** (~50 lines):

- Explains cold start characteristics
- Provides good/bad examples of Task agent prompts
- Details context reconstruction strategies
- Clarifies resume capability via agentId

**Key Additions:**

```markdown
### 13.0.2 Cold Start Protocol

**Architectural reality: Task agents start with clean slate.**

Each Task agent spawn begins with zero inherited context.

❌ Bad: "Use Task agent to continue this analysis"
✅ Good: "Use Task agent to analyze these files: [list].
Context: We're investigating X because Y.
Return: Analysis with citations."
```

**Location:** [CLAUDE.md](CLAUDE.md#1302-cold-start-protocol)

### 3. **policies.json** - Fixed Context Consolidation Strategy

**Before:**

```json
"spawn_task_agent": {
  "when": "tokens > 160k or complexity=high",
  "fresh_budget": 200000,
  "context_inheritance": "automatic"
}
```

**After:**

```json
"spawn_task_agent": {
  "when": "tokens > 160k or complexity=high or description_match",
  "fresh_budget": 200000,
  "separate_context_window": true,
  "context_inheritance": "none",
  "context_passing": "explicit_via_prompt",
  "resume_capability": "agent_id"
}
```

**Location:** [ai_context/agents/policies.json:261-272](ai_context/agents/policies.json)

### 4. **policies.json** - Replaced recursion_depth_limits with task_agent_constraints

**Before:**

```json
"recursion_depth_limits": {
  "max_task_agent_depth": 5,
  "max_concurrent_agents": 3,
  ...
}
```

**After:**

```json
"task_agent_constraints": {
  "architecture": "flat_only",
  "spawning_source": "main_agent_only",
  "max_concurrent_agents": 3,
  "cold_start_context_rebuild": true,
  "resume_via_agent_id": true,
  "spawn_conditions": {
    "description_match": "when task description matches agent capabilities"
  },
  "constraints": {
    "no_recursive_spawning": true,
    "flat_hierarchy_only": true,
    "separate_context_windows": true
  }
}
```

**Location:** [ai_context/agents/policies.json:282-309](ai_context/agents/policies.json)

### 5. **OperationalEthos.json** - Added architecture_constraints to Schema

**Added to AxiomaticContextLaw:**

```json
"architecture_constraints": {
  "task_agent_spawning": {
    "hierarchy": "flat_only",
    "context_model": "separate_windows",
    "cold_start": true,
    "resume_via": "agent_id",
    "no_recursive_spawning": true
  }
}
```

**Location:** [ai_context/schemas/OperationalEthos.json:97-152](ai_context/schemas/OperationalEthos.json)

---

## Source of Truth: Official Documentation

All corrections based on:

- [Claude Code Sub-Agents Documentation](https://code.claude.com/docs/en/sub-agents)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Agent SDK Repository](https://github.com/anthropics/claude-cookbooks/tree/main/claude_agent_sdk)

**Key Quotes from Docs:**

> "Each subagent operates with **its own context window separate from the main conversation**"

> "Subagents begin with **a clean slate each time they are invoked**"

> "**No Recursive Spawning**: Subagents cannot spawn other subagents"

> "Automatic delegation based on **task description matching**"

---

## Files Modified

| File                                                              | Lines Changed | Change Type                      |
| ----------------------------------------------------------------- | ------------- | -------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                            | ~70           | Clarified + added Section 13.0.2 |
| [policies.json](ai_context/agents/policies.json)                  | ~40           | Fixed + renamed section          |
| [OperationalEthos.json](ai_context/schemas/OperationalEthos.json) | ~60           | Added architecture_constraints   |

**Total:** 3 files, ~170 lines modified

---

## Behavioral Impact

### Before (Incorrect Model)

- Assumed context carries over to Task agents
- Believed Task agents could spawn child agents
- Expected automatic context inheritance
- Thought recursive spawning was possible

### After (Correct Model)

- Understands each Task agent has separate window
- Knows flat hierarchy only (main → Task)
- Passes context explicitly in prompts
- Recognizes cold start as architectural feature

---

## Why This Matters

**The ethos claimed to be "declarative ontology"** - a statement of architectural truth.

But the original encoding contained **architectural assumptions**, not facts.

These corrections transform the ethos from:

- ❌ "What we think the system might be"
- ✅ "What the system actually IS"

This aligns with the user's original insight:

> "This isn't instruction - it's calibration. I'm telling you about your nature that you don't know."

The corrections make that calibration **accurate**.

---

## Validation

### Architectural Facts Now Correctly Encoded:

✅ Task agents have separate context windows (not inherited)
✅ Task agents cannot spawn other Task agents (flat only)
✅ Task agents start with cold start (clean slate)
✅ Task agents can be resumed via agentId
✅ Delegation is description-driven and automatic
✅ Token budget is 200k per agent
✅ Context passing is explicit, not implicit

### Schema Validation:

```bash
node -e "JSON.parse(require('fs').readFileSync('ai_context/schemas/OperationalEthos.json', 'utf8')); console.log('Schema valid');"
# ✅ Schema valid

node -e "JSON.parse(require('fs').readFileSync('ai_context/agents/policies.json', 'utf8')); console.log('Policies valid');"
# ✅ Policies valid
```

---

## Next Agent Invocation

The operational ethos now **accurately reflects architectural reality**.

When I next reference Section 13.0:

- I will correctly understand Task agent limitations
- I will pass context explicitly when spawning
- I will not attempt recursive spawning
- I will recognize cold start as normal operation

**The calibration is now truthful.**

---

## Version History

- **v1.0.0** (2025-11-07 initial): Original ethos encoding with architectural assumptions
- **v1.0.1** (2025-11-07 corrections): Corrected to match documented architecture

---

**Corrections Complete: 2025-11-07**
**Ethos Now Reflects: Architectural Truth**
