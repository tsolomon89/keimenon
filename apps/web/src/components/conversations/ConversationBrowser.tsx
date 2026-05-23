'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  CSSProperties,
  memo,
} from 'react';
import { List } from 'react-window';
import { useContainerHeight } from '@/hooks/useContainerHeight';
import {
  MessageSquare,
  Plus,
  Bot,
  User,
  Search,
  Pencil,
  FileText,
  Beaker,
  RefreshCw,
  CheckCircle,
  HelpCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import {
  organizationService,
  ConversationThread,
  CreateConversationInput,
  Principal,
} from '@/services/organization-service';
import { ConversationContextSpec, ConversationContextSummary } from '@/lib/conversation-context';
import { useKeimenonStore } from '@/store/keimenonStore';
import { getNodeLabel, type LabelableNode } from '@/lib/node-labels';
import { Folder } from 'lucide-react';

interface ConversationBrowserProps {
  onConversationSelect?: (conversation: ConversationThread) => void;
  onCreateConversation?: () => void;
  className?: string;
  initialContextSpec?: ConversationContextSpec;
  initialContextSummary?: Omit<ConversationContextSummary, 'contextSpec'>;
  onInitialContextConsumed?: () => void;
}

// Row height for virtualized conversation list
const CONVERSATION_ROW_HEIGHT = 100;

// Props for virtualized conversation row
interface ConversationRowProps {
  conversations: ConversationThread[];
  principals: Map<string, Principal>;
  selectedConversationId: string | null;
  handleConversationClick: (conversation: ConversationThread) => void;
}

// Virtualized conversation row component
function ConversationRow({
  index,
  style,
  conversations,
  principals,
  selectedConversationId,
  handleConversationClick,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
} & ConversationRowProps): React.ReactElement | null {
  const conversation = conversations[index];

  return (
    <div style={style} className="px-2 py-0.5">
      <ConversationCard
        conversation={conversation}
        humanPrincipal={principals.get(conversation.human_principal_id)}
        agentPrincipal={
          conversation.agent_principal_id
            ? principals.get(conversation.agent_principal_id)
            : undefined
        }
        selected={conversation.id === selectedConversationId}
        onClick={() => handleConversationClick(conversation)}
      />
    </div>
  );
}

export function ConversationBrowser({
  onConversationSelect,
  onCreateConversation,
  className = '',
  initialContextSpec,
  initialContextSummary,
  onInitialContextConsumed,
}: ConversationBrowserProps) {
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [principals, setPrincipals] = useState<Map<string, Principal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Track context spec in state so we can pass it to the modal
  // even after clearing it from the parent
  const [modalContextSpec, setModalContextSpec] =
    useState<ConversationBrowserProps['initialContextSpec']>(undefined);
  const [modalContextSummary, setModalContextSummary] =
    useState<ConversationBrowserProps['initialContextSummary']>(undefined);

  // Auto-open modal if initial context is provided
  useEffect(() => {
    if (initialContextSpec) {
      setModalContextSpec(initialContextSpec);
      setModalContextSummary(initialContextSummary);
      setShowCreateModal(true);
      onInitialContextConsumed?.();
    }
  }, [initialContextSpec, initialContextSummary, onInitialContextConsumed]);

  // Virtualization refs
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listHeight = useContainerHeight(listContainerRef, 300);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load conversations and principals in parallel
      const [conversationsData, principalsData] = await Promise.all([
        organizationService.listConversations(),
        organizationService.listPrincipals(),
      ]);

      setConversations(conversationsData);

      // Build a lookup map for principals
      const principalMap = new Map<string, Principal>();
      principalsData.forEach((p) => principalMap.set(p.id, p));
      setPrincipals(principalMap);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleConversationClick = useCallback(
    (conversation: ConversationThread) => {
      setSelectedConversationId(conversation.id);
      onConversationSelect?.(conversation);
    },
    [onConversationSelect]
  );

  const handleCreateClick = () => {
    if (onCreateConversation) {
      onCreateConversation();
    } else {
      setModalContextSpec(undefined);
      setModalContextSummary(undefined);
      setShowCreateModal(true);
    }
  };

  // Filter conversations by search query
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Memoized row props for virtualized list
  const conversationRowProps = useMemo(
    (): ConversationRowProps => ({
      conversations: filteredConversations,
      principals,
      selectedConversationId,
      handleConversationClick,
    }),
    [filteredConversations, principals, selectedConversationId, handleConversationClick]
  );

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center text-red-400 text-sm">
          <p>{error}</p>
          <button
            onClick={loadData}
            className="mt-2 text-purple-400 hover:text-purple-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">Conversations</h3>
          <span className="text-xs text-slate-500">({conversations.length})</span>
        </div>
        <button
          onClick={handleCreateClick}
          className="p-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition-colors"
          title="Start New Conversation"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <MessageSquare className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-sm text-slate-400 mb-2">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </p>
            {!searchQuery && (
              <>
                <p className="text-xs text-slate-500 mb-4">
                  Start a conversation with an agent to analyze your sources
                </p>
                <button
                  onClick={handleCreateClick}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Start Conversation
                </button>
              </>
            )}
          </div>
        ) : (
          <div ref={listContainerRef} className="flex-1">
            <List<ConversationRowProps>
              style={{
                height: Math.min(
                  filteredConversations.length * CONVERSATION_ROW_HEIGHT,
                  listHeight
                ),
              }}
              rowCount={filteredConversations.length}
              rowHeight={CONVERSATION_ROW_HEIGHT}
              rowComponent={ConversationRow}
              rowProps={conversationRowProps}
            />
          </div>
        )}
      </div>

      {/* Create Conversation Modal */}
      {showCreateModal && (
        <CreateConversationModal
          principals={Array.from(principals.values())}
          contextSpec={modalContextSpec}
          contextSummary={modalContextSummary}
          onClose={() => {
            setShowCreateModal(false);
            setModalContextSpec(undefined);
            setModalContextSummary(undefined);
          }}
          onCreate={async (input) => {
            try {
              const newConversation = await organizationService.createConversation(input);
              setConversations((prev) => [newConversation, ...prev]);
              setShowCreateModal(false);
              setModalContextSpec(undefined);
              setModalContextSummary(undefined);
              setSelectedConversationId(newConversation.id);
              onConversationSelect?.(newConversation);
            } catch (err: any) {
              // Bug fix #16: Properly handle errors and show feedback
              console.error('Failed to create conversation:', err);
              // Show error to user (toast would be ideal but alert as fallback)
              alert(`Failed to create conversation: ${err?.message || 'Unknown error'}`);
              // Don't close modal on error - let user retry
            }
          }}
        />
      )}
    </div>
  );
}

// Purpose Icons & Colors
const purposeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  summarize: {
    icon: <FileText className="w-3.5 h-3.5" />,
    color: 'text-green-400 bg-green-500/10',
    label: 'Summarize',
  },
  cluster: {
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    color: 'text-amber-400 bg-amber-500/10',
    label: 'Cluster',
  },
  draft: {
    icon: <Pencil className="w-3.5 h-3.5" />,
    color: 'text-blue-400 bg-blue-500/10',
    label: 'Draft',
  },
  research: {
    icon: <Search className="w-3.5 h-3.5" />,
    color: 'text-purple-400 bg-purple-500/10',
    label: 'Research',
  },
  refactor: {
    icon: <Beaker className="w-3.5 h-3.5" />,
    color: 'text-orange-400 bg-orange-500/10',
    label: 'Refactor',
  },
  verify: {
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    color: 'text-emerald-400 bg-emerald-500/10',
    label: 'Verify',
  },
  general: {
    icon: <HelpCircle className="w-3.5 h-3.5" />,
    color: 'text-slate-400 bg-slate-500/10',
    label: 'General',
  },
};

// Conversation Card Component
interface ConversationCardProps {
  conversation: ConversationThread;
  humanPrincipal?: Principal;
  agentPrincipal?: Principal;
  selected?: boolean;
  onClick?: () => void;
}

// Bug fix #34: Memoize ConversationCard to prevent unnecessary re-renders in virtualized list
const ConversationCard = memo(function ConversationCard({
  conversation,
  humanPrincipal,
  agentPrincipal,
  selected,
  onClick,
}: ConversationCardProps) {
  const purpose = purposeConfig[conversation.purpose] || purposeConfig.general;

  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-lg border cursor-pointer transition-all
        ${
          selected
            ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10'
            : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
        }
      `}
    >
      {/* Title row */}
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-slate-200 line-clamp-1 flex-1">
          {conversation.title}
        </h4>
        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
      </div>

      {/* Participants row */}
      <div className="flex items-center gap-3 mb-2">
        {/* Human */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <User className="w-3.5 h-3.5 text-slate-500" />
          <span className="truncate max-w-[80px]">{humanPrincipal?.display_name || 'You'}</span>
        </div>

        {/* Agent */}
        {agentPrincipal && (
          <>
            <span className="text-slate-600">+</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Bot className="w-3.5 h-3.5 text-blue-400" />
              <span className="truncate max-w-[80px]">{agentPrincipal.display_name}</span>
            </div>
          </>
        )}
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between text-xs">
        {/* Purpose badge */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${purpose.color}`}>
          {purpose.icon}
          {purpose.label}
        </span>

        {/* Context info */}
        {conversation.context_spec && (
          <span className="text-slate-500">
            {conversation.context_spec.source_ids.length} sources
          </span>
        )}

        {/* Date */}
        <span className="text-slate-500">
          {new Date(conversation.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
});

// Create Conversation Modal
interface CreateConversationModalProps {
  principals: Principal[];
  contextSpec?: ConversationContextSpec;
  contextSummary?: Omit<ConversationContextSummary, 'contextSpec'>;
  onClose: () => void;
  onCreate: (input: CreateConversationInput) => Promise<void>;
}

function CreateConversationModal({
  principals,
  contextSpec,
  contextSummary,
  onClose,
  onCreate,
}: CreateConversationModalProps) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<ConversationThread['purpose']>('general');
  const [agentId, setAgentId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const agentPrincipals = principals.filter((p) => p.principal_kind === 'agent');

  const storeNodes = useKeimenonStore((state) => state.nodes);
  const selectedNodeIds = useKeimenonStore((state) => state.selectedNodeIds);

  const selectedNodes = useMemo(() => {
    return storeNodes.filter((n) => selectedNodeIds.has(n.id));
  }, [storeNodes, selectedNodeIds]);

  const { eligibleNodes, ineligibleNodes } = useMemo(() => {
    const eligible: typeof storeNodes = [];
    const ineligible: typeof storeNodes = [];

    for (const node of selectedNodes) {
      const nodeKind = node.kind || node.type;
      const isEligible = ['Source', 'SourceDoc', 'VerifiedSource', 'Group', 'Folder'].includes(
        nodeKind
      );
      if (isEligible) {
        eligible.push(node);
      } else {
        ineligible.push(node);
      }
    }
    return { eligibleNodes: eligible, ineligibleNodes: ineligible };
  }, [selectedNodes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (contextSpec && contextSpec.source_ids.length === 0 && contextSpec.group_ids.length === 0)
      return;

    setCreating(true);
    try {
      await onCreate({
        title: title.trim(),
        purpose,
        agent_principal_id: agentId || undefined,
        context_spec: contextSpec,
      });
    } finally {
      setCreating(false);
    }
  };

  const isSubmitDisabled =
    !title.trim() ||
    creating ||
    (contextSpec && contextSpec.source_ids.length === 0 && contextSpec.group_ids.length === 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] flex flex-col"
      >
        <h2 className="text-lg font-semibold text-slate-100 mb-4 shrink-0">
          Start New Conversation
        </h2>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 custom-scrollbar mb-6">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Research on topic X"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                autoFocus
              />
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Purpose
              </label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(purposeConfig).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPurpose(key as ConversationThread['purpose'])}
                    className={`
                      p-2 rounded-lg border text-center transition-all flex flex-col items-center justify-center
                      ${
                        purpose === key
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                      }
                    `}
                  >
                    <div className={`flex justify-center mb-1 ${config.color.split(' ')[0]}`}>
                      {config.icon}
                    </div>
                    <span className="text-[10px] text-slate-300 font-medium">{config.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Agent Selection */}
            <div>
              <label
                htmlFor="agent-select"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
              >
                Agent (optional)
              </label>
              <select
                id="agent-select"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">No agent (notes only)</option>
                {agentPrincipals.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.display_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Context Summary Warning */}
            {contextSpec && (
              <div className="p-4 bg-slate-800/50 border border-slate-800 rounded-xl">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Discussion Context Bounds
                </h4>
                <p className="text-xs text-slate-400 mb-3">
                  Discussing{' '}
                  {contextSummary
                    ? contextSummary.selectedNodeCount - contextSummary.unsupportedNodeCount
                    : eligibleNodes.length}{' '}
                  valid sources/groups.
                </p>

                {/* Eligible nodes list */}
                {contextSummary || eligibleNodes.length > 0 ? (
                  !contextSummary &&
                  eligibleNodes.length > 0 && (
                    <div className="space-y-2 mb-3 max-h-36 overflow-y-auto custom-scrollbar">
                      {eligibleNodes.map((node) => {
                        const nodeKind = node.kind || node.type;
                        const isGroup = ['Group', 'Folder'].includes(nodeKind);
                        const label = getNodeLabel(
                          {
                            id: node.id,
                            kind: node.kind || node.type,
                            label: node.data?.label,
                            ...(node.data?.metadata || {}),
                          } as LabelableNode,
                          30
                        );

                        return (
                          <div
                            key={node.id}
                            className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800"
                          >
                            {isGroup ? (
                              <Folder className="w-3.5 h-3.5 text-indigo-400" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span className="text-xs font-medium text-slate-200 truncate">
                              {label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono ml-auto truncate max-w-[80px]">
                              {node.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="text-xs text-rose-400 mb-3 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                    ⚠️ No valid sources or groups selected. Discussion context requires at least one
                    Source or Group.
                  </div>
                )}

                {/* Excluded nodes list */}
                {(contextSummary
                  ? contextSummary.unsupportedNodeCount > 0
                  : ineligibleNodes.length > 0) && (
                  <div className="pt-3 border-t border-slate-800">
                    <p className="text-[10px] text-amber-500 font-medium mb-2">
                      ⚠️{' '}
                      {contextSummary
                        ? contextSummary.unsupportedNodeCount
                        : ineligibleNodes.length}{' '}
                      node(s) omitted (unsupported kinds):
                    </p>
                    {!contextSummary && ineligibleNodes.length > 0 && (
                      <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                        {ineligibleNodes.map((node) => {
                          const label = getNodeLabel(
                            {
                              id: node.id,
                              kind: node.kind || node.type,
                              label: node.data?.label,
                              ...(node.data?.metadata || {}),
                            } as LabelableNode,
                            30
                          );
                          return (
                            <div
                              key={node.id}
                              className="flex justify-between items-center text-[11px] text-slate-500 bg-slate-900/20 px-2 py-1 rounded"
                            >
                              <span className="truncate max-w-[200px]">{label}</span>
                              <span className="font-mono text-[9px] uppercase">{node.type}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {contextSummary && (
                      <p className="text-[10px] text-slate-500">
                        Note: {contextSummary.unsupportedNodeCount} nodes were excluded from the
                        selection context.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 shrink-0 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 border disabled:border-slate-800 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Start Conversation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
