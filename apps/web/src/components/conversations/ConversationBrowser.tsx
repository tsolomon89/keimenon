'use client';

import { useState, useEffect } from 'react';
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

interface ConversationBrowserProps {
  onConversationSelect?: (conversation: ConversationThread) => void;
  onCreateConversation?: () => void;
  className?: string;
}

export function ConversationBrowser({
  onConversationSelect,
  onCreateConversation,
  className = '',
}: ConversationBrowserProps) {
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [principals, setPrincipals] = useState<Map<string, Principal>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleConversationClick = (conversation: ConversationThread) => {
    setSelectedConversationId(conversation.id);
    onConversationSelect?.(conversation);
  };

  const handleCreateClick = () => {
    if (onCreateConversation) {
      onCreateConversation();
    } else {
      setShowCreateModal(true);
    }
  };

  // Filter conversations by search query
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
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
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
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
            ))}
          </div>
        )}
      </div>

      {/* Create Conversation Modal */}
      {showCreateModal && (
        <CreateConversationModal
          principals={Array.from(principals.values())}
          onClose={() => setShowCreateModal(false)}
          onCreate={async (input) => {
            try {
              const newConversation = await organizationService.createConversation(input);
              setConversations((prev) => [newConversation, ...prev]);
              setShowCreateModal(false);
              setSelectedConversationId(newConversation.id);
              onConversationSelect?.(newConversation);
            } catch (err) {
              console.error('Failed to create conversation:', err);
            }
          }}
        />
      )}
    </div>
  );
}

// Purpose Icons & Colors
const purposeConfig: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
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

function ConversationCard({
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
        ${selected
          ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10'
          : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'}
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
          <span className="truncate max-w-[80px]">
            {humanPrincipal?.display_name || 'You'}
          </span>
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
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${purpose.color}`}
        >
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
}

// Create Conversation Modal
interface CreateConversationModalProps {
  principals: Principal[];
  onClose: () => void;
  onCreate: (input: CreateConversationInput) => Promise<void>;
}

function CreateConversationModal({
  principals,
  onClose,
  onCreate,
}: CreateConversationModalProps) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<ConversationThread['purpose']>('general');
  const [agentId, setAgentId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const agentPrincipals = principals.filter((p) => p.principal_kind === 'agent');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      await onCreate({
        title: title.trim(),
        purpose,
        agent_principal_id: agentId || undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Start New Conversation</h2>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Research on topic X"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Purpose */}
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-2">Purpose</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(purposeConfig).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPurpose(key as ConversationThread['purpose'])}
                  className={`
                    p-2 rounded border text-center transition-all
                    ${purpose === key
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}
                  `}
                >
                  <div className={`flex justify-center mb-1 ${config.color.split(' ')[0]}`}>
                    {config.icon}
                  </div>
                  <span className="text-xs text-slate-300">{config.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Agent Selection */}
          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-2">Agent (optional)</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No agent (notes only)</option>
              {agentPrincipals.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors flex items-center gap-2"
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
