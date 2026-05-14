# Gap Analysis Examples

## Example 1: Identifying gaps in a product requirement document

**Input Context:**

```
Source 1 (PRD - User Authentication):
"Users must be able to log in using their email and password. The system should lock the account after 5 failed attempts. We will use JWT for session management."
```

**User Request:**
"Review the authentication PRD and identify what is missing for a complete implementation."

**Output Payload:**

```json
{
  "gaps": [
    {
      "description": "Password reset or recovery flow is not defined.",
      "severity": "high",
      "impact": "Users who forget their passwords will be permanently locked out."
    },
    {
      "description": "Password complexity requirements are missing.",
      "severity": "medium",
      "impact": "Users might create weak passwords, leading to security vulnerabilities."
    },
    {
      "description": "Multi-factor authentication (MFA) is not mentioned.",
      "severity": "medium",
      "impact": "Lacks modern security standards for account protection."
    },
    {
      "description": "JWT expiration time and refresh token strategy are undefined.",
      "severity": "high",
      "impact": "Could lead to infinite sessions or abrupt user logouts."
    }
  ]
}
```

## Example 2: Analyzing a historical research summary

**Input Context:**

```
Source 2 (Research Notes):
"The Roman Empire expanded significantly under Augustus. He reorganized the military and established the Praetorian Guard."
```

**User Request:**
"What gaps exist in this summary regarding Augustus's domestic policies?"

**Output Payload:**

```json
{
  "gaps": [
    {
      "description": "No mention of economic reforms or taxation changes.",
      "severity": "low",
      "impact": "Provides an incomplete picture of his administrative changes."
    },
    {
      "description": "Social and moral legislation (e.g., Lex Julia) is omitted.",
      "severity": "low",
      "impact": "Misses his efforts to restore traditional Roman values."
    }
  ]
}
```
