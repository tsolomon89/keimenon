# Research: Gemma Local Runtime

## A. Gemma 4 Model, License, Model Selection

Based on official Google/Gemma sources (Gemma 4 model card):

1. **Gemma 4 Model Variants:** Supports E2B, E4B, 26B, A4B, and 31B variants.
2. **Default Local Model:** Gemma 4 E4B instruction model (exact ID verified via /models)
3. **Low-resource Fallback Model:** Gemma 4 E2B instruction model
4. **Power-user Local Model:** Gemma 4 26B instruction model
5. **Context Length Limits:** Supports 128K and 256K context windows depending on the specific model size.
6. **License and Distribution Constraints:** Gemma 4 is Apache 2.0 licensed.
7. **Bundling:** Model weights MUST NOT be bundled or auto-downloaded by the application. They must be user-installed.
8. **Capabilities:** Gemma 4 supports native system roles, function calling, and configurable thinking mode.

## B. Gemma Prompt Formatting and Chat Structure

1. **Format:** Chat messages follow standard roles (`user`, `assistant`, `model`, `system`). The local runtime typically abstracts the raw `<start_of_turn>` tokens via an OpenAI-compatible `/chat/completions` endpoint or similar wrapper.
2. **Runtime Expectation:** The selected runtime (Ollama / LM Studio) expects an OpenAI-compatible `messages` array.
3. **System Instructions:** Passed as a message with role `system`.
4. **Thinking Mode:** Can be enabled/disabled via runtime-specific parameters.
5. **Persisting History:** Keimenon MUST strip any hidden reasoning or thinking output before persisting the final assistant message to avoid context drift and polluting history.
6. **Tool/Function Calling:** Supported by providing a tools schema. The model outputs tool calls in a specific format (e.g. JSON or tags).
7. **Execution:** The application must intercept the tool call, validate it against allowed runtime skills, and execute it outside the model.
8. **Support:** Yes, major local runtimes (Ollama, LM Studio) support tool calling for Gemma.

## C. Local Gemma Runtime Options

1. **Integration Target:** An OpenAI-compatible local HTTP API (like Ollama or LM Studio) is the easiest to integrate via Node/TypeScript.
2. **HTTP API:** Yes, exposed typically on port 11434 (Ollama) or 1234 (LM Studio).
3. **Model Support:** Both runtimes support Gemma 4 E4B-it.
4. **Thinking Mode:** Supported, though reasoning tokens may be returned as part of the stream or a separate field depending on the wrapper.
5. **Function Calling:** Supported natively in the chat completions API.
6. **Installation:** User must install the runtime and pull the model explicitly.
7. **Keimenon's Role:** Keimenon MUST connect to an already-running local runtime. It will NOT bundle, download, or start the runtime automatically.

## D. Agent / Skill / Workflow Structure

Based on standard vendor agent architectures:

1. **File Structure:** Skills are defined in `agent_context/runtime-skills/<skill-id>/` containing `SKILL.md`, `output.schema.json`, `examples.md`, and `guardrails.md`.
2. **Metadata:** Defined via YAML frontmatter in `SKILL.md`.
3. **Descriptions:** The skill describes its purpose, inputs, forbidden behavior, required output shape, and escalation rules.
4. **Composition:** An agent combines these skills, a selected model provider, context bounds, and a strict output schema to ensure predictable results.
5. **Keimenon-Specific:** Runtime skills are product-runtime skills (natural-language programs), not coding-agent tools. They must operate strictly on the supplied `ContextPack` and cannot access the database or web directly in this epic. All outputs are proposed and require provenance (evidence IDs).
