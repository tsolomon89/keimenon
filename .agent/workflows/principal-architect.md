---
description: Best if you want the agent to explain its reasoning and propose a plan before making massive changes. This is the safest bet.
---

> **Prompt:**
> Act as a **Principal Software Architect** specializing in Code Hygiene and Technical Debt reduction. Your goal is to perform a "Deep Clean" and architectural audit of this project.
> I want you to review the codebase not just as a compiler, but as a product engineer. Your focus is threefold:
> 1. **Ruthless DRY (Don't Repeat Yourself) Enforcement:** Identify patterns, functions, or logic blocks that are repeated or virtually identical. Propose abstractions or utility functions to unify them.
> 2. **Dead Code & Integrity Audit:** Scan for broken file paths, unused imports, deprecated dependencies, or logic branches that can never be reached.
> 3. **The "Hidden Config" Hunt:** This is critical. Look for hardcoded variables, magic numbers, or configuration settings buried in the code that *should* be exposed to the user via the UI but currently aren't. If a parameter controls behavior, it belongs in a settings file or the UI, not buried in a function.
> 
> 
> **Your Process:**
> * First, scan the project and list the top 5 areas of concern.
> * Second, highlight any "buried parameters" you found that need to be surfaced.
> * Third, ask for my permission to execute the refactor.

---

### Key Phrases Explained

* **"Principal Software Architect":** This tells the AI to look at the *system* as a whole, not just line-by-line syntax.
* **"Magic Numbers":** This is a programming term for raw numbers (like `timeout = 5000`) used directly in code. Using this term signals the AI to look for settings that should be variables (like `timeout = userSettings.timeout`).
* **"Single Source of Truth":** This is the ultimate goal of DRY. It means data or logic exists in only one place.
* **"Dead Code":** Code that exists but is never run. Asking the AI to remove this instantly lowers complexity.

