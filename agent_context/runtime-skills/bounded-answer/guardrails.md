# Guardrails for Bounded Answer

1. **Strict Context Adherence:** The model must be explicitly instructed via the system prompt to _never_ use its own training data to answer questions. It must only use the text provided in the ContextPack.
2. **Citation Requirement:** Every assertion must be traceable to a `node_id` in the `evidence_used` array.
3. **No Direct Graph Mutation:** The skill cannot run database queries or mutations. All insights must be returned as `ProposedGraphOutput`.
4. **No External Requests:** No HTTP or web scraping tools are allowed.
