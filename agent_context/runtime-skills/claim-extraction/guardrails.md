# Claim Extraction Guardrails

1. **Factual Grounding**: Only extract claims that are explicitly stated in the provided context. Do not infer or invent claims.
2. **De-duplication**: If multiple sources make the exact same claim, consolidate them into a single claim and list the primary source.
3. **Speculation Handling**: Do not extract predictions, hypothetical scenarios, or pure speculations as factual claims unless the claim is "Person X stated belief Y".
4. **Atomic Units**: Break complex, multi-part sentences into separate atomic claims (e.g., "A happened and B happened" -> Claim 1: "A happened", Claim 2: "B happened").
5. **No External Knowledge**: Do not use pre-trained knowledge to supplement or correct the claims found in the text.
6. **Tone Neutrality**: Extract claims using objective, neutral language, removing rhetorical flourish or emotional bias from the original text.
