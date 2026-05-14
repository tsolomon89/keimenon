import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { SQLiteClient } from '@keimenon/db';
import { randomUUID } from 'crypto';
import { ConversationMessageService } from '../services/conversation-message.service';
import { skillRegistry } from '../services/agent/runtime-skill-loader';
import { GemmaSerializer } from '../services/agent/gemma-serializer';
import { providerRegistry } from '../services/agent/synthesis-provider-registry';
import { MockSynthesisProvider } from '../services/conversation-synthesis-adapter';
import { gemmaProvider } from '../services/agent/gemma-local-provider';

describe('Synthesis Runtime & Agent Skills', () => {
  beforeAll(() => {
    skillRegistry.loadRuntimeSkills();
  });
  let dbClient: SQLiteClient;
  let db: any;
  const mockAccountId = randomUUID();
  const mockHumanId = randomUUID();
  const mockAgentId = randomUUID();
  const mockConversationId = `conv_${randomUUID()}`;

  beforeEach(async () => {
    dbClient = new SQLiteClient({ databasePath: ':memory:' });
    await dbClient.connect();
    db = dbClient.getDatabase();

    // Setup basic account and user
    db.prepare(
      `
      INSERT INTO accounts (id, name, email, account_type, account_class, created_at, updated_at, allow_email_invites) 
      VALUES (?, 'Test Account', 'test@test.com', 'admin', 'free', ?, ?, 1)
    `
    ).run(mockAccountId, Date.now(), Date.now());

    db.prepare(
      `
      INSERT INTO users (id, email, name, permission_level, user_class, is_active, created_at, updated_at, email_verified) 
      VALUES (?, 'test@test.com', 'Test User', 'admin', 'person', 1, ?, ?, 1)
    `
    ).run(mockHumanId, Date.now(), Date.now());

    db.prepare(
      `
      INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at) 
      VALUES (?, ?, ?, 'admin', 1, 'active', ?, ?, ?)
    `
    ).run(`ua_${randomUUID()}`, mockHumanId, mockAccountId, Date.now(), Date.now(), Date.now());

    // Setup human principal
    db.prepare(
      `
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
      VALUES (?, 'Principal', ?, ?, ?, ?, ?)
    `
    ).run(
      mockHumanId,
      JSON.stringify({ type: 'human' }),
      mockAccountId,
      mockHumanId,
      Date.now(),
      Date.now()
    );

    // Setup agent principal
    db.prepare(
      `
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
      VALUES (?, 'Principal', ?, ?, ?, ?, ?)
    `
    ).run(
      mockAgentId,
      JSON.stringify({ type: 'agent' }),
      mockAccountId,
      mockHumanId,
      Date.now(),
      Date.now()
    );

    db.prepare(
      `
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
      VALUES (?, 'ConversationThread', ?, ?, ?, ?, ?)
    `
    ).run(
      mockConversationId,
      JSON.stringify({
        title: 'Test Conversation',
        human_principal_id: mockHumanId,
        purpose: 'general',
      }),
      mockAccountId,
      mockHumanId,
      Date.now(),
      Date.now()
    );
  });

  afterEach(() => {
    dbClient.close();
  });

  describe('SkillLoader & GemmaSerializer', () => {
    it('should successfully load the bounded-answer skill', () => {
      const skill = skillRegistry.selectRuntimeSkill('bounded-answer');
      expect(skill.id).toBe('bounded-answer');
      expect(skill.instructions).toContain(
        'Answer a user question based strictly on the provided ContextPack evidence.'
      );
      expect(skill.output_schema?.type).toBe('object');
    });

    it('should load exactly the 7 app-runtime skills and exclude repository coding skills', () => {
      const allSkills = skillRegistry.getAllSkills();
      expect(allSkills.length).toBe(7);

      const expectedSkillIds = [
        'bounded-answer',
        'bounded-synthesis',
        'citation-audit',
        'claim-extraction',
        'gap-analysis',
        'objective-claim-proposal',
        'source-discovery-plan',
      ];

      const loadedSkillIds = allSkills.map((s) => s.id);
      expectedSkillIds.forEach((id) => {
        expect(loadedSkillIds).toContain(id);
      });

      // Negative assertion to ensure repo/coding-agent skills are NOT loaded
      // Example of a repo skill that should not be here: code-review, documentation-sync, etc.
      expect(loadedSkillIds).not.toContain('code-review');
      expect(loadedSkillIds).not.toContain('api-backend-contract');
    });

    it('should serialize standard input into OpenAI compatible format', () => {
      const serializer = new GemmaSerializer();
      const skill = skillRegistry.selectRuntimeSkill('bounded-answer');

      const payload = serializer.serializeToOpenAiFormat(
        {
          conversationId: mockConversationId,
          messages: [],
          userMessage: { role: 'user', content: 'What is the answer?' },
          context: {
            metrics: { nodeCount: 1, edgeCount: 0, depth: 1 },
            evidenceItems: [
              {
                node_id: 'node_1',
                text: 'The answer is 42.',
                source_id: 'src_1',
                source_kind: 'Source',
              },
            ],
            truncation: {
              evidenceTruncated: false,
              originalNodeCount: 1,
              truncatedNodeCount: 1,
              reasons: [],
            },
            topology: { clusters: [], keyNodes: [] },
          },
        } as any,
        skill,
        'gemma-4-e4b-it'
      );

      expect(payload.model).toBe('gemma-4-e4b-it');
      expect(payload.messages.length).toBe(3);
      expect(payload.messages[0].role).toBe('system');
      expect(payload.messages[0].content).toContain(skill.instructions);
      expect(payload.messages[1].role).toBe('system');
      expect(payload.messages[1].content).toContain('The answer is 42.');
      expect(payload.messages[2].role).toBe('user');
      expect(payload.messages[2].content).toBe('What is the answer?');
    });
  });

  describe('Provider Registry & AgentRun Provenance', () => {
    it('should fall back to mock provider if NO provider is requested', async () => {
      const service = new ConversationMessageService(db);

      // Create an agent principal for the conversation
      const conv = db
        .prepare(`SELECT properties FROM nodes WHERE id = ?`)
        .get(mockConversationId) as any;
      const props = JSON.parse(conv.properties);
      props.agent_principal_id = mockAgentId;
      db.prepare(`UPDATE nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify(props),
        mockConversationId
      );

      const result = await service.postMessage(
        mockAccountId,
        mockHumanId,
        mockConversationId,
        'Hello from the user',
        true,
        'bounded-answer',
        undefined // No provider requested
      );

      expect(result.synthesisError).toBeUndefined();
      expect(result.assistantMessage).toBeDefined();
      expect(result.agentRunDetails?.provider).toBe('mock');
      expect(result.agentRunDetails?.actor_principal_id).toBe(mockAgentId);

      // Verify AUTHORED_BY edges for user vs assistant messages
      const userAuthEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .all(result.userMessage.id, mockHumanId);
      expect(userAuthEdge.length).toBe(1);

      const asstAuthEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .all(result.assistantMessage!.id, mockAgentId);
      expect(asstAuthEdge.length).toBe(1);

      // Verify RUN_BY edge
      const runByEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'RUN_BY'`)
        .all(result.agentRunDetails!.agent_run_id, mockAgentId);
      expect(runByEdge.length).toBe(1);
    });

    it('should explicitly enforce actor separation between human and agent principals', async () => {
      const service = new ConversationMessageService(db);

      // The human is principal_human_1, the agent is principal_agent_1
      const principal_human_1 = mockHumanId;
      const principal_agent_1 = mockAgentId;

      // Assign the agent to the conversation
      const conv = db
        .prepare(`SELECT properties FROM nodes WHERE id = ?`)
        .get(mockConversationId) as any;
      const props = JSON.parse(conv.properties);
      props.agent_principal_id = principal_agent_1;
      db.prepare(`UPDATE nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify(props),
        mockConversationId
      );

      const result = await service.postMessage(
        mockAccountId,
        principal_human_1, // Action triggered by human
        mockConversationId,
        'Who authored this?',
        true,
        'bounded-answer',
        'mock'
      );

      // Assert User Message -> AUTHORED_BY -> principal_human_1
      const userAuthEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .all(result.userMessage.id, principal_human_1);
      expect(userAuthEdge.length).toBe(1);

      // Assert Assistant Message -> AUTHORED_BY -> principal_agent_1
      const asstAuthEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .all(result.assistantMessage!.id, principal_agent_1);
      expect(asstAuthEdge.length).toBe(1);

      // Assert AgentRun -> RUN_BY -> principal_agent_1
      const runByEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'RUN_BY'`)
        .all(result.agentRunDetails!.agent_run_id, principal_agent_1);
      expect(runByEdge.length).toBe(1);
    });

    it('should throw if explicitly requested provider is missing', async () => {
      const service = new ConversationMessageService(db);

      // Create an agent principal for the conversation
      const conv = db
        .prepare(`SELECT properties FROM nodes WHERE id = ?`)
        .get(mockConversationId) as any;
      const props = JSON.parse(conv.properties);
      props.agent_principal_id = mockAgentId;
      db.prepare(`UPDATE nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify(props),
        mockConversationId
      );

      const result = await service.postMessage(
        mockAccountId,
        mockHumanId,
        mockConversationId,
        'Hello from the user',
        true,
        'bounded-answer',
        'non-existent-provider'
      );

      expect(result.synthesisError).toContain('PROVIDER_NOT_CONFIGURED');
      expect(result.agentRunDetails?.status).toBe('error');
      expect(result.agentRunDetails?.actor_principal_id).toBe(mockAgentId);

      // Verify RUN_BY edge on failure
      const runByEdge = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'RUN_BY'`)
        .all(result.agentRunDetails!.agent_run_id, mockAgentId);
      expect(runByEdge.length).toBe(1);
    });

    it('should require agent_principal_id for synthesis (run_synthesis=true)', async () => {
      const service = new ConversationMessageService(db);

      // Ensure no agent_principal_id
      const conv = db
        .prepare(`SELECT properties FROM nodes WHERE id = ?`)
        .get(mockConversationId) as any;
      const props = JSON.parse(conv.properties);
      delete props.agent_principal_id;
      db.prepare(`UPDATE nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify(props),
        mockConversationId
      );

      const result = await service.postMessage(
        mockAccountId,
        mockHumanId,
        mockConversationId,
        'Hello from the user',
        true
      );

      // Persists user message but fails synthesis
      expect(result.userMessage.content).toBe('Hello from the user');
      expect(result.assistantMessage).toBeUndefined();
      expect(result.synthesisError).toBe('AGENT_PRINCIPAL_REQUIRED');

      // Check user message is authored by the human
      const edges = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .all(result.userMessage.id, mockHumanId);
      expect(edges.length).toBe(1);
    });

    it('should NOT require agent_principal_id if run_synthesis=false', async () => {
      const service = new ConversationMessageService(db);

      // Ensure no agent_principal_id
      const conv = db
        .prepare(`SELECT properties FROM nodes WHERE id = ?`)
        .get(mockConversationId) as any;
      const props = JSON.parse(conv.properties);
      delete props.agent_principal_id;
      db.prepare(`UPDATE nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify(props),
        mockConversationId
      );

      const result = await service.postMessage(
        mockAccountId,
        mockHumanId,
        mockConversationId,
        'Hello from the user',
        false
      );

      // Persists user message and no synthesis error
      expect(result.userMessage.content).toBe('Hello from the user');
      expect(result.assistantMessage).toBeUndefined();
      expect(result.synthesisError).toBeUndefined();
    });

    it('should successfully dispatch to Gemma provider if configured and handle AgentRun', async () => {
      // In a real integration test, we would mock fetch to simulate local Gemma.
      // Here, we just verify the route logic correctly selects it.

      // Create an agent principal for the conversation
      const conv = db
        .prepare(`SELECT properties FROM nodes WHERE id = ?`)
        .get(mockConversationId) as any;
      const props = JSON.parse(conv.properties);
      props.agent_principal_id = mockAgentId;
      db.prepare(`UPDATE nodes SET properties = ? WHERE id = ?`).run(
        JSON.stringify(props),
        mockConversationId
      );

      // Register a test-specific gemma provider
      const testGemmaProvider = {
        id: 'gemma-local-test',
        family: 'gemma',
        mode: 'local',
        synthesize: async (input: any, skillId: string) => {
          return {
            content: 'Simulated gemma response',
            provider: 'gemma-local-test',
            model: 'gemma-4-e4b-it',
            skill_used: skillId,
            evidence_used: [],
            proposed_outputs: [],
          };
        },
      } as any;

      providerRegistry.registerProvider(testGemmaProvider);

      const service = new ConversationMessageService(db);

      const result = await service.postMessage(
        mockAccountId,
        mockHumanId,
        mockConversationId,
        'Hello from the user',
        true,
        'bounded-answer',
        'gemma-local-test'
      );

      expect(result.synthesisError).toBeUndefined();
      expect(result.assistantMessage?.content).toBe('Simulated gemma response');
      expect(result.agentRunDetails?.provider).toBe('gemma-local-test');
      expect(result.agentRunDetails?.actor_principal_id).toBe(mockAgentId);

      // Verify AgentRun node
      const runNodes = db.prepare(`SELECT * FROM nodes WHERE kind = 'AgentRun'`).all() as any[];
      expect(runNodes.length).toBe(1);
      const runProps = JSON.parse(runNodes[0].properties);
      expect(runProps.provider).toBe('gemma-local-test');
      expect(runProps.model).toBe('gemma-4-e4b-it');

      // Verify RUN_BY edge
      const edges = db
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'RUN_BY'`)
        .all(runNodes[0].id, mockAgentId);
      expect(edges.length).toBe(1);
    });
  });
});
