import { ConversationSynthesisInput } from '../conversation-synthesis-input';
import { RuntimeSkill } from './runtime-skill-loader';

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GemmaOpenAiPayload {
  model: string;
  messages: OpenAiChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export class GemmaSerializer {
  public serializeToOpenAiFormat(
    input: ConversationSynthesisInput,
    skill: RuntimeSkill,
    modelName: string
  ): GemmaOpenAiPayload {
    const messages: OpenAiChatMessage[] = [];

    // 1. Build System Prompt
    let systemContent = `You are a helpful local AI assistant operating inside the Keimenon Knowledge Graph platform.\n`;
    systemContent += `\n--- SKILL INSTRUCTIONS ---\n${skill.instructions}\n`;

    // Output Schema Constraints
    if (skill.output_schema && Object.keys(skill.output_schema).length > 0) {
      systemContent += `\n--- OUTPUT SCHEMA ---\nYou must return a valid JSON object matching this schema:\n${JSON.stringify(
        skill.output_schema,
        null,
        2
      )}\nDo not include markdown blocks or any text outside the JSON.\n`;
    }

    systemContent += `\n--- EVIDENCE CONSTRAINTS ---\n`;
    systemContent += `You MUST ONLY use the facts provided in the ContextPack below to answer the user's prompt. Do NOT use your external knowledge. If the answer is not in the context, explicitly say so.\n`;
    systemContent += `Cite the node_id in the evidence_used array for any fact you use.\n`;

    messages.push({ role: 'system', content: systemContent });

    // 2. Build Context Pack message
    if (input.context.evidenceItems.length > 0) {
      let contextStr = `--- CONTEXT PACK EVIDENCE ---\n`;
      if (input.context.truncation.evidenceTruncated) {
        contextStr += `(Note: Evidence was truncated due to context limits)\n`;
      }
      for (const item of input.context.evidenceItems) {
        contextStr += `[ID: ${item.node_id}] `;
        if (item.text) contextStr += `Text: ${item.text}\n`;
        else if (item.label) contextStr += `Label: ${item.label}\n`;
        else contextStr += `Content: ${JSON.stringify(item)}\n`;
      }
      messages.push({ role: 'system', content: contextStr });
    }

    // 3. Add capped historical messages
    for (const msg of input.messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 4. Add current user message
    messages.push({ role: 'user', content: input.userMessage.content });

    return {
      model: modelName,
      messages,
      temperature: 0.1, // Keep it deterministic
    };
  }
}
