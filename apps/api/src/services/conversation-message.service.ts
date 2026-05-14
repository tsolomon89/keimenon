import { nanoid } from 'nanoid';
import { ConversationThread, MessageNode, AgentRun } from '@keimenon/types';
import { ConversationContextService } from './conversation-context.service';
import { buildConversationSynthesisInput } from './conversation-synthesis-input';
import { providerRegistry } from './agent/synthesis-provider-registry';
import { skillRegistry } from './agent/runtime-skill-loader';

export class ConversationMessageService {
  private database: any;
  private contextService: ConversationContextService;

  constructor(database: any) {
    this.database = database;
    this.contextService = new ConversationContextService(database);
  }

  // Helper to parse properties
  private parseProperties(props: string): Record<string, any> {
    try {
      return JSON.parse(props || '{}');
    } catch {
      return {};
    }
  }

  // Get messages for a conversation
  public getMessages(accountId: string, conversationId: string): MessageNode[] {
    const convRow = this.database
      .prepare(
        `
      SELECT id FROM nodes
      WHERE id = ? AND account_id = ? AND kind = 'ConversationThread'
    `
      )
      .get(conversationId, accountId);

    if (!convRow) {
      throw new Error('Conversation not found or access denied');
    }

    const rows = this.database
      .prepare(
        `
      SELECT n.id, n.kind, n.created_at, n.updated_at, n.properties
      FROM edges e
      JOIN nodes n ON e.to_id = n.id
      WHERE e.from_id = ? AND e.kind = 'HAS_MESSAGE' AND n.kind = 'Message' AND n.account_id = ?
    `
      )
      .all(conversationId, accountId);

    const messages: MessageNode[] = rows.map((row: any) => {
      const props = this.parseProperties(row.properties);
      return {
        id: row.id,
        kind: row.kind,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ...props,
      } as MessageNode;
    });

    return messages.sort((a, b) => {
      const timeDiff = (a.timestamp || 0) - (b.timestamp || 0);
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
  }

  public async postMessage(
    accountId: string,
    userId: string,
    conversationId: string,
    content: string,
    runSynthesis: boolean = true,
    skillId?: string,
    providerId?: string
  ) {
    const now = Date.now();

    // 1. Fetch conversation
    const convRow = this.database
      .prepare(
        `
      SELECT id, kind, created_at, updated_at, properties
      FROM nodes
      WHERE id = ? AND account_id = ? AND kind = 'ConversationThread'
    `
      )
      .get(conversationId, accountId);

    if (!convRow) {
      throw new Error('Conversation not found or access denied');
    }

    const convProps = this.parseProperties(convRow.properties);
    const conversation = {
      id: convRow.id,
      kind: convRow.kind,
      created_at: convRow.created_at,
      updated_at: convRow.updated_at,
      ...convProps,
    } as any;

    const humanPrincipalId = convProps.human_principal_id;
    const agentPrincipalId = convProps.agent_principal_id;

    // 2. Insert user message in a transaction
    const userMsgId = `msg_${nanoid()}`;
    const userMsgProps = {
      role: 'user',
      content,
      thread_id: conversationId,
      timestamp: now,
    };

    const userMessage: MessageNode = {
      id: userMsgId,
      kind: 'Message',
      created_at: now,
      updated_at: now,
      ...userMsgProps,
    } as MessageNode;

    const persistUserMessageTx = this.database.transaction(() => {
      this.database
        .prepare(
          `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Message', ?, ?, ?, ?, ?)
      `
        )
        .run(userMsgId, JSON.stringify(userMsgProps), accountId, userId, now, now);

      this.database
        .prepare(
          `
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
        VALUES (?, 'HAS_MESSAGE', ?, ?, '{}', ?, ?, ?)
      `
        )
        .run(`edge_hasmsg_${nanoid()}`, conversationId, userMsgId, accountId, userId, now);

      if (humanPrincipalId) {
        this.database
          .prepare(
            `
          INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
          VALUES (?, 'AUTHORED_BY', ?, ?, '{}', ?, ?, ?)
        `
          )
          .run(`edge_auth_${nanoid()}`, userMsgId, humanPrincipalId, accountId, userId, now);
      }
    });

    persistUserMessageTx();

    let assistantMessage: MessageNode | undefined = undefined;
    let synthesisError: string | undefined = undefined;

    // 4. Run synthesis if requested
    if (runSynthesis !== false) {
      if (!agentPrincipalId) {
        return {
          userMessage,
          synthesisError: 'AGENT_PRINCIPAL_REQUIRED',
        };
      }

      const startTime = Date.now();
      const targetSkill = skillId || 'bounded-answer';
      let synthesisResult: any;
      let usedProvider = providerId || 'mock';

      try {
        // Ensure skills are loaded (in a real app this is done at startup)
        if (skillRegistry.getAllSkills().length === 0) {
          skillRegistry.loadRuntimeSkills();
        }

        const provider = providerRegistry.getProvider(providerId);
        usedProvider = provider.id;

        // Build context pack
        const contextPack = this.contextService.buildContextPack(
          accountId,
          conversationId,
          convProps.context_spec || {}
        );

        // Get history
        const messages = this.getMessages(accountId, conversationId); // includes the new user message
        const historicalMessages = messages.filter((m) => m.id !== userMsgId);

        // Serialize
        const synthesisInput = buildConversationSynthesisInput({
          conversation,
          contextPack,
          messages: historicalMessages,
          userMessage,
        });

        // Call adapter
        synthesisResult = await provider.synthesize(synthesisInput, targetSkill);

        // Success: persist assistant message in a transaction
        const asstTime = Date.now();
        const asstMsgId = `msg_${nanoid()}`;
        const asstMsgProps = {
          role: 'assistant',
          content: synthesisResult.content,
          thread_id: conversationId,
          timestamp: asstTime,
        };

        assistantMessage = {
          id: asstMsgId,
          kind: 'Message',
          created_at: asstTime,
          updated_at: asstTime,
          ...asstMsgProps,
        } as MessageNode;

        const persistAssistantMessageTx = this.database.transaction(() => {
          this.database
            .prepare(
              `
            INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
            VALUES (?, 'Message', ?, ?, ?, ?, ?)
          `
            )
            .run(asstMsgId, JSON.stringify(asstMsgProps), accountId, userId, asstTime, asstTime);

          this.database
            .prepare(
              `
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'HAS_MESSAGE', ?, ?, '{}', ?, ?, ?)
          `
            )
            .run(`edge_hasmsg_${nanoid()}`, conversationId, asstMsgId, accountId, userId, asstTime);

          if (agentPrincipalId) {
            this.database
              .prepare(
                `
              INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
              VALUES (?, 'AUTHORED_BY', ?, ?, '{}', ?, ?, ?)
            `
              )
              .run(
                `edge_auth_${nanoid()}`,
                asstMsgId,
                agentPrincipalId,
                accountId,
                userId,
                asstTime
              );
          }

          // Record AgentRun
          const runId = `run_${nanoid()}`;
          const duration = Date.now() - startTime;
          const runProps = {
            actor_principal_id: agentPrincipalId,
            provider: usedProvider,
            model: synthesisResult.model,
            skill_used: targetSkill,
            duration_ms: duration,
            status: 'success',
          };

          this.database
            .prepare(
              `
            INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
            VALUES (?, 'AgentRun', ?, ?, ?, ?, ?)
          `
            )
            .run(runId, JSON.stringify(runProps), accountId, userId, asstTime, asstTime);

          if (agentPrincipalId) {
            this.database
              .prepare(
                `
              INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
              VALUES (?, 'RUN_BY', ?, ?, '{}', ?, ?, ?)
            `
              )
              .run(`edge_runby_${nanoid()}`, runId, agentPrincipalId, accountId, userId, asstTime);
          }

          this.database
            .prepare(
              `
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'RUN_FOR', ?, ?, '{}', ?, ?, ?)
          `
            )
            .run(`edge_runfor_${nanoid()}`, runId, conversationId, accountId, userId, asstTime);

          this.database
            .prepare(
              `
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'INPUT_MESSAGE', ?, ?, '{}', ?, ?, ?)
          `
            )
            .run(`edge_runin_${nanoid()}`, runId, userMsgId, accountId, userId, asstTime);

          this.database
            .prepare(
              `
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'PRODUCED_MESSAGE', ?, ?, '{}', ?, ?, ?)
          `
            )
            .run(`edge_runout_${nanoid()}`, runId, asstMsgId, accountId, userId, asstTime);

          // Record USED_EVIDENCE edges
          if (synthesisResult.evidence_used && synthesisResult.evidence_used.length > 0) {
            const insertEdge = this.database.prepare(`
              INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
              VALUES (?, 'USED_EVIDENCE', ?, ?, '{}', ?, ?, ?)
            `);
            for (const evId of synthesisResult.evidence_used) {
              insertEdge.run(`edge_runev_${nanoid()}`, runId, evId, accountId, userId, asstTime);
            }
          }
        });

        persistAssistantMessageTx();

        const agentRunDetails = {
          actor_principal_id: agentPrincipalId,
          provider: usedProvider,
          model: synthesisResult?.model,
          skill_used: targetSkill,
          duration_ms: Date.now() - startTime,
        };

        return {
          userMessage,
          assistantMessage,
          agentRunDetails,
        };
      } catch (error: any) {
        synthesisError = error.message;

        // Log failed AgentRun
        try {
          const runId = `run_${nanoid()}`;
          const duration = Date.now() - startTime;
          const runProps = {
            provider: usedProvider,
            skill_used: targetSkill,
            duration_ms: duration,
            status: 'error',
            error_message: synthesisError,
          };
          this.database
            .prepare(
              `
            INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
            VALUES (?, 'AgentRun', ?, ?, ?, ?, ?)
          `
            )
            .run(runId, JSON.stringify(runProps), accountId, userId, startTime, startTime);

          this.database
            .prepare(
              `
            INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
            VALUES (?, 'RUN_FOR', ?, ?, '{}', ?, ?, ?)
          `
            )
            .run(`edge_runfor_${nanoid()}`, runId, conversationId, accountId, userId, startTime);
        } catch (runErr) {
          console.error('[ConversationMessageService] Failed to record error AgentRun', runErr);
        }

        return {
          userMessage,
          synthesisError,
          agentRunDetails: {
            actor_principal_id: agentPrincipalId,
            provider: usedProvider,
            skill_used: targetSkill,
            duration_ms: Date.now() - startTime,
            status: 'error',
          },
        };
      }
    }

    return {
      userMessage,
    };
  }
}
