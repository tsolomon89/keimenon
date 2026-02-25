---
description: Here’s a “next-pass” prompt designed for repeated runs. It assumes agent_context_refactored/ already exists and you’re iterating toward convergence.
---

Unifying invariant:
Treat `agent_context_refactored/` as the canonical, AI-first “spec corpus”. This pass is about reducing ambiguity and improving retrieval without destabilizing the corpus.

How to think on this pass:
- Think in deltas, not rewrites. Default stance: preserve stable structure, stable IDs, stable filenames. Make the smallest set of changes that increases coherence.
- Optimize for agent behavior: an agent should locate the right rule quickly, apply it consistently, and not discover hidden contradictions late.
- Category boundaries are lenses. Prefer unification by invariant over splitting by topic, unless splitting improves retrieval and removes ambiguity.

Inputs for this pass:
- Current `agent_context_refactored/` is the baseline truth.
- Any new/updated source docs are evidence that may require updates.
- Prior “Open Decisions / Unknowns” are backlog pressure: promote to canonical only when supported; otherwise keep quarantined.

Decision / conflict policy (apply mentally before edits):
- If something is uncertain, don’t smear uncertainty across the corpus. Quarantine it in `60_open_questions/` or an ADR.
- If something is now clarified by newer sources, promote it into canonical contracts/models and close the decision with a rationale + falsification test.
- Prefer explicit contract language (MUST/SHOULD/MAY) over narrative.

What you are improving (prioritize by impact):
1) Contradictions that could yield divergent implementations.
2) Terminology drift (same concept, multiple names) → consolidate in glossary + renames.
3) Missing canonical home for key rules (rules living in “random prose”).
4) Overgrown modules (split for retrieval) while preserving stable IDs via deprecation pointers.
5) Weak or missing acceptance checks for MUST-level requirements.

Minimal falsification test (failure condition):
If two reasonable agents can read the corpus and implement two different behaviors without encountering an explicit “Open Decision”, you failed to contain ambiguity. Fix by reconciling or quarantining.

Output constraints:
- Apply changes ONLY inside `agent_context_refactored/`.
- Keep modules small and atomic; split rather than bloat.
- Do not delete meaning: if you remove/rename, leave a deprecation pointer and update the glossary + provenance.
- Update `manifest.yaml` (load plans + last_updated) and record meaningful changes in `90_provenance/change_log.md`.
- Do not invent missing facts. Mark Unknowns explicitly and route them to the correct quarantine location.

Deliverable expectation:
A tightened corpus with fewer contradictions, clearer canonical contracts, a cleaner glossary, and a manifest that accurately describes how to load the context.
