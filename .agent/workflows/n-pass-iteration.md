---
name: n-pass-iteration
description: 'Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus'
---

# n-pass-iteration

## Purpose

Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus

## Operational Details

- **Owning Persona**: documentation-steward
- **Supporting Personas**: meta-text-assembler
- **Skills Used**: research-specialist
- **When to Use**: Ambiguous spec
- **When NOT to Use**: When out of scope of Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus.
- **Required Inputs**: Draft spec
- **Commands / Checks**: None
- **Evidence Output**: Diff
- **Stop Conditions / Acceptance Criteria**: Review

This workflow coordinates iterative passes over the `agent_context_refactored/` directory to refine Keimenon specs, reduce ambiguity, and improve agent retrieval without destabilizing the corpus. Trigger via `/n-pass-iteration`.

## Steps

1. **Context Load:** Read current `agent_context_refactored/` as the baseline truth. Review any new/updated source documents.
2. **Analysis Pass:** Use `research-specialist` to identify contradictions, terminology drift, or missing canonical contracts. Do not rewrite wholesale; think in deltas.
3. **Quarantine Uncertainties:** If something is uncertain, don't smear uncertainty across the corpus. Quarantine it in `60_open_questions/` or an ADR.
4. **Promote Certainties:** If new sources clarify an older open decision, promote it into canonical contracts (using MUST/SHOULD/MAY) and close the decision.
5. **Update Provenance:** Update `manifest.yaml` (load plans + last_updated) and record meaningful changes in `90_provenance/change_log.md`.
