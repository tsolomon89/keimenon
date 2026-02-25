'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Copy, Check, Shield, Loader2, User, Bot, Globe, FileText, Upload, MessageSquare, Cpu, Database } from 'lucide-react';
import { useContentLoader, ContentType } from '@/hooks/useContentLoader';
import { MessageContent, SourceContent, CodeContent } from '@/lib/api-client';
import { useKeimenonStore } from '@/store/keimenonStore';

// Provenance types
interface Provenance {
  origin_principal_id?: string;
  origin_type?: 'user_upload' | 'chat_import' | 'agent_import' | 'agent_generated' | 'system_seed' | 'migrated';
  origin_ref?: string;
  trust_state?: 'ugc' | 'external_claim' | 'verified_source';
  original_url?: string;
  retrieved_at?: number;
  // Legacy fields
  origin?: string;
  attested?: boolean;
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
  const { detailPanelNode, closeDetailPanel } = useKeimenonStore();
  const { loadContent, getContent, isLoading, getError } = useContentLoader();
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle topic verification
  const handleVerifyTopic = useCallback(async () => {
    if (!detailPanelNode || detailPanelNode.type !== 'Topic') return;

    setIsVerifying(true);
    setVerificationError(null);
    setVerificationResult(null);

    try {
      const response = await fetch('/api/v1/verification/verify-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          topic: {
            id: detailPanelNode.id,
            name: detailPanelNode.data?.label || detailPanelNode.data?.metadata?.name || 'Unknown Topic',
            description: detailPanelNode.data?.metadata?.description,
            keywords: detailPanelNode.data?.metadata?.keywords || [],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Verification failed: ${response.statusText}`);
      }

      const result = await response.json();
      setVerificationResult(result);
    } catch (error: any) {
      setVerificationError(error.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  }, [detailPanelNode]);

  // Auto-load content when panel opens
  useEffect(() => {
    if (detailPanelNode && !autoLoaded) {
      const contentType = getContentType(detailPanelNode.type);
      if (contentType) {
        loadContent(detailPanelNode.id, contentType);
        setAutoLoaded(true);
      }
    }

    // Reset when node changes
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
                    {content.source === 'local' ? '📁 Local' : '☁️ Neo4j'}
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

        {/* Actions - V2: Verify Topic button for Topic nodes */}
        {detailPanelNode.type === 'Topic' && (
          <div className="p-4 border-b border-slate-700 bg-slate-800/30">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Actions</h3>
            <button
              onClick={handleVerifyTopic}
              disabled={isVerifying}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
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

            {verificationError && (
              <div className="mt-3 p-3 bg-red-600/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-300">{verificationError}</p>
              </div>
            )}

            {verificationResult && (
              <div className="mt-3 p-3 bg-emerald-600/10 border border-emerald-500/30 rounded-lg">
                <p className="text-sm text-emerald-300 font-medium mb-2">
                  Verification Complete
                </p>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Sources found:</dt>
                    <dd className="text-emerald-300">{verificationResult.stats?.sourceCount || 0}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Claims extracted:</dt>
                    <dd className="text-emerald-300">{verificationResult.stats?.claimCount || 0}</dd>
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
    default:
      return null;
  }
}

function getNodeTitle(node: any): string {
  if (node.data?.label) return node.data.label;
  if (node.data?.metadata?.title) return node.data.metadata.title;
  if (node.data?.metadata?.role) return `${node.data.metadata.role} message`;
  if (node.data?.metadata?.name) return node.data.metadata.name;
  if (node.data?.metadata?.language) return `${node.data.metadata.language} code`;
  return node.type.charAt(0).toUpperCase() + node.type.slice(1);
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
        return { label: 'File Upload', icon: Upload, color: 'bg-blue-600/20 text-blue-300 border-blue-500/30' };
      case 'chat_import':
        return { label: 'Chat Import', icon: MessageSquare, color: 'bg-purple-600/20 text-purple-300 border-purple-500/30' };
      case 'agent_import':
        return { label: 'Agent Import', icon: Globe, color: 'bg-amber-600/20 text-amber-300 border-amber-500/30' };
      case 'agent_generated':
        return { label: 'AI Generated', icon: Cpu, color: 'bg-pink-600/20 text-pink-300 border-pink-500/30' };
      case 'system_seed':
        return { label: 'System', icon: Database, color: 'bg-slate-600/20 text-slate-300 border-slate-500/30' };
      case 'migrated':
        return { label: 'Migrated', icon: FileText, color: 'bg-slate-600/20 text-slate-300 border-slate-500/30' };
      default:
        return { label: 'Unknown', icon: FileText, color: 'bg-slate-600/20 text-slate-300 border-slate-500/30' };
    }
  };

  // Get display info for trust state
  const getTrustStateInfo = (state: string | undefined) => {
    switch (state) {
      case 'ugc':
        return { label: 'User Generated', color: 'bg-blue-600/20 text-blue-300 border-blue-500/30', icon: User };
      case 'external_claim':
        return { label: 'Unverified', color: 'bg-amber-600/20 text-amber-300 border-amber-500/30', icon: Globe };
      case 'verified_source':
        return { label: 'Verified', color: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30', icon: Shield };
      default:
        return { label: 'Unknown', color: 'bg-slate-600/20 text-slate-300 border-slate-500/30', icon: FileText };
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
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${originTypeInfo.color}`}>
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
            <dd className="text-slate-200 font-mono text-xs truncate max-w-[180px]" title={provenance.origin_ref || provenance.original_url}>
              {provenance.original_url ? (
                <a href={provenance.original_url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                  {new URL(provenance.original_url).hostname}
                </a>
              ) : (
                (provenance.origin_ref || '').substring(0, 20) + ((provenance.origin_ref?.length || 0) > 20 ? '...' : '')
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
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${trustStateInfo.color}`}>
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

// Simple markdown formatting (basic support)
function formatMarkdown(markdown: string): string {
  return markdown
    .replace(/^### (.*$)/gim, '<h3 class="text-slate-200">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-slate-100">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-white">$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong class="text-slate-100">$1</strong>')
    .replace(/\*(.*)\*/gim, '<em class="text-slate-300">$1</em>')
    .replace(/\n/gim, '<br />');
}
