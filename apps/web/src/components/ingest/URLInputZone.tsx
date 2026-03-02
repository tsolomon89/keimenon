'use client';

import { useState, useCallback } from 'react';
import { Link, Loader2, CheckCircle, AlertCircle, Clipboard, ExternalLink } from 'lucide-react';
import { ingestUrl, URLIngestResponse } from '@/lib/api-client';

interface URLInputZoneProps {
  onSuccess?: (response: URLIngestResponse) => void;
  onError?: (error: Error) => void;
  boardId?: string;
}

type IngestState = 'idle' | 'loading' | 'success' | 'error';

/**
 * URL Input Zone component for ingesting web content
 *
 * Features:
 * - URL input with validation
 * - Paste from clipboard
 * - Loading state during fetch
 * - Success state with metadata display
 * - Error state with user-friendly messages
 * - Duplicate detection notice
 */
export function URLInputZone({ onSuccess, onError, boardId }: URLInputZoneProps) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<IngestState>('idle');
  const [result, setResult] = useState<URLIngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isValidUrl = useCallback((value: string): boolean => {
    if (!value.trim()) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isValidUrl(url)) {
      setError('Please enter a valid URL (http:// or https://)');
      setState('error');
      return;
    }

    setState('loading');
    setError(null);
    setResult(null);

    try {
      const response = await ingestUrl(url, boardId);
      setResult(response);
      setState('success');
      onSuccess?.(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to ingest URL';
      setError(errorMessage);
      setState('error');
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [url, boardId, isValidUrl, onSuccess, onError]);

  const handleReset = useCallback(() => {
    setUrl('');
    setState('idle');
    setResult(null);
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && isValidUrl(url)) {
        handleSubmit();
      }
    },
    [url, isValidUrl, handleSubmit]
  );

  // Success state
  if (state === 'success' && result) {
    return (
      <div className="border-2 border-dashed border-green-500/50 bg-green-500/5 rounded-xl p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-full bg-green-500/20">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>

          <div>
            <p className="text-lg font-semibold mb-2">
              {result.duplicate ? 'Duplicate Content Detected' : 'URL Ingested Successfully'}
            </p>
            {result.metadata?.title && (
              <p className="text-slate-300 font-medium">{result.metadata.title}</p>
            )}
          </div>

          {/* Metadata display */}
          {result.metadata && (
            <div className="w-full max-w-md mt-4 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {result.metadata.author && (
                  <div className="bg-slate-800/50 px-3 py-2 rounded">
                    <span className="text-slate-400">Author:</span>{' '}
                    <span className="text-slate-200">{result.metadata.author}</span>
                  </div>
                )}
                {result.metadata.siteName && (
                  <div className="bg-slate-800/50 px-3 py-2 rounded">
                    <span className="text-slate-400">Site:</span>{' '}
                    <span className="text-slate-200">{result.metadata.siteName}</span>
                  </div>
                )}
                {result.metadata.wordCount !== undefined && (
                  <div className="bg-slate-800/50 px-3 py-2 rounded">
                    <span className="text-slate-400">Words:</span>{' '}
                    <span className="text-slate-200">
                      {result.metadata.wordCount.toLocaleString()}
                    </span>
                  </div>
                )}
                {result.metadata.codeBlockCount !== undefined &&
                  result.metadata.codeBlockCount > 0 && (
                    <div className="bg-slate-800/50 px-3 py-2 rounded">
                      <span className="text-slate-400">Code blocks:</span>{' '}
                      <span className="text-slate-200">{result.metadata.codeBlockCount}</span>
                    </div>
                  )}
              </div>

              {result.duplicate && result.duplicateOf && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
                  <p className="text-yellow-400">This content already exists in your library.</p>
                  <p className="text-slate-400 mt-1">
                    Source ID:{' '}
                    <code className="text-xs bg-slate-800 px-1 rounded">{result.duplicateOf}</code>
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleReset}
            className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            Ingest Another URL
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="border-2 border-dashed border-purple-500/50 bg-purple-500/5 rounded-xl p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-full bg-purple-500/20">
            <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
          </div>
          <div>
            <p className="text-lg font-semibold mb-2">Fetching Content...</p>
            <p className="text-sm text-slate-400">This may take up to 30 seconds for large pages</p>
          </div>
        </div>
      </div>
    );
  }

  // Idle/Error state (input form)
  return (
    <div
      className={`
        border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300
        ${state === 'error' ? 'border-red-500/50 bg-red-500/5' : 'border-slate-700 hover:border-slate-600'}
      `}
    >
      <div className="flex flex-col items-center gap-4">
        <div className={`p-4 rounded-full ${state === 'error' ? 'bg-red-500/20' : 'bg-slate-800'}`}>
          {state === 'error' ? (
            <AlertCircle className="w-12 h-12 text-red-400" />
          ) : (
            <Link className="w-12 h-12 text-slate-400" />
          )}
        </div>

        <div>
          <p className="text-lg font-semibold mb-2">Paste a URL to ingest</p>
          <p className="text-sm text-slate-400">
            We&apos;ll extract the main content and save it as a source
          </p>
        </div>

        {/* URL Input */}
        <div className="w-full max-w-md mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (state === 'error') setState('idle');
                }}
                onKeyDown={handleKeyDown}
                placeholder="https://example.com/article"
                className={`
                  w-full px-4 py-3 bg-slate-900 border rounded-lg text-sm
                  placeholder-slate-500 focus:outline-none focus:ring-2
                  ${
                    state === 'error'
                      ? 'border-red-500 focus:ring-red-500/50'
                      : 'border-slate-700 focus:ring-purple-500/50 focus:border-purple-500'
                  }
                `}
              />
              <button
                onClick={handlePaste}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-700 rounded transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!url.trim()}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Fetch
            </button>
          </div>

          {/* Error message */}
          {state === 'error' && error && (
            <p className="mt-2 text-sm text-red-400 text-left">{error}</p>
          )}
        </div>

        {/* Info */}
        <div className="mt-4 text-xs text-slate-500 space-y-1">
          <p>Supported: Any public webpage (http/https)</p>
          <p>We extract the main article content, title, and metadata</p>
        </div>
      </div>
    </div>
  );
}
