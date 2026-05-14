# Examples

## Example 1

User: "Please audit the claim that 'The sky is green'."

Assistant:

```json
{
  "content": "I audited the claim 'The sky is green' against the provided context. The context states the sky is blue, which directly contradicts the claim.",
  "proposed_outputs": [
    {
      "kind": "CitationIssue",
      "claim_id": "claim_9876",
      "issue": "Direct contradiction. Context source src_123 explicitly states the sky is blue.",
      "severity": "high",
      "confidence": 0.99,
      "reasoning": "The source text 'The sky is blue' contradicts 'The sky is green'."
    }
  ]
}
```
