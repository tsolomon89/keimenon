'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useContentLoader, ContentType } from '@/hooks/useContentLoader';
import { MessageContent, SourceContent, CodeContent } from '@/lib/api-client';
import { useCanvasStore } from '@/store/canvasStore';

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
  const { detailPanelNode, closeDetailPanel } = useCanvasStore();
  const { loadContent, getContent, isLoading, getError } = useContentLoader();
  const [autoLoaded, setAutoLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    content.source === 'local'
                      ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                      : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                  }`}>
                    {content.source === 'local' ? '📁 Local' : '☁️ Neo4j'}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

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
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          content.role === 'user'
            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
            : 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
        }`}>
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
