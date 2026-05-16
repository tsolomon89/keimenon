import { SynthesisProvider, ConversationSynthesisResult } from './synthesis-provider-registry';
import { ConversationSynthesisInput } from '../conversation-synthesis-input';
import { GemmaSerializer } from './gemma-serializer';
import { skillRegistry } from './runtime-skill-loader';

export function isGemmaModelId(modelId: string): boolean {
  return modelId.toLowerCase().includes('gemma');
}

export interface GemmaLocalStatus {
  configured: boolean;
  status: 'online' | 'offline' | 'unavailable';
  error_code?:
    | 'GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED'
    | 'GEMMA_LOCAL_RUNTIME_UNAVAILABLE'
    | 'GEMMA_MODEL_NOT_FOUND'
    | 'GEMMA_STATUS_CHECK_FAILED';
  error?: string;
  runtimeKind?: string;
  modelName?: string;
  modelAvailable?: boolean;
  timeoutMs?: number;
  thinkingEnabled?: boolean;
}

export class GemmaLocalProvider implements SynthesisProvider {
  public id = 'gemma-local';
  public family: 'gemma' | 'mock' = 'gemma';
  public mode: 'local' | 'mock' = 'local';
  private serializer = new GemmaSerializer();

  public async checkStatus(): Promise<GemmaLocalStatus> {
    const baseUrl = process.env.GEMMA_LOCAL_BASE_URL;
    const runtimeKind = process.env.GEMMA_LOCAL_RUNTIME_KIND || 'openai-compatible';
    const modelName = process.env.GEMMA_LOCAL_MODEL || 'gemma-4-e2b';
    const timeoutMs = parseInt(process.env.GEMMA_LOCAL_TIMEOUT_MS || '60000', 10);
    const thinkingEnabled = process.env.GEMMA_LOCAL_THINKING === 'on';

    if (!baseUrl) {
      return {
        configured: false,
        status: 'unavailable',
        error_code: 'GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED',
        error: 'Gemma local base URL is not configured.',
      };
    }

    const endpoint = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout for status

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          configured: true,
          status: 'offline',
          error_code: 'GEMMA_STATUS_CHECK_FAILED',
          error: `HTTP ${response.status}`,
          runtimeKind,
          modelName,
          modelAvailable: false,
          timeoutMs,
          thinkingEnabled,
        };
      }

      const data = await response.json();
      let availableModelIds: string[] = [];

      // Support OpenAI-compatible model list shape: { data: [{ id }] }
      if (data && Array.isArray(data.data)) {
        availableModelIds = data.data.map((m: any) => m.id);
      }
      // Optionally support Ollama native shape: { models: [{ name }] }
      else if (data && Array.isArray(data.models)) {
        availableModelIds = data.models.map((m: any) => m.name || m.id || m.model);
      }

      if (!isGemmaModelId(modelName)) {
        return {
          configured: true,
          status: 'offline',
          error_code: 'GEMMA_MODEL_NOT_FOUND',
          error: `Configured model '${modelName}' is not a Gemma model family.`,
          runtimeKind,
          modelName,
          modelAvailable: false,
          timeoutMs,
          thinkingEnabled,
        };
      }

      if (!availableModelIds.includes(modelName)) {
        return {
          configured: true,
          status: 'offline',
          error_code: 'GEMMA_MODEL_NOT_FOUND',
          error: `Gemma model '${modelName}' not found in local runtime host.`,
          runtimeKind,
          modelName,
          modelAvailable: false,
          timeoutMs,
          thinkingEnabled,
        };
      }

      return {
        configured: true,
        status: 'online',
        runtimeKind,
        modelName,
        modelAvailable: true,
        timeoutMs,
        thinkingEnabled,
      };
    } catch (err: any) {
      return {
        configured: true,
        status: 'unavailable',
        error_code: 'GEMMA_LOCAL_RUNTIME_UNAVAILABLE',
        error: err.message,
        runtimeKind,
        modelName,
        modelAvailable: false,
        timeoutMs,
        thinkingEnabled,
      };
    }
  }

  public async synthesize(
    input: ConversationSynthesisInput,
    skillId: string
  ): Promise<ConversationSynthesisResult> {
    const baseUrl = process.env.GEMMA_LOCAL_BASE_URL;
    const runtimeKind = process.env.GEMMA_LOCAL_RUNTIME_KIND || 'openai-compatible';
    const modelName = process.env.GEMMA_LOCAL_MODEL || 'gemma-4-e2b';
    const timeoutMs = parseInt(process.env.GEMMA_LOCAL_TIMEOUT_MS || '60000', 10);
    const thinkingEnabled = process.env.GEMMA_LOCAL_THINKING === 'on';

    if (!baseUrl) {
      throw new Error('GEMMA_LOCAL_RUNTIME_NOT_CONFIGURED');
    }

    if (
      runtimeKind !== 'ollama' &&
      runtimeKind !== 'lm-studio' &&
      runtimeKind !== 'openai-compatible'
    ) {
      throw new Error(`Unsupported runtime kind: ${runtimeKind}`);
    }

    if (!isGemmaModelId(modelName)) {
      throw new Error(
        `GEMMA_MODEL_NOT_FOUND: Configured model '${modelName}' is not a Gemma model family.`
      );
    }

    // Load skill
    const skill = skillRegistry.selectRuntimeSkill(skillId);

    // Serialize payload
    const payload = this.serializer.serializeToOpenAiFormat(input, skill, modelName);

    // If thinking is disabled but model uses specific tokens, we rely on standard system prompting.
    // Thinking mode requires specific endpoint configuration or parameter passing depending on runtime.
    // For now, we only pass standard parameters.

    const endpoint = baseUrl.endsWith('/')
      ? `${baseUrl}chat/completions`
      : `${baseUrl}/chat/completions`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          // OpenAI compatible endpoints don't strictly support `thinking` fields natively yet,
          // but we can pass generic options if needed.
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as any;

      const content = data.choices?.[0]?.message?.content || '';

      // We must strip thinking tags if they leak into the content
      let finalContent = content;
      if (!thinkingEnabled) {
        // Strip out <think>...</think> blocks if any
        finalContent = finalContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }

      // Try to parse JSON if output schema requires it
      let parsedOutput: any;
      let textContent = finalContent;
      let evidenceUsed: string[] = [];
      let proposedOutputs: any[] = [];

      try {
        if (skill.output_schema && Object.keys(skill.output_schema).length > 0) {
          // Attempt to extract JSON from markdown if model wrapped it
          const jsonMatch = finalContent.match(/```(?:json)?\n?([\s\S]*?)```/);
          const jsonString = jsonMatch ? jsonMatch[1] : finalContent;
          parsedOutput = JSON.parse(jsonString);

          if (parsedOutput.content) textContent = parsedOutput.content;
          if (Array.isArray(parsedOutput.evidence_used)) evidenceUsed = parsedOutput.evidence_used;
          if (Array.isArray(parsedOutput.proposed_outputs))
            proposedOutputs = parsedOutput.proposed_outputs;
        }
      } catch (e) {
        console.warn('[GemmaLocalProvider] Failed to parse expected JSON output:', e);
      }

      return {
        content: textContent,
        provider: this.id,
        model: modelName,
        skill_used: skill.id,
        evidence_used: evidenceUsed,
        proposed_outputs: proposedOutputs,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('GEMMA_LOCAL_RUNTIME_TIMEOUT');
      }
      throw new Error(`GEMMA_LOCAL_RUNTIME_UNAVAILABLE: ${err.message}`);
    }
  }
}

export const gemmaProvider = new GemmaLocalProvider();
