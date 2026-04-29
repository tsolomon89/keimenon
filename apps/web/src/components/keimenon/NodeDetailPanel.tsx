'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  X,
  Copy,
  Check,
  Shield,
  Loader2,
  User,
  Bot,
  Globe,
  FileText,
  Upload,
  MessageSquare,
  Cpu,
  Database,
  Tag,
  Hash,
  Sparkles,
  Link2,
  CheckCircle,
  AlertTriangle,
  Users,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  Pencil,
} from 'lucide-react';
import { useContentLoader, ContentType } from '@/hooks/useContentLoader';
import {
  MessageContent,
  SourceContent,
  CodeContent,
  LexemeContent,
  PhraseContent,
  TopicContent,
  UnifiedDocContent,
  VerifiedSourceContent,
  VerifiedClaimContent,
  promoteTopic,
  rejectTopic,
  renameTopic,
} from '@/lib/api-client';
import { useKeimenonStore } from '@/store/keimenonStore';
import { getNodeLabel, LabelableNode } from '@/lib/node-labels';
import {
  createAgentTask,
  waitForAgentTask,
  type AgentTaskStatus,
} from '@/services/agent-task-service';

// Provenance types
interface Provenance {
  origin_principal_id?: string;
  origin_type?:
    | 'user_upload'
    | 'chat_import'
    | 'agent_import'
    | 'agent_generated'
    | 'system_seed'
    | 'migrated';
  origin_ref?: string;
  trust_state?: 'ugc' | 'external_claim' | 'verified_source';
  original_url?: string;
  retrieved_at?: number;
  // Legacy fields
  origin?: string;
  attested?: boolean;
}

interface VerifyTopicTaskOutput {
  sourceCount: number;
  claimCount: number;
  credibilityScore: number;
}

function readVerifyTopicOutput(value: unknown): VerifyTopicTaskOutput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    sourceCount?: unknown;
    claimCount?: unknown;
    credibilityScore?: unknown;
  };
  if (
    typeof candidate.sourceCount !== 'number' ||
    typeof candidate.claimCount !== 'number' ||
    typeof candidate.credibilityScore !== 'number'
  ) {
    return null;
  }

  return {
    sourceCount: candidate.sourceCount,
    claimCount: candidate.claimCount,
    credibilityScore: candidate.credibilityScore,
  };
}

/**
 * NodeDetailPanel - Modal overlay for viewing node details
 *
 * Features:
 * - Dark theme with slate colors
 * - Slide-in animation from right
 * - Backdrop overlay
 * - Auto-loads content from local storage
 * - Click outside to close
 * - Escape key to close
 */
export function NodeDetailPanel() {
  const detailPanelNode = useKeimenonStore((s) => s.detailPanelNode);
  const closeDetailPanel = useKeimenonStore((s) => s.closeDetailPanel);
  const { loadContent, getContent, isLoading, getError } = useContentLoader();
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<AgentTaskStatus | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    taskId: string;
    sourceCount: number;
    claimCount: number;
    credibilityScore: number;
  } | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [topicLifecycleAction, setTopicLifecycleAction] = useState<
    'promoting' | 'rejecting' | 'renaming' | null
  >(null);
  const [topicStatus, setTopicStatus] = useState<string | null>(null);
  const [isEditingTopicName, setIsEditingTopicName] = useState(false);
  const [editedTopicName, setEditedTopicName] = useState('');
  const [topicLifecycleError, setTopicLifecycleError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle topic verification
  const handleVerifyTopic = useCallback(async () => {
    if (!detailPanelNode || detailPanelNode.type !== 'Topic') return;

    setIsVerifying(true);
    setVerificationError(null);
    setVerificationResult(null);
    setVerificationStatus(null);

    try {
      const task = await createAgentTask({
        type: 'VERIFY_TOPIC',
        input: {
          topicId: detailPanelNode.id,
          topicName:
            detailPanelNode.data?.label || detailPanelNode.data?.metadata?.name || 'Unknown Topic',
          description: detailPanelNode.data?.metadata?.description,
          keywords: detailPanelNode.data?.metadata?.keywords || [],
        },
      });
      setVerificationStatus(task.status);

      const details = await waitForAgentTask(task.id, {
        timeoutMs: 180000,
        pollIntervalMs: 1200,
        onUpdate: (update) => setVerificationStatus(update.task.status),
      });

      if (details.task.status !== 'completed') {
        throw new Error(details.task.error || `Verification ${details.task.status}`);
      }

      const latestRun = details.runs
        .slice()
        .sort((a, b) => a.attempt - b.attempt)
        .at(-1);
      const output = latestRun ? readVerifyTopicOutput(latestRun.output) : null;
      if (!output) {
        throw new Error('Verification output missing from completed task');
      }

      setVerificationResult({
        taskId: task.id,
        sourceCount: output.sourceCount,
        claimCount: output.claimCount,
        credibilityScore: output.credibilityScore,
      });
    } catch (error: any) {
      setVerificationError(error.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  }, [detailPanelNode]);

  // Handle topic promote
  const handlePromoteTopic = useCallback(async () => {
    if (!detailPanelNode || detailPanelNode.type !== 'Topic') return;
    setTopicLifecycleAction('promoting');
    setTopicLifecycleError(null);
    try {
      await promoteTopic(detailPanelNode.id);
      setTopicStatus('promoted');
    } catch (err: any) {
      setTopicLifecycleError(err?.message || 'Promotion failed');
    } finally {
      setTopicLifecycleAction(null);
    }
  }, [detailPanelNode]);

  // Handle topic reject
  const handleRejectTopic = useCallback(async () => {
    if (!detailPanelNode || detailPanelNode.type !== 'Topic') return;
    setTopicLifecycleAction('rejecting');
    setTopicLifecycleError(null);
    try {
      await rejectTopic(detailPanelNode.id);
      setTopicStatus('rejected');
    } catch (err: any) {
      setTopicLifecycleError(err?.message || 'Rejection failed');
    } finally {
      setTopicLifecycleAction(null);
    }
  }, [detailPanelNode]);

  // Handle topic rename
  const handleRenameTopic = useCallback(async () => {
    if (!detailPanelNode || detailPanelNode.type !== 'Topic' || !editedTopicName.trim()) return;
    setTopicLifecycleAction('renaming');
    setTopicLifecycleError(null);
    try {
      await renameTopic(detailPanelNode.id, { name: editedTopicName.trim() });
      setIsEditingTopicName(false);
    } catch (err: any) {
      setTopicLifecycleError(err?.message || 'Rename failed');
    } finally {
      setTopicLifecycleAction(null);
    }
  }, [detailPanelNode, editedTopicName]);

  // Auto-load content when panel opens
  // Bug fix #15: Reset autoLoaded when node changes to ensure new node content loads
  const prevNodeId = useRef<string | null>(null);

  useEffect(() => {
    // Reset autoLoaded when node changes (fix for bug #15)
    if (detailPanelNode?.id !== prevNodeId.current) {
      setAutoLoaded(false);
      prevNodeId.current = detailPanelNode?.id ?? null;
      // Reset topic lifecycle state for new node
      setTopicStatus(
        detailPanelNode?.data?.metadata?.topic_status ||
          (detailPanelNode?.data as any)?.topic_status ||
          null
      );
      setTopicLifecycleError(null);
      setIsEditingTopicName(false);
    }

    if (detailPanelNode && !autoLoaded) {
      const contentType = getContentType(detailPanelNode.type);
      if (contentType) {
        loadContent(detailPanelNode.id, contentType);
        setAutoLoaded(true);
      }
    }

    // Reset when panel closes
    if (!detailPanelNode) {
      setAutoLoaded(false);
    }
  }, [detailPanelNode, autoLoaded, loadContent]);

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        closeDetailPanel();
      }
    }

    if (detailPanelNode) {
      // Add slight delay to prevent immediate close on open
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }

    return undefined;
  }, [detailPanelNode, closeDetailPanel]);

  // Handle escape key to close
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDetailPanel();
      }
    }

    if (detailPanelNode) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }

    return undefined;
  }, [detailPanelNode, closeDetailPanel]);

  if (!detailPanelNode) {
    return null;
  }

  const content = getContent(detailPanelNode.id);
  const loading = isLoading(detailPanelNode.id);
  const error = getError(detailPanelNode.id);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-[28rem] bg-slate-900 border-l border-slate-700 shadow-2xl overflow-y-auto z-50 transform transition-all duration-300 ease-in-out"
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-4 flex items-center justify-between z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">
              {getNodeTitle(detailPanelNode)}
            </h2>
            <p className="text-sm text-slate-400">{detailPanelNode.type}</p>
          </div>
          <button
            onClick={closeDetailPanel}
            className="ml-3 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata */}
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Metadata</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between items-start">
              <dt className="text-slate-400">ID:</dt>
              <dd className="text-slate-200 font-mono text-xs">
                {detailPanelNode.id.substring(0, 16)}...
              </dd>
            </div>
            {detailPanelNode.data.metadata?.timestamp && (
              <div className="flex justify-between items-start">
                <dt className="text-slate-400">Time:</dt>
                <dd className="text-slate-200 text-xs">
                  {new Date(detailPanelNode.data.metadata.timestamp).toLocaleString()}
                </dd>
              </div>
            )}
            {detailPanelNode.data.metadata?.char_count && (
              <div className="flex justify-between items-start">
                <dt className="text-slate-400">Size:</dt>
                <dd className="text-slate-200">
                  {detailPanelNode.data.metadata.char_count.toLocaleString()} chars
                </dd>
              </div>
            )}
            {content && (
              <div className="flex justify-between items-start">
                <dt className="text-slate-400">Source:</dt>
                <dd>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      content.source === 'local'
                        ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                        : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    }`}
                  >
                    {content.source === 'local' ? '📁 Local' : '??? Database'}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Provenance - World Model V5: WHO/HOW/FROM/VERIFIED */}
        {detailPanelNode.data?.metadata?.provenance && (
          <ProvenanceSection provenance={detailPanelNode.data.metadata.provenance} />
        )}

        {/* World Model V5: Principal node details */}
        {detailPanelNode.type === 'Principal' && (
          <PrincipalDetailsSection metadata={detailPanelNode.data?.metadata || {}} />
        )}

        {/* World Model V5: ConversationThread node details */}
        {detailPanelNode.type === 'ConversationThread' && (
          <ConversationThreadDetailsSection metadata={detailPanelNode.data?.metadata || {}} />
        )}

        {/* Actions - Topic lifecycle + Verify */}
        {detailPanelNode.type === 'Topic' && (
          <div className="p-4 border-b border-slate-700 bg-slate-800/30">
            {/* Topic status badge */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-300">Actions</h3>
              {(topicStatus || detailPanelNode.data?.metadata?.topic_status) && (
                <TopicStatusBadge
                  status={
                    topicStatus || detailPanelNode.data?.metadata?.topic_status || 'suggested'
                  }
                />
              )}
            </div>

            {/* Lifecycle error */}
            {topicLifecycleError && (
              <div className="mb-3 p-2 bg-red-600/10 border border-red-500/30 rounded-lg">
                <p className="text-xs text-red-300">{topicLifecycleError}</p>
              </div>
            )}

            {/* Rename inline editor */}
            {isEditingTopicName ? (
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={editedTopicName}
                  onChange={(e) => setEditedTopicName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameTopic();
                    if (e.key === 'Escape') setIsEditingTopicName(false);
                  }}
                  className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  placeholder="New topic name"
                  autoFocus
                />
                <button
                  onClick={handleRenameTopic}
                  disabled={topicLifecycleAction === 'renaming' || !editedTopicName.trim()}
                  className="px-2 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded text-xs"
                >
                  {topicLifecycleAction === 'renaming' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  onClick={() => setIsEditingTopicName(false)}
                  className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {/* Promote / Reject / Rename buttons */}
            {topicStatus !== 'promoted' && topicStatus !== 'rejected' && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={handlePromoteTopic}
                  disabled={!!topicLifecycleAction}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
                >
                  {topicLifecycleAction === 'promoting' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ThumbsUp className="w-3.5 h-3.5" />
                  )}
                  Promote
                </button>
                <button
                  onClick={handleRejectTopic}
                  disabled={!!topicLifecycleAction}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600/80 hover:bg-red-500 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
                >
                  {topicLifecycleAction === 'rejecting' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ThumbsDown className="w-3.5 h-3.5" />
                  )}
                  Reject
                </button>
                <button
                  onClick={() => {
                    setEditedTopicName(
                      detailPanelNode.data?.label || detailPanelNode.data?.metadata?.name || ''
                    );
                    setIsEditingTopicName(true);
                  }}
                  disabled={!!topicLifecycleAction}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-200 rounded-lg transition-colors text-sm"
                  title="Rename topic"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Verify topic button */}
            <button
              onClick={handleVerifyTopic}
              disabled={isVerifying}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Verify Topic
                </>
              )}
            </button>

            {verificationStatus && isVerifying && (
              <div className="mt-3 p-3 bg-slate-700/30 border border-slate-600 rounded-lg">
                <p className="text-xs text-slate-300">
                  Verification task status:{' '}
                  <span className="font-medium">{verificationStatus}</span>
                </p>
              </div>
            )}

            {verificationError && (
              <div className="mt-3 p-3 bg-red-600/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-300">{verificationError}</p>
              </div>
            )}

            {verificationResult && (
              <div className="mt-3 p-3 bg-emerald-600/10 border border-emerald-500/30 rounded-lg">
                <p className="text-sm text-emerald-300 font-medium mb-2">Verification Complete</p>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Sources found:</dt>
                    <dd className="text-emerald-300">{verificationResult.sourceCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Claims extracted:</dt>
                    <dd className="text-emerald-300">{verificationResult.claimCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Credibility score:</dt>
                    <dd className="text-emerald-300">
                      {Math.round(verificationResult.credibilityScore * 100)}%
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Task ID:</dt>
                    <dd className="text-slate-300 font-mono">
                      {verificationResult.taskId.slice(0, 12)}...
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {loading && <LoadingSpinner />}

          {error && (
            <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300">
                <strong className="font-semibold">Error loading content:</strong> {error}
              </p>
            </div>
          )}

          {!loading && !error && content && (
            <ContentDisplay content={content} nodeType={detailPanelNode.type} />
          )}

          {!loading && !error && !content && (
            <div className="text-center text-slate-500 py-8">
              <p>No content available</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function getContentType(type: string): ContentType | null {
  switch (type) {
    case 'message':
      return 'message';
    case 'source':
      return 'source';
    case 'code':
      return 'code';
    case 'conversation':
      return 'conversation';
    // V2 Node Types
    case 'Lexeme':
      return 'lexeme';
    case 'Phrase':
      return 'phrase';
    case 'Topic':
      return 'topic';
    case 'UnifiedDoc':
      return 'unified-doc';
    case 'VerifiedSource':
      return 'verified-source';
    case 'VerifiedClaim':
      return 'verified-claim';
    // World Model V5: Principal and ConversationThread
    // These don't have separate content files - all data is in node metadata
    case 'Principal':
    case 'ConversationThread':
      return null; // Metadata is displayed directly from node
    default:
      return null;
  }
}

function getNodeTitle(node: any): string {
  // Bridge KeimenonNode shape to LabelableNode for shared utility
  const labelable: LabelableNode = {
    id: node.id,
    kind: node.type,
    label: node.data?.label,
    title: node.data?.metadata?.title,
    name: node.data?.metadata?.name,
    role: node.data?.metadata?.role,
    language: node.data?.metadata?.language,
    text: node.data?.metadata?.text,
    lemma: node.data?.metadata?.lemma,
    claim_text: node.data?.metadata?.claim_text,
    normalized_text: node.data?.metadata?.normalized_text,
    // World Model V5: Principal fields
    display_name: node.data?.metadata?.display_name,
    principal_kind: node.data?.metadata?.principal_kind,
    email: node.data?.metadata?.email,
    platform:
      node.data?.metadata?.platform ||
      node.data?.metadata?.contact_info?.source_platform ||
      undefined,
    purpose: node.data?.metadata?.purpose,
  };
  return getNodeLabel(labelable, 50); // Allow longer labels in detail panel
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin"></div>
      <span className="ml-3 text-slate-400">Loading content...</span>
    </div>
  );
}

interface ContentDisplayProps {
  content: MessageContent | SourceContent | CodeContent | any;
  nodeType: string;
}

function ContentDisplay({ content, nodeType }: ContentDisplayProps) {
  switch (nodeType) {
    case 'message':
      return <MessageContentDisplay content={content as MessageContent} />;
    case 'source':
      return <SourceContentDisplay content={content as SourceContent} />;
    case 'code':
      return <CodeContentDisplay content={content as CodeContent} />;
    // V2 Node Types
    case 'Lexeme':
      return <LexemeContentDisplay content={content as LexemeContent} />;
    case 'Phrase':
      return <PhraseContentDisplay content={content as PhraseContent} />;
    case 'Topic':
      return <TopicContentDisplay content={content as TopicContent} />;
    case 'UnifiedDoc':
      return <UnifiedDocContentDisplay content={content as UnifiedDocContent} />;
    case 'VerifiedSource':
      return <VerifiedSourceContentDisplay content={content as VerifiedSourceContent} />;
    case 'VerifiedClaim':
      return <VerifiedClaimContentDisplay content={content as VerifiedClaimContent} />;
    // World Model V5: Principal and ConversationThread don't have separate content
    // Their data is displayed via dedicated sections
    default:
      return <GenericContentDisplay content={content} />;
  }
}

function MessageContentDisplay({ content }: { content: MessageContent }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            content.role === 'user'
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
              : 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
          }`}
        >
          {content.role}
        </span>
        <span className="text-xs text-slate-500">
          {new Date(content.timestamp).toLocaleString()}
        </span>
      </div>

      <div className="prose prose-sm prose-invert max-w-none">
        <div className="whitespace-pre-wrap text-slate-200 bg-slate-800 p-3 rounded-lg border border-slate-700">
          {content.content}
        </div>
      </div>
    </div>
  );
}

function SourceContentDisplay({ content }: { content: SourceContent }) {
  return (
    <div>
      <h3 className="text-md font-semibold text-white mb-3">{content.title}</h3>

      <div className="mb-3 text-sm text-slate-400">
        <span>{(content.size_bytes / 1024).toFixed(1)} KB</span>
        <span className="mx-2">•</span>
        <span>{content.mime_type}</span>
      </div>

      <div className="prose prose-sm prose-invert max-w-none">
        <div
          className="whitespace-pre-wrap text-slate-200 bg-slate-800 p-3 rounded-lg border border-slate-700"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(content.content) }}
        />
      </div>
    </div>
  );
}

function CodeContentDisplay({ content }: { content: CodeContent }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-700 text-slate-200 border border-slate-600">
          {content.language}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1.5 px-2 py-1 hover:bg-slate-800 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {content.line_count && (
        <div className="text-xs text-slate-500 mb-2">
          {content.line_count} lines • {content.char_count?.toLocaleString()} chars
        </div>
      )}

      <pre className="bg-slate-950 text-slate-100 p-4 rounded-lg border border-slate-800 overflow-x-auto text-sm">
        <code>{content.code}</code>
      </pre>
    </div>
  );
}

// ============================================================================
// V2 Node Content Display Components
// ============================================================================

function LexemeContentDisplay({ content }: { content: LexemeContent }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-700 text-slate-200 border border-slate-600 flex items-center gap-1">
          <Hash className="w-3 h-3" />
          Lexeme
        </span>
        {content.pos && (
          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30">
            {content.pos}
          </span>
        )}
        <span className="text-xs text-slate-500">
          {content.frequency.toLocaleString()} occurrences
        </span>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
        <p className="text-slate-400 text-xs mb-1">Normalized Form</p>
        <p className="text-xl font-semibold text-white">{content.lemma}</p>
      </div>
    </div>
  );
}

function PhraseContentDisplay({ content }: { content: PhraseContent }) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'entity':
        return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
      case 'concept':
        return 'bg-purple-600/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-slate-600/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-orange-600/20 text-orange-300 border border-orange-500/30 flex items-center gap-1">
          <Tag className="w-3 h-3" />
          Phrase
        </span>
        <span
          className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(content.type)}`}
        >
          {content.type}
        </span>
        {content.entity_type && (
          <span className="px-2 py-1 rounded text-xs font-medium bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
            {content.entity_type}
          </span>
        )}
        <span className="text-xs text-slate-500">
          {content.frequency.toLocaleString()} occurrences
        </span>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-3">
        <div>
          <p className="text-slate-400 text-xs mb-1">Original Text</p>
          <p className="text-lg font-medium text-white">{content.text}</p>
        </div>
        {content.normalized_text && content.normalized_text !== content.text && (
          <div>
            <p className="text-slate-400 text-xs mb-1">Normalized</p>
            <p className="text-slate-300">{content.normalized_text}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TopicContentDisplay({ content }: { content: TopicContent }) {
  const strengthPercent = Math.round(content.strength * 100);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-red-600/20 text-red-300 border border-red-500/30 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Topic
        </span>
        <span className="text-xs text-slate-500">Coherence: {strengthPercent}%</span>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-4">
        <div>
          <p className="text-slate-400 text-xs mb-1">Topic Name</p>
          <p className="text-xl font-semibold text-white">{content.name}</p>
        </div>

        {content.description && (
          <div>
            <p className="text-slate-400 text-xs mb-1">Description</p>
            <p className="text-slate-300">{content.description}</p>
          </div>
        )}

        {content.keywords && content.keywords.length > 0 && (
          <div>
            <p className="text-slate-400 text-xs mb-2">Keywords</p>
            <div className="flex flex-wrap gap-2">
              {content.keywords.map((keyword, index) => (
                <span key={index} className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Strength meter */}
        <div>
          <p className="text-slate-400 text-xs mb-2">Coherence Strength</p>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300"
              style={{ width: `${strengthPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function UnifiedDocContentDisplay({ content }: { content: UnifiedDocContent }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-teal-600/20 text-teal-300 border border-teal-500/30 flex items-center gap-1">
          <FileText className="w-3 h-3" />
          Unified Document
        </span>
        <span className="text-xs text-slate-500">
          {content.token_count.toLocaleString()} tokens
        </span>
      </div>

      <h3 className="text-md font-semibold text-white mb-3">{content.title}</h3>
      <div className="prose prose-sm prose-invert max-w-none">
        <div
          className="whitespace-pre-wrap text-slate-200 bg-slate-800 p-3 rounded-lg border border-slate-700"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(content.content_markdown) }}
        />
      </div>

      {content.citations.length > 0 && (
        <div className="mt-4">
          <p className="text-slate-400 text-xs mb-2">Citations</p>
          <div className="space-y-1">
            {content.citations.slice(0, 12).map((citation, index) => (
              <div
                key={`${citation.node_id}-${index}`}
                className="text-xs text-slate-300 font-mono"
              >
                {citation.node_id}
                {citation.span ? ` ${citation.span}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VerifiedSourceContentDisplay({ content }: { content: VerifiedSourceContent }) {
  const trustPercent = Math.round(content.trust_score * 100);

  const getTrustColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-400';
    if (score >= 0.5) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Verified Source
        </span>
        <span className={`text-xs font-medium ${getTrustColor(content.trust_score)}`}>
          Trust: {trustPercent}%
        </span>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-3">
        <div>
          <p className="text-slate-400 text-xs mb-1">Title</p>
          <p className="text-lg font-medium text-white">{content.title}</p>
        </div>

        <div>
          <p className="text-slate-400 text-xs mb-1">URL</p>
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1 break-all"
          >
            <Link2 className="w-3 h-3 flex-shrink-0" />
            {content.url}
          </a>
        </div>

        <div className="flex gap-4 text-sm">
          {content.publisher && (
            <div>
              <p className="text-slate-400 text-xs">Publisher</p>
              <p className="text-slate-200">{content.publisher}</p>
            </div>
          )}
          {content.author && (
            <div>
              <p className="text-slate-400 text-xs">Author</p>
              <p className="text-slate-200">{content.author}</p>
            </div>
          )}
        </div>

        {content.published_at && (
          <div>
            <p className="text-slate-400 text-xs">Published</p>
            <p className="text-slate-200 text-sm">
              {new Date(content.published_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Trust score meter */}
        <div>
          <p className="text-slate-400 text-xs mb-2">Trust Score</p>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                content.trust_score >= 0.8
                  ? 'bg-emerald-500'
                  : content.trust_score >= 0.5
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${trustPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function VerifiedClaimContentDisplay({ content }: { content: VerifiedClaimContent }) {
  const confidencePercent = Math.round(content.confidence * 100);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return {
          color: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
          icon: CheckCircle,
        };
      case 'disputed':
        return { color: 'bg-amber-600/20 text-amber-300 border-amber-500/30', icon: AlertTriangle };
      case 'refuted':
        return { color: 'bg-red-600/20 text-red-300 border-red-500/30', icon: X };
      default:
        return { color: 'bg-slate-600/20 text-slate-300 border-slate-500/30', icon: FileText };
    }
  };

  const statusBadge = getStatusBadge(content.status);
  const StatusIcon = statusBadge.icon;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
          <FileText className="w-3 h-3" />
          Verified Claim
        </span>
        <span
          className={`px-2 py-1 rounded text-xs font-medium border flex items-center gap-1 ${statusBadge.color}`}
        >
          <StatusIcon className="w-3 h-3" />
          {content.status}
        </span>
      </div>

      <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 space-y-4">
        <div>
          <p className="text-slate-400 text-xs mb-1">Claim</p>
          <p className="text-white">{content.claim_text}</p>
        </div>

        {content.evidence_excerpt && (
          <div>
            <p className="text-slate-400 text-xs mb-1">Evidence</p>
            <blockquote className="border-l-2 border-purple-500 pl-3 text-slate-300 italic text-sm">
              {content.evidence_excerpt}
            </blockquote>
          </div>
        )}

        <div>
          <p className="text-slate-400 text-xs mb-1">Source Reference</p>
          <p className="text-slate-300 font-mono text-xs">{content.source_id}</p>
        </div>

        {/* Confidence meter */}
        <div>
          <p className="text-slate-400 text-xs mb-2">Confidence: {confidencePercent}%</p>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericContentDisplay({ content }: { content: any }) {
  return (
    <pre className="bg-slate-800 p-3 rounded-lg border border-slate-700 text-xs overflow-x-auto text-slate-300">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

// Provenance display component - World Model V5
function ProvenanceSection({ provenance }: { provenance: Provenance }) {
  const originType = provenance.origin_type || (provenance.origin ? 'migrated' : undefined);
  const trustState = provenance.trust_state || (provenance.attested ? 'verified_source' : 'ugc');

  // Get display info for origin type
  const getOriginTypeInfo = (type: string | undefined) => {
    switch (type) {
      case 'user_upload':
        return {
          label: 'File Upload',
          icon: Upload,
          color: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
        };
      case 'chat_import':
        return {
          label: 'Chat Import',
          icon: MessageSquare,
          color: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
        };
      case 'agent_import':
        return {
          label: 'Agent Import',
          icon: Globe,
          color: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
        };
      case 'agent_generated':
        return {
          label: 'AI Generated',
          icon: Cpu,
          color: 'bg-pink-600/20 text-pink-300 border-pink-500/30',
        };
      case 'system_seed':
        return {
          label: 'System',
          icon: Database,
          color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
        };
      case 'migrated':
        return {
          label: 'Migrated',
          icon: FileText,
          color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
        };
      default:
        return {
          label: 'Unknown',
          icon: FileText,
          color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
        };
    }
  };

  // Get display info for trust state
  const getTrustStateInfo = (state: string | undefined) => {
    switch (state) {
      case 'ugc':
        return {
          label: 'User Generated',
          color: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
          icon: User,
        };
      case 'external_claim':
        return {
          label: 'Unverified',
          color: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
          icon: Globe,
        };
      case 'verified_source':
        return {
          label: 'Verified',
          color: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
          icon: Shield,
        };
      default:
        return {
          label: 'Unknown',
          color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
          icon: FileText,
        };
    }
  };

  const originTypeInfo = getOriginTypeInfo(originType);
  const trustStateInfo = getTrustStateInfo(trustState);
  const OriginIcon = originTypeInfo.icon;
  const TrustIcon = trustStateInfo.icon;

  return (
    <div className="p-4 border-b border-slate-700 bg-slate-800/30">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
        <Shield className="w-4 h-4 text-emerald-400" />
        Provenance
      </h3>
      <dl className="space-y-2 text-sm">
        {/* WHO: Origin Principal */}
        {provenance.origin_principal_id && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Introduced by:
            </dt>
            <dd className="text-slate-200 font-mono text-xs">
              {provenance.origin_principal_id.substring(0, 12)}...
            </dd>
          </div>
        )}

        {/* HOW: Origin Type */}
        <div className="flex justify-between items-center">
          <dt className="text-slate-400 flex items-center gap-1.5">
            <OriginIcon className="w-3.5 h-3.5" />
            Method:
          </dt>
          <dd>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${originTypeInfo.color}`}
            >
              {originTypeInfo.label}
            </span>
          </dd>
        </div>

        {/* FROM: Origin Reference */}
        {(provenance.origin_ref || provenance.original_url) && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Reference:
            </dt>
            <dd
              className="text-slate-200 font-mono text-xs truncate max-w-[180px]"
              title={provenance.origin_ref || provenance.original_url}
            >
              {provenance.original_url ? (
                <a
                  href={provenance.original_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  {new URL(provenance.original_url).hostname}
                </a>
              ) : (
                (provenance.origin_ref || '').substring(0, 20) +
                ((provenance.origin_ref?.length || 0) > 20 ? '...' : '')
              )}
            </dd>
          </div>
        )}

        {/* VERIFIED: Trust State */}
        <div className="flex justify-between items-center">
          <dt className="text-slate-400 flex items-center gap-1.5">
            <TrustIcon className="w-3.5 h-3.5" />
            Trust:
          </dt>
          <dd>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${trustStateInfo.color}`}
            >
              <TrustIcon className="w-3 h-3" />
              {trustStateInfo.label}
            </span>
          </dd>
        </div>

        {/* Retrieved At (for external sources) */}
        {provenance.retrieved_at && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400">Retrieved:</dt>
            <dd className="text-slate-200 text-xs">
              {new Date(provenance.retrieved_at).toLocaleString()}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ============================================================================
// World Model V5: Principal and ConversationThread Display Components
// ============================================================================

interface PrincipalMetadata {
  display_name?: string;
  principal_kind?: 'human' | 'agent' | 'contact';
  email?: string;
  contact_info?: {
    source_platform?: string;
  };
  capabilities?: {
    can_upload?: boolean;
    can_run_tools?: boolean;
    can_import_web?: boolean;
    can_own_account?: boolean;
    can_approve_runs?: boolean;
  };
  created_at?: number;
  updated_at?: number;
}

function PrincipalDetailsSection({ metadata }: { metadata: PrincipalMetadata }) {
  const principalKind = metadata?.principal_kind || 'unknown';
  const platform = metadata?.contact_info?.source_platform;

  const getPrincipalKindBadge = (kind: string) => {
    switch (kind) {
      case 'human':
        return {
          color: 'bg-pink-600/20 text-pink-300 border-pink-500/30',
          icon: User,
          label: 'Human',
        };
      case 'agent':
        return {
          color: 'bg-violet-600/20 text-violet-300 border-violet-500/30',
          icon: Bot,
          label: 'AI Agent',
        };
      case 'contact':
        return {
          color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
          icon: Users,
          label: 'Contact',
        };
      default:
        return {
          color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
          icon: User,
          label: 'Unknown',
        };
    }
  };

  const formatPlatform = (p: string) => {
    const platforms: Record<string, string> = {
      chatgpt: 'ChatGPT',
      claude: 'Claude',
      gemini: 'Gemini',
      unknown: 'Unknown',
    };
    return platforms[p.toLowerCase()] || p;
  };

  const kindInfo = getPrincipalKindBadge(principalKind);
  const KindIcon = kindInfo.icon;

  return (
    <div className="p-4 border-b border-slate-700 bg-slate-800/30">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
        <User className="w-4 h-4 text-pink-400" />
        Principal Details
      </h3>

      <dl className="space-y-3 text-sm">
        {/* Principal Kind */}
        <div className="flex justify-between items-center">
          <dt className="text-slate-400">Type:</dt>
          <dd>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${kindInfo.color}`}
            >
              <KindIcon className="w-3 h-3" />
              {kindInfo.label}
            </span>
          </dd>
        </div>

        {/* Display Name */}
        {metadata?.display_name && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400">Name:</dt>
            <dd className="text-slate-200">{metadata.display_name}</dd>
          </div>
        )}

        {/* Email (for humans) */}
        {metadata?.email && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400">Email:</dt>
            <dd className="text-slate-200 text-xs">{metadata.email}</dd>
          </div>
        )}

        {/* Platform (for agents) */}
        {platform && (
          <div className="flex justify-between items-center">
            <dt className="text-slate-400">Platform:</dt>
            <dd>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30">
                <Bot className="w-3 h-3" />
                {formatPlatform(platform)}
              </span>
            </dd>
          </div>
        )}

        {/* Capabilities */}
        {metadata?.capabilities && (
          <div>
            <dt className="text-slate-400 mb-2">Capabilities:</dt>
            <dd className="flex flex-wrap gap-1.5">
              {Object.entries(metadata.capabilities).map(([key, value]) => {
                if (!value) return null;
                const label = key.replace('can_', '').replace(/_/g, ' ');
                return (
                  <span
                    key={key}
                    className="px-2 py-0.5 rounded text-xs bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                  >
                    {label}
                  </span>
                );
              })}
            </dd>
          </div>
        )}

        {/* Created At */}
        {metadata?.created_at && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400">Created:</dt>
            <dd className="text-slate-200 text-xs">
              {new Date(metadata.created_at).toLocaleString()}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

interface ConversationThreadMetadata {
  title?: string;
  purpose?: string;
  human_principal_id?: string;
  agent_principal_id?: string;
  context_spec?: {
    source_ids?: string[];
    group_ids?: string[];
    expansion_rule?: string;
  };
  platform?: string;
  created_at?: number;
  updated_at?: number;
}

function ConversationThreadDetailsSection({ metadata }: { metadata: ConversationThreadMetadata }) {
  const formatPurpose = (purpose: string) => {
    const purposes: Record<string, string> = {
      general: 'General Chat',
      coding: 'Code Assistance',
      research: 'Research',
      creative: 'Creative Writing',
      analysis: 'Analysis',
    };
    return purposes[purpose] || purpose;
  };

  return (
    <div className="p-4 border-b border-slate-700 bg-slate-800/30">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-purple-400" />
        Conversation Details
      </h3>

      <dl className="space-y-3 text-sm">
        {/* Title */}
        {metadata?.title && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400">Title:</dt>
            <dd className="text-slate-200">{metadata.title}</dd>
          </div>
        )}

        {/* Purpose */}
        {metadata?.purpose && (
          <div className="flex justify-between items-center">
            <dt className="text-slate-400">Purpose:</dt>
            <dd>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30">
                {formatPurpose(metadata.purpose)}
              </span>
            </dd>
          </div>
        )}

        {/* Platform */}
        {metadata?.platform && (
          <div className="flex justify-between items-center">
            <dt className="text-slate-400">Platform:</dt>
            <dd>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-violet-600/20 text-violet-300 border border-violet-500/30">
                <Bot className="w-3 h-3" />
                {metadata.platform}
              </span>
            </dd>
          </div>
        )}

        {/* Human Principal */}
        {metadata?.human_principal_id && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400 flex items-center gap-1">
              <User className="w-3 h-3" />
              Initiated by:
            </dt>
            <dd className="text-slate-200 font-mono text-xs">
              {metadata.human_principal_id.substring(0, 16)}...
            </dd>
          </div>
        )}

        {/* Agent Principal */}
        {metadata?.agent_principal_id && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400 flex items-center gap-1">
              <Bot className="w-3 h-3" />
              Agent:
            </dt>
            <dd className="text-slate-200 font-mono text-xs">
              {metadata.agent_principal_id.substring(0, 16)}...
            </dd>
          </div>
        )}

        {/* Context Spec */}
        {metadata?.context_spec && (
          <div>
            <dt className="text-slate-400 mb-2">Context:</dt>
            <dd className="space-y-1.5">
              {metadata.context_spec.source_ids && metadata.context_spec.source_ids.length > 0 && (
                <div className="text-xs text-slate-300">
                  {metadata.context_spec.source_ids.length} source
                  {metadata.context_spec.source_ids.length !== 1 ? 's' : ''}
                </div>
              )}
              {metadata.context_spec.group_ids && metadata.context_spec.group_ids.length > 0 && (
                <div className="text-xs text-slate-300">
                  {metadata.context_spec.group_ids.length} group
                  {metadata.context_spec.group_ids.length !== 1 ? 's' : ''}
                </div>
              )}
              {metadata.context_spec.expansion_rule && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300">
                  {metadata.context_spec.expansion_rule}
                </span>
              )}
            </dd>
          </div>
        )}

        {/* Created At */}
        {metadata?.created_at && (
          <div className="flex justify-between items-start">
            <dt className="text-slate-400">Created:</dt>
            <dd className="text-slate-200 text-xs">
              {new Date(metadata.created_at).toLocaleString()}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// Simple markdown formatting (basic support) with XSS protection
function formatMarkdown(markdown: string): string {
  // First apply markdown transformations
  const html = markdown
    .replace(/^### (.*$)/gim, '<h3 class="text-slate-200">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-slate-100">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-white">$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong class="text-slate-100">$1</strong>')
    .replace(/\*(.*)\*/gim, '<em class="text-slate-300">$1</em>')
    .replace(/\n/gim, '<br />');

  // Sanitize to prevent XSS attacks from malicious content
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'strong', 'em', 'br'],
    ALLOWED_ATTR: ['class'],
  });
}

/**
 * TopicStatusBadge — Visual indicator for topic lifecycle state.
 */
function TopicStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    suggested: {
      label: 'Suggested',
      classes: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
    },
    promoted: {
      label: 'Promoted',
      classes: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
    },
    rejected: {
      label: 'Rejected',
      classes: 'bg-red-600/20 text-red-300 border-red-500/30',
    },
  };

  const cfg = config[status] || config.suggested;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}
