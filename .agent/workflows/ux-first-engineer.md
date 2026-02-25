---
description: Best if your main worry is that the code contains features/settings that users can't actually access yet.
---

> **Prompt:**
> Act as a **Full-Stack Engineer with a focus on DX (Developer Experience) and UX.**
> I feel like this project has become "messy" and opaque. I need you to audit the code for two things: **Efficiency** and **Accessibility.**
> 1. **Code Efficiency:** Find where we are writing the same code twice. Refactor duplicates into single sources of truth.
> 2. **Feature Accessibility:** I suspect there are settings, constraints, or parameters hardcoded in the back-end logic that are not visible in the front-end UI. Please audit the code for these "hidden controls."
> 
> 
> meaningful refactor that cleans up the code structure while simultaneously identifying variables that need to be exposed to the end user.

---

### Key Phrases Explained

* **"Principal Software Architect":** This tells the AI to look at the *system* as a whole, not just line-by-line syntax.
* **"Magic Numbers":** This is a programming term for raw numbers (like `timeout = 5000`) used directly in code. Using this term signals the AI to look for settings that should be variables (like `timeout = userSettings.timeout`).
* **"Single Source of Truth":** This is the ultimate goal of DRY. It means data or logic exists in only one place.
* **"Dead Code":** Code that exists but is never run. Asking the AI to remove this instantly lowers complexity.

