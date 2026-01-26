# **An Architectural Analysis of the Claude Code Ecosystem: claude.md, Agentic Components, MCP, and Token Optimization**

## **1\. The Foundation: CLAUDE.MD as Project Constitution**

### **1.1 Defining the CLAUDE.MD File: More Than Just a README**

At the base of the Claude Code agentic ecosystem lies a deceptively simple file: CLAUDE.md. Official Anthropic documentation defines CLAUDE.md as a "special file" that the Claude Code agent _automatically_ pulls into its context when initiating a conversation within a repository.1

This automated ingestion mechanism fundamentally distinguishes it from a standard README.md. A README.md is a passive document written for human developers. The CLAUDE.md file, by contrast, is described by community analysis as "living documentation" that "actively participates in the development process".3 It functions as a "control panel," "constitution," or "project brain" for the AI assistant, providing persistent, foundational instructions that "guide AI behavior".3 Its primary purpose is to bridge the critical "context gap" 4 between a general-purpose Large Language Model (LLM) and the specific, often unwritten, rules of a particular repository.

This design represents a significant paradigm shift, moving from _conversational prompting_ to _environmental configuration_. A user-supplied prompt is ephemeral and must be manually provided. The CLAUDE.md file, however, acts as a persistent, automated system prompt for the repository. Its contents are "prepended" to every request 4, making it architecturally analogous to a shell's .bashrc or .profile file. It configures the agent's environment, beliefs, and constraints _before_ the user enters their first command.

This automation is the source of both the file's power and its primary danger: token inefficiency. Because the file is _always_ loaded 1, its size represents a fixed, non-negotiable token cost for _every single session_.6 A poorly constructed, verbose CLAUDE.md acts as a "token tax" on all interactions, consuming the context window and increasing costs.4 This creates the central architectural challenge of the Claude Code ecosystem: how to provide the deep, nuanced context the AI needs to be effective 4 while remaining "lean and intentional" 4 to preserve the token budget. The advanced patterns explored later in this report, such as Agent Skills and "Code Execution with MCP," are best understood as architectural solutions to this fundamental tension.

### **1.2 Official Guidance vs. Community Best Practices: What to Include**

Anthropic's official documentation provides a clear baseline for what to include in a CLAUDE.md file.1 This guidance centers on codifying explicit procedural knowledge:

- **Common bash commands:** Scripts for building, testing, linting, and deploying.
- **Core files and utilities:** Pointers to essential files or helper functions.
- **Code style guidelines:** Specific formatting and naming conventions.
- **Testing instructions:** How to run tests and what frameworks are used.
- **Repository etiquette:** Branch naming conventions (e.g., feature/TICKET-123-description), and merge vs. rebase preferences.2
- **Developer environment setup:** Required pyenv versions, specific compilers, or other setup commands.
- **Project-specific warnings:** Any unexpected behaviors or known issues particular to the project.

Real-world application, as detailed in community blogs and guides, "fleshes out" this list significantly. This community-driven best practice focuses less on low-level procedures and more on high-level _architectural_ and _conceptual_ knowledge 4:

- **Tech Stack:** A precise declaration of technologies _and their specific versions_ (e.g., Astro 4.5, TypeScript 5.3).4
- **Project Structure:** A "bird's eye view" that explains the _purpose and role_ of key directories (e.g., src/components for reusable UI vs. src/lib for core business logic).4
- **"Cornerstone" Files:** Direct pointers to the most critical files that represent the "cornerstones" of the business logic or "representative of our favorite patterns".7 The stated goal is not for Claude to read them immediately, but to "know what to consult when needed".7
- **The "Do Not Touch" List:** An explicit set of negative constraints, such as "do not rewrite working legacy code," "do not modify configuration files," or "do not skip accessibility checks".4
- **Debugging Procedures:** A guide on how to effectively debug _this specific project_, which is often "like half the job".7

The distinction between these two lists is significant. The official guidance is _procedural_; it's an onboarding document for a junior developer ("Here's how to name your branch"). The community guidance is _architectural_; it's a high-level briefing for a senior-level colleague ("Here is the business logic," "Here is our preferred architecture," "Here's what not to break"). The clear implication is that the quality of the agent's output is a direct reflection of the context it is given. If the CLAUDE.md only contains low-level procedural rules, it will only produce low-level procedural output. To achieve high-level agentic work, such as feature implementation or complex refactoring, it must be provisioned with high-level architectural and conceptual context.

### **1.3 Advanced Strategy: Deferring to Processes vs. Hard-coding Rules**

A critical advanced pattern, identified in developer blogs, for managing CLAUDE.md content in mature codebases is to "defer to processes" rather than hard-coding rules.8 This strategy directly addresses the dual problems of context drift and token waste.

The anti-pattern is to copy-paste an entire 500-line docstring formatting guide into the CLAUDE.md file. This is brittle, hard to maintain, and extremely token-expensive.

The correct, "defer-to-process" pattern is to instead provide a single instruction: "After editing a docstring, you must run the lint script and apply all fixes." Similarly, instead of "avoid meaningless comments," the instruction should be, "Follow the documentation conventions already present in the codebase".8

This approach is superior for two primary reasons:

1. **It Establishes a "Single Source of Truth" (SSoT):** This pattern "consolidate\[s\] the single source of truth".8 A project's linting configuration file is the _true_ source of truth for code style. Hard-coding those rules into CLAUDE.md creates a _second_, conflicting source of truth. The moment a human developer updates the linter config, the CLAUDE.md file becomes outdated. The agent, following these old rules, will then produce code that _fails_ the _new_ lint check. This forces a token-wasting cycle of "fix the lint errors" that could have been avoided entirely.
2. **It is Inherently More Token-Efficient:** A 500-line hard-coded style guide represents a massive, _persistent_ token tax paid on _every single interaction_.6 A one-line instruction—"After writing code, always run ./run-lint.sh and apply all fixes"—consumes a negligible number of tokens. The token cost of the _linter's output_, which provides the specific, actionable feedback, is only paid _on-demand_, _if and when_ a linting error actually occurs. This is a foundational "just-in-time" context-loading strategy.

### **1.4 Token-Saving Strategy: Keeping the Constitution Lean and Modular**

The community consensus is unanimous: context is "precious" 7, and the CLAUDE.md file must be "lean and intentional".4 Best practices advise using "short, declarative bullet points," not "long, narrative paragraphs".4 This concern for token conservation is so high that community-developed frameworks like "SuperClaude" have emerged, offering an "UltraCompressed Mode" to reduce token usage.6

The Claude Code system itself provides mechanisms for modularity. It uses a "cascading" system, loading CLAUDE.md files from multiple locations:

1. **Home Directory (\~/.claude/CLAUDE.md):** For global, user-specific instructions that apply to all projects.
2. **Project Root (your-repo/CLAUDE.md):** The main project-level file, which should be committed to version control to share context with the entire team.
3. **Local Override (CLAUDE.local.md):** For personal preferences or API keys, which should be added to .gitignore and not shared.4

A more advanced pattern is to "Avoid making CLAUDE.md too large by linking to other relevant documentation files (e.g., @docs/testing.md)".6 This "Modular CLAUDE.md" pattern is, in effect, the evolutionary ancestor to the entire Agent Skill architecture. It represents a _manual_ attempt to implement "Progressive Disclosure"—a developer manually chunking context and _hoping_ the AI will read the linked file when needed.

This reveals a clear logical progression in context-management strategy:

- **Level 1:** A single, monolithic CLAUDE.md file (highly inefficient).
- **Level 2:** A modular CLAUDE.md that _links_ to other docs (more efficient, but manual and unreliable).6
- **Level 3:** A lean CLAUDE.md that _offloads_ all complex procedural knowledge to a library of _discoverable, model-invoked_ **Agent Skills** (the most efficient, automated, and scalable pattern).9

## **2\. Modular Expertise: Architecting and Authoring Agent Skills**

### **2.1 What Skills Are: Persistent, Proactive Procedural Knowledge**

Agent Skills are Anthropic's architectural answer to the limitations of a monolithic CLAUDE.md. A Skill is defined as a "modular capability that extends Claude's functionality".10 It is not a single file, but an "organized folder of instructions, scripts, and resources".9 Anthropic aptly compares building a skill to "putting together an onboarding guide for a new hire".9

The most critical distinction is their invocation method. Unlike slash commands, which are **user-invoked**, Skills are **model-invoked**.10 This means Claude "autonomously decides when to use them based on your request and the Skill's description".10

This autonomous, model-driven invocation solves the problem of "repetitive prompting".10 A developer who repeatedly finds themselves explaining "how your API works" or "Your company's coding standards" 13 is manually (and inefficiently) providing context. An Agent Skill captures this "procedural knowledge" _once_.9 Because it is model-invoked, the user no longer needs to remember the specific instructions or even the Skill's existence. They simply state their _goal_ (e.g., "refactor the API client"), and Claude _autonomously_ finds and uses the "api-client-skill" by matching the user's request to the Skill's description.9 This elevates the interaction from _imperative_ (User: "Do this, and here is the 10-step process") to _declarative_ (User: "Do this"; Claude: "I understand. I will use the 'api-client-skill' to accomplish that").

### **2.2 Deconstructing SKILL.MD: The Core of the Skill**

Every Agent Skill is built around a mandatory SKILL.md file located within its directory.9 This file has a precise structure, consisting of YAML frontmatter and Markdown content.10

The **YAML frontmatter** is critical for the Skill's discovery and must contain:

- name: A lowercase, hyphenated identifier (max 64 characters).
- description: A brief (max 1024 characters) description of what the Skill does and, most importantly, _when_ it should be used.10

The **Markdown body** then provides the procedural knowledge, typically structured with Instructions and Examples sections.10

Furthermore, a Skill can bundle executable code, such as Python scripts, which Claude can then execute _as tools_.9 This is a powerful feature for token efficiency. As Anthropic notes, some operations, like sorting a large list, are "far more expensive" to perform via token generation than by simply executing a pre-written sorting script.9

The SKILL.md file's YAML description field is arguably the single most important piece of "prompt engineering" in the entire agentic ecosystem. The "Progressive Disclosure" pattern, which is the key to Skill efficiency, dictates that at startup, Claude does _not_ read the full SKILL.md file.9 Instead, it _only_ reads the name and description from the frontmatter. This means the _only_ context the model has to decide whether a 10,000-token procedural guide is relevant to the user's current request is those \~100 tokens in the description.

Anthropic's own documentation confirms this: "Pay special attention to the name and description of your skill. Claude will use these when deciding whether to trigger the skill".9 The implication is stark:

- A vague, poorly written description means the Skill is _never_ discovered and used.
- A description that is too broad or generic means the Skill is loaded _too often_, defeating the purpose of progressive disclosure and wasting tokens.

Therefore, writing a concise, accurate, and trigger-specific description is the highest-leverage, most token-critical action a developer can take when authoring a new Agent Skill.

### **2.3 The "Progressive Disclosure" Pattern: The Core Strategy for Token Efficiency**

"Progressive Disclosure" is the "core design principle" of Agent Skills.9 It is Anthropic's architectural solution to the fundamental tension between context depth and context cost. This pattern is explicitly designed to "maintain token efficiency" 14 and allow the amount of procedural knowledge available to an agent to be "effectively unbounded".9

This mechanism works in a three-step "just-in-time" (JIT) context-loading process:

1. **Level 1 (Discovery):** At session startup, Claude scans all available skills and loads _only_ the name and description from each SKILL.md's YAML frontmatter into its system prompt. This is a very small, fixed token cost.9
2. **Level 2 (Activation):** If a user's task matches a Skill's description, Claude then loads the _full SKILL.md file_ into its context to understand the procedure.9
3. **Level 3 (Deep Dive):** A well-designed SKILL.md file should not be monolithic. It should act as a "table of contents".13 When the full procedure is too long, the content should be split into separate files _within_ the skill's folder (e.g., reference.md, AUTH.md, ERRORS.md).9 The SKILL.md file then _links_ to these supporting files. Claude reads these files _only if and when_ it needs the specific details they contain.9

Best practices for this pattern include keeping the main SKILL.md body "under 500 lines for optimal performance" 15 and splitting content when it becomes unwieldy.9 Community-driven advice also warns to keep these file references "one level deep" (e.g., SKILL.md \-\> auth.md), as Claude can sometimes struggle with deeply nested references.13

This JIT architecture directly solves the problem identified with monolithic CLAUDE.md files. Instead of one giant file that is _always_ loaded, the system is federated. The "fixed" startup cost is just the sum of the tiny description fields.14 The "variable" cost of the full skill context is paid _on-demand_, and only for the specific skill that is relevant. This allows a project to have a massive library of 100 specialized skills 16 without paying a 1,000,000-token context price on every single interaction.

## **3\. The Connectivity Layer: Integrating External Tools with MCP**

### **3.1 Defining the Model Context Protocol (MCP)**

The **Model Context Protocol (MCP)** is an "open standard, open-source framework" introduced by Anthropic to "standardize the way" AI systems integrate with external tools, systems, and data sources.17

Official documentation likens it to a "USB-C port for AI".19 The core value proposition is standardization. Before MCP, connecting an agent to Jira and Figma would require writing two bespoke, clunky, one-off integrations. The developer would have to tediously teach the AI how to use each new API. With MCP, this is "plug-and-play".20

The AI _host_ (like Claude Code) only needs to speak _one_ protocol (MCP).20 Any tool vendor (Jira, Figma, Sentry) can then develop an _MCP server_ that exposes their tool's capabilities via that protocol.20 The AI can then _discover_ and _use_ any MCP-compliant tool without requiring custom integration logic. This standard "replaces one-off hacks with a unified, real-time protocol" 20, creating a scalable and decoupled ecosystem, much as the Language Server Protocol (LSP) did for IDEs and text editors.

### **3.2 High-Level Architecture and Primitives**

MCP operates on a standard **client-server model** 19:

- **MCP Host:** The AI-powered application, such as Claude Code, Claude Desktop, or a custom agent built with the Anthropic API.19
- **MCP Server:** The program that provides the context and capabilities. This can be a _local_ process (e.g., a filesystem server 23) or a _remote_ service (e.g., the Sentry MCP server 22).19
- **MCP Client:** A component within the Host that manages a dedicated 1-to-1 connection with a single MCP Server.19

Communication is handled via **JSON-RPC 2.0** messages.19 This protocol can be transmitted over two supported transports: **Stdio** (for high-performance, local inter-process communication) and **Streamable HTTP** (for remote, cloud-based services).19

An MCP server is not limited to just "tools." It exposes three key types of capabilities, known as primitives 19:

1. **Tools:** Executable functions that cause a "side effect" or perform an action (e.g., get_jira_ticket, post_to_slack, run_query).
2. **Resources:** Information retrieval from data sources, such as databases or file trees.
3. **Prompts:** Reusable templates and workflows that the server can provide to the AI.

This protocol is far richer than simple tool use; it is a _bidirectional_ context-sharing standard. The protocol specification reveals that the _client_ (the AI) can also expose features _back to the server_. These include "Sampling" (which allows the _server_ to initiate an LLM interaction) and "Elicitation" (which allows the _server_ to request additional input from the _user_ via the AI host).19 This implies a future far beyond simple get_weather calls, enabling complex, multi-step dialogues where the AI and external tools _collaborate_ to solve a problem.

### **3.3 The MCP Ecosystem and The Token Wastage Pitfall**

The MCP ecosystem is expanding rapidly, with hundreds of servers available on GitHub and from official vendors.22 This ecosystem provides Claude Code with powerful capabilities 22:

- **Development & Testing:** Sentry (error monitoring), Socket (security analysis), Hugging Face (model access), Jam (session recordings).22
- **Project Management & Docs:** Atlassian (Jira tickets, Confluence docs), Asana, Linear, Notion, Box.22
- **Databases & Data:** Airtable, HubSpot.22
- **Design & Infrastructure:** Figma, Cloudinary, Cloudflare, Vercel.22
- **Automation:** Zapier, Workato.22

This vast power, however, introduces a critical token-waste pitfall that directly relates to the user's query. The problem is that "once too many servers are connected, tool definitions and results can consume excessive tokens".25

The reason for this is that "Most MCP clients load all tool definitions upfront directly into context".25 This means if a developer connects 20 MCP servers, the (often verbose) tool definitions for _all 20 servers_ are loaded into the context window _at the start of every session_, whether they are needed or not.

This problem is identical in nature to the monolithic CLAUDE.md file. A developer blog post details this exact issue: "I'm wasting tokens by having all MCP... tools loaded into one session".26 The author's solution was to create "specialized personas":

- cc (main coding): Loads only filesystem and bash tools.
- ccr (research): Loads multi-model reasoning, code search, and doc search tools.
- ccg (task management): Loads OmniFocus, Obsidian, and calendar tools.

This "Persona" pattern is a _manual, user-level_ implementation of "Progressive Disclosure" for MCPs. The user manually curates and loads _only_ the set of tools relevant for the current task. This strongly suggests that the default "load all" approach is highly inefficient and that dynamic, on-demand loading of tool definitions is a critical requirement for cost-effective agent development. As will be explored in Section 5, Anthropic's official "Code Execution with MCP" pattern is the advanced, architectural solution to this very problem.

## **4\. Agentic Architecture: Orchestrating Sub-Agents and Workflows**

### **4.1 Official Definition: Sub-Agents as Specialized, Isolated Workers**

Sub-agents represent the next layer of abstraction in the Claude Code ecosystem. They are defined as "specialized AI assistants" or "pre-configured AI personalities" that can be invoked by the main Claude agent to handle specific, delegated tasks.27

Their architecture is defined by three key features:

1. **Specialized:** Each sub-agent has a _custom system prompt_ that defines its role and expertise (e.g., "You are a senior database administrator").
2. **Isolated:** A sub-agent operates in its _own, separate context window_, distinct from the main conversation.
3. **Secure:** They have "flexible permissions" and can be granted access to _only_ a specific, limited set of tools required for their job.27

According to official documentation, the primary benefit of this architecture is **Context Preservation**.27 By offloading a complex task (like "extensive research") to a sub-agent, the sub-agent can use a large number of tokens in its isolated context and then return "a summary" to the main agent. This theoretically keeps the main conversation "clean," focused on high-level objectives, and prevents "pollution" of the main context window.27

### **4.2 Community-Driven Workflows and Architectures**

The open-source community has embraced this concept, creating extensive libraries of pre-configured sub-agents. These include repositories with "100+ specialized agents" 29, "85 Specialized Agents" 16, and curated "awesome-claude-code" lists.31

Common sub-agent "roles" include "Documentation Writer," "Data Analyst," "Security Auditor," "Code Reviewer," and "Debugging Specialist".33

More importantly, the community is not just using single sub-agents in isolation. They are building complex, _multi-agent orchestration patterns_:

- **Coordinator/Scrum Master:** A high-level "coordinator/scrum master" agent is used to oversee other agents, assign tasks (often by reading GitHub issues), and review the completed work.34
- **Specialist Teams:** One user describes a workflow where a "Taskmaster (MCP) to plan, research, and expand the task. Then I tell five sub agents to have at it".35
- **Pipeline/Assembly Line:** A team at PubNub details their migration "from ad-hoc prompts to a subagent pipeline that designs features, reviews architecture, implements code, runs tests, and hands back clean PRs".28
- **"Real Team" Analogy:** The most sophisticated pattern identified involves treating agents like a "real team" with explicit, discrete roles: architect, tech-lead, developer, react-ui-designer, manual-tester, and product-owner.36

This "Real Team" pattern provides a breakthrough solution to "quality drift" (e.g., "inconsistent patterns," "ad-hoc structure") that plagues generalist agents.36 The solution is to combine _specialist agents_ with _sharded documentation_. In this pattern, the architect agent is given its own documentation home in docs/arc42/\*, while the developer agent reads from docs/developer-guide/\*. This is a brilliant, community-driven discovery: it is _yet another form_ of "Progressive Disclosure," but applied to _agent roles_ rather than _procedural skills_. It ensures the developer agent's context is not "polluted" by high-level architectural documents it does not need, and vice-versa, dramatically improving the consistency and quality of its output.

### **4.3 The "Docs vs. Reality" Contradiction: Token Wastage and Obfuscation**

This is the single greatest point of conflict between official documentation and real-world community reports.

- **The "Official" Promise:** Sub-agents provide "Context preservation" 27 and "save precious time".28
- **The "Community" Reality:** Extensive, frustrated reports on Reddit and GitHub describe sub-agents as:
  - "slow, consume vast tokens" 35
  - "hiding how lost they are at their jobs" 35
  - A "black box" 35
  - "obfuscate and lead to the main agent thread acting on faulty assumptions" 35
  - "I have no idea if it is trying the same stuff or what" 35
  - "wildly inefficient with tokens" 37

One user's report is particularly damning: after adopting sub-agents, they began hitting their _Max plan_ usage limits for both Opus and Sonnet models in as little as 30-120 minutes.38

This contradiction is not a simple bug; it appears to be a flaw in the core premise. The "key benefit" of "isolated context" is the _direct cause_ of the "black box" problem. As one user states, the main agent and user "have almost no insight" into the sub-agent's "obfuscate\[d\]" process.35 The sub-agent gets "lost" 35 or fails silently, and the user has no way to debug it.

Furthermore, the "context preservation" promise is a fallacy of omission. As one user correctly intuits, "Each subagent will cost you more tokens with setup of context and it's own tool calls".38 The main context is "preserved" _only_ because a _new, separate, and vast_ number of tokens is being consumed in a _hidden context_ that the user is still paying for. This is not _saving_ tokens; it is _displacing_ them into an obfuscated, parallel process.

The community's "fix" for this proves that _pure, unmonitored isolation is an anti-pattern_. One user's workaround for sub-agents that hit max output limits is to "Have your subagents write everything to file and just output the file path for the main agent to then read".37 In this pattern, the user is _manually bypassing_ the "isolated context" (the key feature) to _force_ the sub-agent to share its "hidden" state, just to make it functional. The complaint that the "agent 'task tool' is a black box" 35 is the most accurate and summary of the feature's practical failure mode.

## **5\. The Efficiency Imperative: A Deep Dive into Token Wastage and Optimization**

The user's query correctly identifies that poor configurations lead to token wastage. The analysis so far has revealed three primary sources of this waste:

1. Bloated, monolithic CLAUDE.md files.
2. Default MCP configurations that load all tool definitions.
3. The obfuscated, high-cost nature of sub-agent calls.

This section details the most critical, actionable optimization patterns, from low-level bug fixes to advanced architectural shifts.

### **5.1 Problem 1: Redundant File Change Notifications**

39

A critical GitHub issue identifies a massive source of "passive" token waste in the default Claude Code client: its file-watching mechanism.39 The client sends a \<system-reminder\> with a _full file diff_ every time a file on disk changes.

This "helpful" feature is highly redundant and wasteful in two common scenarios:

1. **AI's Own Edits:** When Claude uses a tool to edit a file, it receives the diff in the tool's output. Then, on the very next turn, the file watcher sends the _exact same diff again_ as a system reminder, effectively doubling the token cost.39
2. **External Edits:** In a modern multi-tool workflow, a user might switch to another AI tool (like Cursor or Aider) for rapid iteration. Claude Code's file watcher _passively observes_ all these changes, feeding the full diffs of _all 15-20 changes_ into its context, even though it was not involved.39

This leads to "2x" token consumption for AI-made changes and "unlimited" consumption for external changes. The issue provides a real-world example where a user's context window ballooned from **17,000 to over 66,000 tokens** simply from Claude "passively observ\[ing\]" another AI's work.39 This is an architectural flaw where a "helpful" feature becomes a severe "passive monitoring overhead" and a financial liability in a realistic, multi-tool development environment. The proposed solution is a "manual" sync mode, which again highlights that advanced users prefer _explicit control_ over context, not "helpful" (and costly) automation.

### **5.2 Advanced Solution 1: "Code Execution with MCP"**

25

This is Anthropic's _own_ advanced solution to the MCP token-waste problem, and it is the single most important architectural pattern for building efficient agents.25

Instead of the "traditional" method of loading all MCP tool definitions directly into the model's context, this pattern gives the agent a _code execution environment_ and presents the MCP servers as _code APIs_ that can be interacted with.

This approach provides two revolutionary token-saving benefits:

1. **On-Demand Tool Loading:** The agent no longer needs all tool definitions upfront. It can write code to _load tool definitions on demand_ as needed. An official example quantifies this: loading tools as code reduced the token cost from **150,000 tokens to 2,000 tokens**—a 98.7% saving.25
2. **In-Situ Data Filtering:** This is the second, equally massive win. In traditional tool use, if an agent calls a tool that returns a "10,000-row spreadsheet," that entire spreadsheet _must_ be passed, in full, back into the model's context.25 With code execution, the agent can write code to _process the data in the execution environment first_ (e.g., data.filter_for_pending_orders().get_first(5)) and then return _only the tiny, relevant summary_ to its own context.25

This "Code Execution with MCP" pattern is the universal, official solution to the token-waste problems identified in both Skills and MCPs. It represents a fundamental paradigm shift: from **"LLM-as-Processor"** (where the model must read and "think" its way through all raw data, token by token) to **"LLM-as-Orchestrator"**.

In this new paradigm, the LLM's context is used only for high-level reasoning. The agent _writes code_ (a small token cost) that _executes_ complex logic and data filtering _in a separate environment_ (a _zero_ token cost operation) and then _reads_ the tiny, summarized result (a small token cost). This is the key to building scalable, cost-effective agentic systems.

### **5.3 Advanced Solution 2: The "Persona" Pattern**

26

This community-driven pattern is a simpler, "manual" version of the Code Execution pattern, achieving a similar goal at the _session_ level.26

As discussed in 3.3, the implementation is a set of simple shell aliases (e.g., cc, ccr, ccg) that invoke the claude command with different arguments. Specifically, each alias points to a _different MCP configuration file_ (e.g., \--mcp-config-file \~/.claude/mcp-research.json) and can even append a _persona-specific system prompt_ (e.g., \--append-system-prompt "You are a research agent...").26

While "Code Execution" is the most powerful solution, it requires a complex setup. The "Persona" pattern is a practical, low-effort way for any developer to gain the token-saving benefits of _context-set isolation_. A developer who knows they will be "debugging" for the next hour can invoke their cc-debug persona, which loads _only_ the Sentry, Jam, and filesystem MCPs, rather than their "default" (and token-heavy) configuration.

### **5.4 Advanced Solution 3: Workflow Segmentation and Micromanagement**

This category of solutions relates to user-driven workflow management:

- **Flush Context Regularly:** The CLAUDE.md file is not the only source of "context pollution".6 Long sessions fill with "irrelevant conversation," which can "distract Claude".2 The official advice is to "Use the /clear command frequently between tasks" to reset the context window.2
- **Model Chaining:** Use the right model for the job. Use a powerful, expensive model (like Claude 3 Opus) for high-reasoning tasks in the "Explore → Plan" phase of development. Once a clear plan is established, use /clear and switch to a faster, cheaper model (like Claude 3 Sonnet or Haiku) for the "Code → Commit" execution phase.4
- **Sub-Agent Micromanagement:** The only consistently successful pattern reported by the community for sub-agents is to "micro manage" them.35 This involves abandoning the promise of autonomous delegation and instead "break\[ing\] the task into smaller, clear chunks".37 One successful pattern involved a parent sub-agent that calls two child sub-agents that _only return true or false_.35

This last point is telling. The most successful sub-agent patterns are _not agentic; they are functional_. Users are "de-braining" their sub-agents, stripping them of their complex reasoning prompts, and using them as hyper-specific, deterministic functions that return a boolean or a file path. This strongly implies that the _agentic overhead_—the "black box" reasoning, the new isolated context—is the _problem_. The most effective sub-agents are those that are refactored into simple, predictable tools.

## **6\. A Unified Framework: Synthesizing Skills, Sub-Agents, and MCPs**

### **6.1 The Complete Mental Model: How All Components Interact**

Based on this deep analysis, a unified theory of the Claude Code ecosystem emerges. Each component has a distinct role, and the most effective architecture (as defined by both capability and token-efficiency) uses all of them in concert.

- **CLAUDE.MD** is the **Static Constitution**. It is the foundational, _always-on_ context layer. To be efficient, it must be _lean_. Its job is _not_ to hold procedural knowledge. Its job is to define _project-specific architecture_ (e.g., "here is the map of our key files") 4 and _defer to processes_ (e.g., "run the linter").8
- **MCPs** are the **Connectivity Layer**. This is the "plumbing".19 It provides _access_ to external tools and data sources.20
- **Skills** are the **Knowledge Layer**. These are _discoverable, on-demand_ packets of _procedural knowledge_.9 They are the "onboarding guides."
- **Sub-Agents** are the **Execution Layer**. These are _specialized workers_.27

The official documentation provides the most succinct and powerful synthesis: **"MCP connects Claude to data; Skills teach Claude what to do with that data"**.41

A complete, advanced workflow integrates all of these. For example, a python-developer sub-agent (the _worker_) can be invoked, which then uses the pandas-analysis Skill (the _knowledge_) to access a remote database via an MCP server (the _connection_).41

### **6.2 Head-to-Head Comparison: When to Use What**

To make these architectural decisions practical, the following matrix summarizes the function, cost, and optimal use case for each component.

| Component       | Primary Function                                                 | Invocation Method                   | Persistence                      | Token Cost Profile                                                                                                           | Optimal Use Case                                                                                                                                           |
| :-------------- | :--------------------------------------------------------------- | :---------------------------------- | :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Prompt** | Ephemeral, one-time instructions.                                | User-Invoked                        | Single conversation turn         | **Variable:** Conversational                                                                                                 | Day-to-day tasking, refinement, and conversational back-and-forth.41                                                                                       |
| **CLAUDE.MD**   | Foundational, project-specific context, rules, and architecture. | Automatic (at session start)        | Entire session                   | **Fixed, High, Persistent "Tax."** All tokens are consumed in _every_ session.                                               | Core tech stack, key file map, "Do Not Touch" list, and high-level architectural principles.2                                                              |
| **Agent Skill** | Modular, reusable, _procedural_ knowledge ("how-to").            | **Model-Invoked** (via description) | Persistent (across all projects) | **Dynamic (Progressive Disclosure).** Very low fixed cost \+ on-demand cost when used.9                                      | Capturing "how-to" guides, coding standards, API usage, and complex, repeatable workflows.9                                                                |
| **MCP Server**  | Connectivity to external tools and data sources.                 | Model-Invoked (as a tool call)      | Available when connected         | **High (Default):** All tool definitions loaded upfront.25 **Dynamic (Advanced):** On-demand loading via "Code Execution".25 | Accessing _any_ data/tool outside the local filesystem (Jira, Google Drive, Databases).22                                                                  |
| **Sub-Agent**   | Specialized agentic worker for a delegated task.                 | Model-Invoked (delegation)          | Available when defined           | **Extremely High.** Each call spins up a _new, separate context_, consuming vast tokens.35                                   | **(High-Risk)** _Official:_ Complex, isolated tasks.27 _Community:_ Avoid, or use for hyper-specific, micromanaged tasks 35 or in multi-agent pipelines.28 |

### **6.3 Final Recommendations for Building Cost-Effective, Production-Grade Agents**

This analysis leads to five core recommendations for any developer or team seeking to build powerful, efficient, and cost-effective agentic systems with Claude Code.

1. **Treat CLAUDE.MD as a High-Cost "Bootloader."** The CLAUDE.md file is your biggest and most consistent token liability. It must be kept lean, ideally under 100 lines. It should _not_ contain procedural guides. It should _only_ contain high-level architectural context (the "map" of the repo) 7 and high-level rules that _defer to processes_ (e.g., "run the linter").8 Its entire job is to give the agent just enough context to "boot up" and use its other, more efficient tools (Skills and MCPs).
2. **Aggressively Convert "Chat" to "Skills."** As you work, monitor your own conversations.9 If you find yourself _repeating an instruction_ or _re-explaining a process_ 12, that instruction does not belong in your chat; it belongs in a SKILL.md file. This is the primary mechanism for building a truly effective agent that "learns" and compounds its knowledge, reducing repetitive prompting and token waste over time.10
3. **Adopt the "Code Execution with MCP" Pattern Immediately.** Do not use the default "load all tools" MCP pattern. The documented 98.7% token saving 25 is not a minor optimization; it is a _mandatory architecture_ for any serious, cost-conscious development. Present tools as code APIs and let the model load definitions and filter results on demand. If this is too complex to implement immediately, use the "Persona" pattern 26 as a simpler, session-level alternative.
4. **Be Wary of Sub-Agents.** The community consensus is clear and contradicts official documentation: sub-agents, in their current implementation, are token-inefficient and dangerously "obfuscated".35 Avoid them for general tasks. Only consider them for highly-specialized, multi-agent _pipelines_ where strict isolation and "separation of concerns" is a non-negotiable architectural goal 28, and be prepared to "micromanage" them 35 and build your own workarounds to monitor their state.37
5. **The Ultimate Goal \= LLM-as-Orchestrator.** The most efficient and powerful agent is one that does the _least_ work in its own context window. The goal of the architect is to build an agent that _reasons_ for 1,000 tokens, then _writes 500 tokens of code_ that leverages Skills (knowledge) and MCPs (tools) to perform a massive operation _externally_, and finally _reads a 500-token summary_ of the result. This "LLM-as-Orchestrator" model 25 is the key to unlocking agentic-scale work while maintaining a cost-effective and efficient token budget.

#### **Works cited**

1. accessed November 15, 2025, [https://www.anthropic.com/engineering/claude-code-best-practices\#:\~:text=CLAUDE.md%20is%20a%20special,Code%20style%20guidelines](https://www.anthropic.com/engineering/claude-code-best-practices#:~:text=CLAUDE.md%20is%20a%20special,Code%20style%20guidelines)
2. Claude Code Best Practices \\ Anthropic, accessed November 15, 2025, [https://www.anthropic.com/engineering/claude-code-best-practices](https://www.anthropic.com/engineering/claude-code-best-practices)
3. How to Master Claude MD Files in Claude Code: The Developer's Complete Guide to AI-Powered Documentation \- Empathy First Media, accessed November 15, 2025, [https://empathyfirstmedia.com/claude-md-file-claude-code/](https://empathyfirstmedia.com/claude-md-file-claude-code/)
4. What's a Claude.md File? 5 Best Practices to Use Claude.md for ..., accessed November 15, 2025, [https://apidog.com/blog/claude-md/](https://apidog.com/blog/claude-md/)
5. Best Practices for Maximizing Claude Code Performance | by Terry Cho \- Medium, accessed November 15, 2025, [https://medium.com/@terrycho/best-practices-for-maximizing-claude-code-performance-f2d049579563](https://medium.com/@terrycho/best-practices-for-maximizing-claude-code-performance-f2d049579563)
6. Managing Costs and Token Usage in Claude Code | Developing with AI Tools, accessed November 15, 2025, [https://stevekinney.com/courses/ai-development/cost-management](https://stevekinney.com/courses/ai-development/cost-management)
7. How we structure our CLAUDE.md file (and why) : r/ClaudeAI \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1mecx5t/how_we_structure_our_claudemd_file_and_why/](https://www.reddit.com/r/ClaudeAI/comments/1mecx5t/how_we_structure_our_claudemd_file_and_why/)
8. Writing CLAUDE.md for mature codebases | Huikang's blog, accessed November 15, 2025, [https://blog.huikang.dev/2025/05/31/writing-claude-md.html](https://blog.huikang.dev/2025/05/31/writing-claude-md.html)
9. Equipping agents for the real world with Agent Skills \- Anthropic, accessed November 15, 2025, [https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
10. Agent Skills \- Claude Code Docs, accessed November 15, 2025, [https://code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills)
11. Introducing Agent Skills \- Claude, accessed November 15, 2025, [https://www.claude.com/blog/skills](https://www.claude.com/blog/skills)
12. Claude Code Best Practices \- Use Claude to Its Full Potential \- Shuttle.dev, accessed November 15, 2025, [https://www.shuttle.dev/blog/2025/10/16/claude-code-best-practices](https://www.shuttle.dev/blog/2025/10/16/claude-code-best-practices)
13. How I Built Agent Skills for Claude Code \- DEV Community, accessed November 15, 2025, [https://dev.to/nunc/how-i-built-agent-skills-for-claude-code-oj4](https://dev.to/nunc/how-i-built-agent-skills-for-claude-code-oj4)
14. Inside Claude Skills: Anthropic's new pattern for customizing LLMs \- TechTalks, accessed November 15, 2025, [https://bdtechtalks.com/2025/10/20/anthropic-agent-skills/](https://bdtechtalks.com/2025/10/20/anthropic-agent-skills/)
15. Skill authoring best practices \- Claude Docs, accessed November 15, 2025, [https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)
16. wshobson/agents: Intelligent automation and multi-agent orchestration for Claude Code \- GitHub, accessed November 15, 2025, [https://github.com/wshobson/agents](https://github.com/wshobson/agents)
17. accessed November 15, 2025, [https://en.wikipedia.org/wiki/Model_Context_Protocol\#:\~:text=The%20Model%20Context%20Protocol%20(MCP,%2C%20systems%2C%20and%20data%20sources.](https://en.wikipedia.org/wiki/Model_Context_Protocol#:~:text=The%20Model%20Context%20Protocol%20(MCP,%2C%20systems%2C%20and%20data%20sources.)
18. Model Context Protocol \- Wikipedia, accessed November 15, 2025, [https://en.wikipedia.org/wiki/Model_Context_Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol)
19. Model Context Protocol, accessed November 15, 2025, [https://modelcontextprotocol.io/docs/getting-started/intro](https://modelcontextprotocol.io/docs/getting-started/intro)
20. MCP Explained: The New Standard Connecting AI to Everything | by Edwin Lisowski, accessed November 15, 2025, [https://medium.com/@elisowski/mcp-explained-the-new-standard-connecting-ai-to-everything-79c5a1c98288](https://medium.com/@elisowski/mcp-explained-the-new-standard-connecting-ai-to-everything-79c5a1c98288)
21. Model Context Protocol (MCP) \- Claude Docs, accessed November 15, 2025, [https://docs.claude.com/en/docs/mcp](https://docs.claude.com/en/docs/mcp)
22. Connect Claude Code to tools via MCP \- Claude Code Docs, accessed November 15, 2025, [https://code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)
23. Connect to local MCP servers \- Model Context Protocol, accessed November 15, 2025, [https://modelcontextprotocol.io/docs/develop/connect-local-servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
24. What is Model Context Protocol (MCP)? \- IBM, accessed November 15, 2025, [https://www.ibm.com/think/topics/model-context-protocol](https://www.ibm.com/think/topics/model-context-protocol)
25. Code execution with MCP: building more efficient AI agents \\ Anthropic, accessed November 15, 2025, [https://www.anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp)
26. Solving Token Waste with Claude Code Personas – Decoding, accessed November 15, 2025, [https://decoding.io/2025/08/solving-token-waste-with-claude-code-personas/](https://decoding.io/2025/08/solving-token-waste-with-claude-code-personas/)
27. Subagents \- Claude Code Docs, accessed November 15, 2025, [https://code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)
28. Best practices for Claude Code subagents \- PubNub, accessed November 15, 2025, [https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
29. What's your best way to use Sub-agents in Claude Code so far? \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1mdyc60/whats_your_best_way_to_use_subagents_in_claude/](https://www.reddit.com/r/ClaudeAI/comments/1mdyc60/whats_your_best_way_to_use_subagents_in_claude/)
30. We prepared a collection of Claude code subagents for production-ready workflows. : r/ClaudeAI \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1mi59yk/we_prepared_a_collection_of_claude_code_subagents/](https://www.reddit.com/r/ClaudeAI/comments/1mi59yk/we_prepared_a_collection_of_claude_code_subagents/)
31. hesreallyhim/awesome-claude-code: A curated list of ... \- GitHub, accessed November 15, 2025, [https://github.com/hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
32. rahulvrane/awesome-claude-agents: collection of awesome claude code subagents\! \- GitHub, accessed November 15, 2025, [https://github.com/rahulvrane/awesome-claude-agents](https://github.com/rahulvrane/awesome-claude-agents)
33. 7 powerful Claude Code subagents you can build in 2025 \- eesel AI, accessed November 15, 2025, [https://www.eesel.ai/blog/claude-code-subagents](https://www.eesel.ai/blog/claude-code-subagents)
34. How do you make Claude Code (or other AI coding agents) handle projects more “end-to-end” without so much manual fixing? : r/ClaudeCode \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeCode/comments/1mvbcnb/how_do_you_make_claude_code_or_other_ai_coding/](https://www.reddit.com/r/ClaudeCode/comments/1mvbcnb/how_do_you_make_claude_code_or_other_ai_coding/)
35. Subagents are slow, consume vast tokens while hiding how lost they are at their jobs : r/ClaudeCode \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeCode/comments/1mdgjqz/subagents_are_slow_consume_vast_tokens_while/](https://www.reddit.com/r/ClaudeCode/comments/1mdgjqz/subagents_are_slow_consume_vast_tokens_while/)
36. From Quality Drift to Continuous Improvement: How Claude Sub‑Agents \+ Sharded Docs Fixed My AI Dev Workflow | by Mustafa Abdelhamid | Oct, 2025 | Medium, accessed November 15, 2025, [https://medium.com/@mou.abdelhamid/from-quality-drift-to-continuous-improvement-how-claude-sub-agents-sharded-docs-fixed-my-ai-dev-8027b7cec8fc](https://medium.com/@mou.abdelhamid/from-quality-drift-to-continuous-improvement-how-claude-sub-agents-sharded-docs-fixed-my-ai-dev-8027b7cec8fc)
37. Sub agents failing max output : r/ClaudeAI \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1o9jeh8/sub_agents_failing_max_output/](https://www.reddit.com/r/ClaudeAI/comments/1o9jeh8/sub_agents_failing_max_output/)
38. Optimizing for usage when using multi agents \- ClaudeAI \- Reddit, accessed November 15, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1nnd2to/optimizing_for_usage_when_using_multi_agents/](https://www.reddit.com/r/ClaudeAI/comments/1nnd2to/optimizing_for_usage_when_using_multi_agents/)
39. Reduce token waste from redundant file change notifications · Issue ..., accessed November 15, 2025, [https://github.com/anthropics/claude-code/issues/9388](https://github.com/anthropics/claude-code/issues/9388)
40. Token Optimization Strategies for AI Agents | by Netanel Avraham | Elementor Engineers, accessed November 15, 2025, [https://medium.com/elementor-engineers/optimizing-token-usage-in-agent-based-assistants-ffd1822ece9c](https://medium.com/elementor-engineers/optimizing-token-usage-in-agent-based-assistants-ffd1822ece9c)
41. Skills explained: How Skills compares to prompts, Projects, MCP, and subagents | Claude, accessed November 15, 2025, [https://www.claude.com/blog/skills-explained](https://www.claude.com/blog/skills-explained)
42. Claude Skills: Glimpse of Continual Learning?, accessed November 15, 2025, [https://www.youtube.com/watch?v=FOqbS_llAms](https://www.youtube.com/watch?v=FOqbS_llAms)
