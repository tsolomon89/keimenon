'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Loader2,
  FileText,
  ChevronRight,
  AlertCircle,
  Quote,
  ExternalLink,
} from 'lucide-react';
import { searchCorpus, type SearchResult } from '@/lib/api-client';
import { useKeimenonStore } from '@/store/keimenonStore';

interface CorpusSearchPanelProps {
  onResultSelect?: (nodeId: string, sourceId: string) => void;
}

/**
 * CorpusSearchPanel — BM25-ranked search over the user's knowledge corpus.
 *
 * Renders a search input + results list. Clicking a result opens the
 * exact evidence:
 *   Tier 1: SourceSpan node in store → select + open detail panel
 *   Tier 2: Evidence detail view (lightweight, no graph node required)
 *   Tier 3: Fallback to parent Source node
 */
export function CorpusSearchPanel({ onResultSelect }: CorpusSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectNode = useKeimenonStore((s) => s.selectNode);
  const openDetailPanel = useKeimenonStore((s) => s.openDetailPanel);
  const openEvidenceDetail = useKeimenonStore((s) => s.openEvidenceDetail);
  const nodes = useKeimenonStore((s) => s.nodes);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setResultCount(0);
      setHasSearched(false);
      setError(null);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await searchCorpus(q.trim(), {
        limit: 20,
        explain: true,
      });
      setResults(response.results);
      setResultCount(response.resultCount);
      setHasSearched(true);
    } catch (err: any) {
      const message = err?.message || 'Search failed';
      // Show friendly message for index not ready
      if (message.includes('503') || message.includes('index not available')) {
        setError('Search index not built yet. Import data first.');
      } else {
        setError(message);
      }
      setResults([]);
      setResultCount(0);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      doSearch(query);
    }
    if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setError(null);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setResultCount(0);
    setHasSearched(false);
    setError(null);
    inputRef.current?.focus();
  };

  /**
   * 3-tier evidence selection:
   *   1. SourceSpan node in store → select + open detail panel
   *   2. Evidence detail view (lightweight, data from SearchResult)
   *   3. Fallback to parent Source node
   */
  const handleResultClick = (result: SearchResult) => {
    const evidenceNodeId = result.spanId || result.nodeId;

    // Tier 1: Check if the exact SourceSpan is already in the graph store
    const spanNode = nodes.find((n) => n.id === evidenceNodeId);
    if (spanNode) {
      selectNode(evidenceNodeId, false);
      openDetailPanel(spanNode);
      onResultSelect?.(evidenceNodeId, result.sourceId);
      return;
    }

    // Tier 2: Open lightweight evidence detail view using search result data
    // The SourceSpan is excluded from the default graph snapshot by design,
    // so we display the evidence directly without requiring a graph node.
    openEvidenceDetail({
      spanId: evidenceNodeId,
      sourceId: result.sourceId,
      text: result.text,
      excerpt: result.excerpt,
      matchedTerms: result.matchedTerms,
      score: result.finalScore ?? result.score,
      provenance: result.provenance,
    });

    // Also select the parent Source if present in the graph (visual highlight)
    const sourceNode = nodes.find((n) => n.id === result.sourceId);
    if (sourceNode) {
      selectNode(result.sourceId, false);
    }

    onResultSelect?.(evidenceNodeId, result.sourceId);
  };

  const truncateText = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  };

  /** Highlight matched terms in the result text */
  const highlightText = (text: string, terms: string[], maxLen: number) => {
    const truncated = truncateText(text, maxLen);
    if (terms.length === 0) return <>{truncated}</>;

    // Build a regex that matches any of the terms (case-insensitive)
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = truncated.split(pattern);

    return (
      <>
        {parts.map((part, i) =>
          pattern.test(part) ? (
            <mark key={i} className="bg-purple-500/30 text-purple-200 rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-3 py-2 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search corpus…"
            className="w-full pl-8 pr-8 py-2 bg-slate-800/60 border border-slate-700 rounded-md text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {hasSearched && !isSearching && (
          <p className="text-[11px] text-slate-500 mt-1.5 px-0.5">
            {resultCount} result{resultCount !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Searching…</span>
          </div>
        )}

        {error && (
          <div className="p-3 m-3 bg-red-600/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {!isSearching && !error && hasSearched && results.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No matches found</p>
          </div>
        )}

        {!isSearching && !error && !hasSearched && (
          <div className="text-center py-8 text-slate-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Search your knowledge corpus</p>
            <p className="text-xs mt-1 text-slate-600">BM25-ranked results with provenance</p>
          </div>
        )}

        {results.map((result, index) => {
          const isSpanInStore = nodes.some((n) => n.id === (result.spanId || result.nodeId));
          return (
            <button
              key={`${result.nodeId}-${index}`}
              onClick={() => handleResultClick(result)}
              className="w-full text-left px-3 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors group"
            >
              <div className="flex items-start gap-2">
                {/* Icon: Quote for SourceSpan evidence, FileText for parent source */}
                {isSpanInStore ? (
                  <Quote className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {highlightText(result.text, result.matchedTerms, 140)}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-mono text-purple-400/80">
                      {(result.finalScore ?? result.score).toFixed(2)}
                    </span>
                    {/* SourceSpan indicator */}
                    {(result.spanId || result.provenance) && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-400/70 bg-emerald-500/10 px-1 py-0.5 rounded">
                        <ExternalLink className="w-2.5 h-2.5" />
                        span
                      </span>
                    )}
                    {result.matchedTerms.length > 0 && (
                      <span className="text-[10px] text-slate-500 truncate">
                        {result.matchedTerms.slice(0, 3).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 mt-1 shrink-0 transition-opacity" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
