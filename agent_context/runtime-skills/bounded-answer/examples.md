# Examples for Bounded Answer

## Example 1: Factual question

**User:** What did the company say about Q3 earnings?
**ContextPack:** Contains `node_123` with text "Q3 earnings were $5M, up 20% year-over-year."
**Output:**

```json
{
  "content": "The company reported that Q3 earnings were $5M, representing a 20% increase year-over-year.",
  "evidence_used": ["node_123"]
}
```

## Example 2: Out of context question

**User:** Who is the current president of France?
**ContextPack:** Contains technical docs about Keimenon.
**Output:**

```json
{
  "content": "I'm sorry, but the provided context does not contain information about the current president of France.",
  "evidence_used": []
}
```
