import { nanoid } from 'nanoid';
import { ConversationThread, MessageNode } from '@keimenon/types';
import { ConversationContextService } from './conversation-context.service';
import { buildConversationSynthesisInput } from './conversation-synthesis-input';
import {
  mockSynthesisAdapter,
  ConversationSynthesisAdapter,
} from './conversation-synthesis-adapter';

export class ConversationMessageService {
  private database: any;
  private contextService: ConversationContextService;
  private synthesisAdapter: ConversationSynthesisAdapter;

  constructor(database: any) {
    this.database = database;
    this.contextService = new ConversationContextService(database);
    this.synthesisAdapter = mockSynthesisAdapter;
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

    return messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  // Post message and orchestrate synthesis
  public async postMessage(
    accountId: string,
    userId: string,
    conversationId: string,
    content: string,
    runSynthesis: boolean = true
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

    // 2. Insert user message
    const userMsgId = `msg_${nanoid()}`;
    const userMsgProps = {
      role: 'user',
      content,
      thread_id: conversationId,
      timestamp: now,
    };

    this.database
      .prepare(
        `
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
      VALUES (?, 'Message', ?, ?, ?, ?, ?)
    `
      )
      .run(userMsgId, JSON.stringify(userMsgProps), accountId, userId, now, now);

    // 3. Add edges for user message
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

    const userMessage: MessageNode = {
      id: userMsgId,
      kind: 'Message',
      created_at: now,
      updated_at: now,
      ...userMsgProps,
    } as MessageNode;

    let assistantMessage: MessageNode | undefined = undefined;
    let synthesisError: string | undefined = undefined;

    // 4. Run synthesis if requested
    if (runSynthesis !== false) {
      try {
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
        const result = await this.synthesisAdapter.synthesize(synthesisInput);

        // Success: persist assistant message
        const asstTime = Date.now();
        const asstMsgId = `msg_${nanoid()}`;
        const asstMsgProps = {
          role: 'assistant',
          content: result.content,
          thread_id: conversationId,
          timestamp: asstTime,
        };

        this.database
          .prepare(
            `
          INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
          VALUES (?, 'Message', ?, ?, ?, ?, ?)
        `
          )
          .run(asstMsgId, JSON.stringify(asstMsgProps), accountId, userId, asstTime, asstTime);

        // Edges for assistant message
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
            .run(`edge_auth_${nanoid()}`, asstMsgId, agentPrincipalId, accountId, userId, asstTime);
        }

        assistantMessage = {
          id: asstMsgId,
          kind: 'Message',
          created_at: asstTime,
          updated_at: asstTime,
          ...asstMsgProps,
        } as MessageNode;
      } catch (err: any) {
        synthesisError = err.message || 'Unknown synthesis error';
      }
    }

    return {
      userMessage,
      assistantMessage,
      synthesisError,
    };
  }
}
