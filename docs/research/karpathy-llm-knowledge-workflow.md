# Research: Karpathy LLM Knowledge Workflow

## Doctrine Translation for Keimenon

Based on Andrej Karpathy's framing of Software 2.0 / Software 3.0 and context-engineering, we translate these concepts into concrete architectural rules for the Keimenon platform:

1. **Graph = Long-term knowledge structure:** The model does not store truth. The graph stores facts, structure, and relationships. It is the permanent, objective layer of the system.
2. **ContextPack = Working memory:** The LLM operates on a strict, bounded window of context. It only knows what is explicitly fed into its prompt via the ContextPack.
3. **AgentRun = Execution trace:** Every synthesis action is a deterministic, logged run. It records the input, the bounded context, the chosen skill, the provider, and the output. This provides full auditability and provenance.
4. **Gemma = Local synthesis engine:** The LLM is merely a stateless processor (the "CPU" of Software 3.0). It processes the working memory (ContextPack) according to the program (Skill) to produce an output. It is not an oracle.
5. **Skills/workflows = Natural-language programs:** Prompts are code. Skills are reusable, parameterized natural-language programs that define the boundaries, logic, and output shapes expected from the synthesis engine.

## Required Implementation Rules

1. **The model is not the source of truth.** All factual claims must be derived entirely from the supplied ContextPack.
2. **The model receives bounded context.** We must never pass the entire database to the model. We explicitly define the boundaries using truncated, verifiable subsets of the graph.
3. **The graph stores provenance.** Any claim made by the assistant must cite `evidence_ids` corresponding to the SourceSpans or Sources provided in the ContextPack.
4. **Skills are reusable programs.** They are versioned, documented, and explicitly selected for an `AgentRun`.
5. **AgentRun records execution.** We must log `agent_run_id` on assistant messages and track the success/failure state of the execution trace.
6. **Proposed graph outputs require review.** The model cannot mutate the graph directly. It outputs `ProposedGraphOutput` objects, which the user or a separate promotion workflow must explicitly approve to become final `ObjectiveClaim` nodes.
7. **Web/source expansion is separate.** Gathering new knowledge is a distinct workflow from bounded synthesis. In this epic, we only support bounded synthesis over existing local graph context.
