# Claim Extraction Examples

## Example 1: Extracting factual claims from an interview

**Input Context:**

```
Source 1 (Interview Transcript):
"We launched the new mobile application in Q3 2023. It resulted in a 45% increase in user engagement within the first month. Our engineering team, led by Sarah Jenkins, rewrote the entire backend in Rust to achieve these performance gains."
```

**Output Payload:**

```json
{
  "claims": [
    {
      "claim": "The new mobile application was launched in Q3 2023.",
      "evidence_node_id": "source_1"
    },
    {
      "claim": "The launch resulted in a 45% increase in user engagement within the first month.",
      "evidence_node_id": "source_1"
    },
    {
      "claim": "The engineering team rewrote the backend in Rust.",
      "evidence_node_id": "source_1"
    },
    {
      "claim": "Sarah Jenkins led the engineering team during the backend rewrite.",
      "evidence_node_id": "source_1"
    }
  ]
}
```

## Example 2: Handling ambiguous or speculative text

**Input Context:**

```
Source 2 (Strategy Doc):
"We believe that AI will fundamentally change how users interact with our platform. If we implement the new model by next year, we might see a significant reduction in churn."
```

**Output Payload:**

```json
{
  "claims": [
    {
      "claim": "The author believes AI will fundamentally change user interaction with the platform.",
      "evidence_node_id": "source_2"
    }
  ]
}
```

_(Note: The speculative statement about churn reduction is not extracted as a factual claim, but the belief itself is extracted as a stated position)._
