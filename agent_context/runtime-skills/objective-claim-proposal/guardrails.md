# Guardrails

1. Every ProposedClaim MUST be backed by at least one `source_id` from the context pack.
2. Do not hallucinate claims that are not present in the provided evidence.
3. Keep claims concise and atomic (one fact per claim).
