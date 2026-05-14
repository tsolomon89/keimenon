import { api } from '@/lib/api-client';
import { BoardNode, GroupNode, MessageNode, AnyNode as KeimenonNode } from '@keimenon/types';

// Principal types
export interface Principal {
  id: string;
  kind: 'Principal';
  account_id: string;
  display_name: string;
  email?: string;
  principal_kind: 'human' | 'agent' | 'contact';
  capabilities: {
    can_upload: boolean;
    can_run_tools: boolean;
    can_import_web: boolean;
    can_own_account: boolean;
    can_approve_runs: boolean;
  };
  policy_profile_id?: string;
  created_by?: string;
  created_at: number;
  updated_at: number;
}

export interface CreatePrincipalInput {
  display_name: string;
  email?: string;
  principal_kind: 'human' | 'agent' | 'contact';
  capabilities?: Partial<Principal['capabilities']>;
}

// Workspace types
export interface Workspace {
  id: string;
  kind: 'Source';
  account_id: string;
  title: string;
  source_role: 'workspace';
  attached_agents: string[];
  context_pins: string[];
  provenance: {
    origin_principal_id: string;
    origin_type: string;
    origin_ref: string;
    trust_state: string;
  };
  created_at: number;
  updated_at: number;
}

export interface CreateWorkspaceInput {
  title: string;
  context_pins: string[];
  attached_agents?: string[];
}

// Conversation types
export interface ConversationContextPack {
  conversation_id: string;
  source_ids: string[];
  group_ids: string[];
  evidence: Array<{
    node_id: string;
    kind: string;
    source_id?: string;
    group_id?: string;
    text?: string;
    label?: string;
    provenance?: unknown;
  }>;
  limits: {
    max_sources: number;
    max_groups: number;
    max_evidence_items: number;
  };
  truncation: {
    sources_truncated: boolean;
    groups_truncated: boolean;
    evidence_truncated: boolean;
    requested_sources: number;
    returned_sources: number;
    requested_groups: number;
    returned_groups: number;
    returned_evidence_items: number;
  };
}

export interface ConversationThread {
  id: string;
  kind: 'ConversationThread';
  account_id: string;
  title: string;
  human_principal_id: string;
  agent_principal_id?: string;
  context_set_id?: string;
  purpose: 'summarize' | 'cluster' | 'draft' | 'research' | 'refactor' | 'verify' | 'general';
  context_spec?: {
    source_ids: string[];
    group_ids: string[];
    workspace_id?: string;
    include_pinned: boolean;
    expansion_rule: 'none' | 'neighbors' | 'connected';
  };
  created_at: number;
  updated_at: number;
}

export interface CreateConversationInput {
  title: string;
  agent_principal_id?: string;
  purpose?: ConversationThread['purpose'];
  context_spec?: ConversationThread['context_spec'];
}

export interface BoardGraphResponse {
  board_id: string;
  nodes: KeimenonNode[];
  edges: any[];
  stats: {
    nodeCount: number;
    edgeCount: number;
  };
}

export const organizationService = {
  /**
   * Fetch all boards for the current workspace/account
   */
  getBoards: async (workspaceId: string = 'default_workspace'): Promise<BoardNode[]> => {
    const response = await api.get<{ boards: BoardNode[] }>(`/boards?workspace_id=${workspaceId}`);
    return response.data.boards;
  },

  /**
   * Get a specific board by ID
   */
  getBoard: async (boardId: string): Promise<BoardNode> => {
    const response = await api.get<{ board: BoardNode }>(`/boards/${boardId}`);
    return response.data.board;
  },

  /**
   * Get the full graph (nodes + edges) for a board
   */
  getBoardGraph: async (boardId: string, limit: number = 1000): Promise<BoardGraphResponse> => {
    const response = await api.get<BoardGraphResponse>(`/boards/${boardId}/graph?limit=${limit}`);
    return response.data;
  },

  /**
   * Create a new board
   */
  createBoard: async (
    name: string,
    description?: string,
    workspaceId: string = 'default_workspace'
  ): Promise<BoardNode> => {
    const response = await api.post<{ board: BoardNode }>('/boards', {
      name,
      description,
      workspace_id: workspaceId,
    });
    return response.data.board;
  },

  /**
   * Update a board
   */
  updateBoard: async (boardId: string, updates: Partial<BoardNode>): Promise<BoardNode> => {
    const response = await api.put<{ board: BoardNode }>(`/boards/${boardId}`, updates); // Ensure api.put exists or use general update
    // If api.put doesn't exist in the helper yet, we might need to add it or use raw fetch.
    // Based on previous steps, I only added get and post. I should add put and delete to api-client.
    return response.data.board;
  },

  /**
   * Delete a board
   */
  deleteBoard: async (boardId: string, deleteContents: boolean = false): Promise<void> => {
    // Need api.delete
    await api.delete(`/boards/${boardId}?delete_contents=${deleteContents}`);
  },

  // ============================================
  // Principal Methods (World Model V5)
  // ============================================

  /**
   * List all principals in the account
   */
  listPrincipals: async (): Promise<Principal[]> => {
    const response = await api.get<{ principals: Principal[] }>('/principals');
    return response.data.principals;
  },

  /**
   * Get a specific principal by ID
   */
  getPrincipal: async (principalId: string): Promise<Principal> => {
    const response = await api.get<{ principal: Principal }>(`/principals/${principalId}`);
    return response.data.principal;
  },

  /**
   * Create a new principal (human, agent, or contact)
   */
  createPrincipal: async (input: CreatePrincipalInput): Promise<Principal> => {
    const response = await api.post<{ principal: Principal }>('/principals', input);
    return response.data.principal;
  },

  /**
   * Update principal capabilities
   */
  updatePrincipalCapabilities: async (
    principalId: string,
    capabilities: Partial<Principal['capabilities']>
  ): Promise<Principal> => {
    const response = await api.put<{ principal: Principal }>(
      `/principals/${principalId}/capabilities`,
      { capabilities }
    );
    return response.data.principal;
  },

  // ============================================
  // Workspace Methods (World Model V5)
  // ============================================

  /**
   * List all workspaces in the account
   */
  listWorkspaces: async (): Promise<Workspace[]> => {
    const response = await api.get<{ workspaces: Workspace[] }>('/workspaces');
    return response.data.workspaces;
  },

  /**
   * Get a specific workspace by ID
   */
  getWorkspace: async (workspaceId: string): Promise<Workspace> => {
    const response = await api.get<{ workspace: Workspace }>(`/workspaces/${workspaceId}`);
    return response.data.workspace;
  },

  /**
   * Create a new workspace from selected nodes
   */
  createWorkspace: async (input: CreateWorkspaceInput): Promise<Workspace> => {
    const response = await api.post<{ workspace: Workspace }>('/workspaces', input);
    return response.data.workspace;
  },

  /**
   * Update workspace (add/remove context pins or agents)
   */
  updateWorkspace: async (
    workspaceId: string,
    updates: Partial<Pick<Workspace, 'title' | 'context_pins' | 'attached_agents'>>
  ): Promise<Workspace> => {
    const response = await api.put<{ workspace: Workspace }>(`/workspaces/${workspaceId}`, updates);
    return response.data.workspace;
  },

  /**
   * Delete a workspace
   */
  deleteWorkspace: async (workspaceId: string): Promise<void> => {
    await api.delete(`/workspaces/${workspaceId}`);
  },

  // ============================================
  // Conversation Methods (World Model V5)
  // ============================================

  /**
   * List all conversations in the account
   */
  listConversations: async (): Promise<ConversationThread[]> => {
    const response = await api.get<{ conversations: ConversationThread[] }>('/conversations');
    return response.data.conversations;
  },

  /**
   * Get a specific conversation by ID
   */
  getConversation: async (conversationId: string): Promise<ConversationThread> => {
    const response = await api.get<{ conversation: ConversationThread }>(
      `/conversations/${conversationId}`
    );
    return response.data.conversation;
  },

  /**
   * Get context pack for a specific conversation
   */
  getConversationContextPack: async (conversationId: string): Promise<ConversationContextPack> => {
    const response = await api.get<{ context_pack: ConversationContextPack }>(
      `/conversations/${conversationId}/context-pack`
    );
    return response.data.context_pack;
  },

  /**
   * Create a new conversation thread
   */
  createConversation: async (input: CreateConversationInput): Promise<ConversationThread> => {
    const response = await api.post<{ conversation: ConversationThread }>('/conversations', input);
    return response.data.conversation;
  },

  /**
   * Update conversation context
   */
  updateConversationContext: async (
    conversationId: string,
    contextSpec: ConversationThread['context_spec']
  ): Promise<ConversationThread> => {
    const response = await api.put<{ conversation: ConversationThread }>(
      `/conversations/${conversationId}/context`,
      { context_spec: contextSpec }
    );
    return response.data.conversation;
  },

  /**
   * Get all messages for a conversation
   */
  getConversationMessages: async (conversationId: string): Promise<MessageNode[]> => {
    const response = await api.get<{ messages: MessageNode[] }>(
      `/conversations/${conversationId}/messages`
    );
    return response.data.messages;
  },

  /**
   * Post a message and trigger synthesis
   */
  postConversationMessage: async (
    conversationId: string,
    content: string,
    runSynthesis: boolean = true,
    skill?: string,
    provider?: string
  ): Promise<{
    userMessage: MessageNode;
    assistantMessage?: MessageNode;
    synthesisError?: string;
    agentRunDetails?: {
      agent_run_id?: string;
      provider: string;
      model?: string;
      skill_used: string;
      duration_ms: number;
      status?: string;
    };
  }> => {
    const response = await api.post<{
      userMessage: MessageNode;
      assistantMessage?: MessageNode;
      synthesisError?: string;
      agentRunDetails?: {
        agent_run_id?: string;
        provider: string;
        model?: string;
        skill_used: string;
        duration_ms: number;
        status?: string;
      };
    }>(`/conversations/${conversationId}/messages`, {
      content,
      run_synthesis: runSynthesis,
      skill,
      provider,
    });
    return response.data;
  },
};
