import { useState, useCallback, useRef } from 'react';
import {
  getMessageContent,
  getSourceContent,
  getCodeContent,
  getConversationContent,
  getLexemeContent,
  getPhraseContent,
  getTopicContent,
  getUnifiedDocContent,
  getVerifiedSourceContent,
  getVerifiedClaimContent,
  MessageContent,
  SourceContent,
  CodeContent,
  ConversationContent,
  LexemeContent,
  PhraseContent,
  TopicContent,
  UnifiedDocContent,
  VerifiedSourceContent,
  VerifiedClaimContent,
} from '@/lib/api-client';

export type ContentType =
  | 'message'
  | 'source'
  | 'code'
  | 'conversation'
  | 'lexeme'
  | 'phrase'
  | 'topic'
  | 'unified-doc'
  | 'verified-source'
  | 'verified-claim';

export type LoadedContent =
  | MessageContent
  | SourceContent
  | CodeContent
  | ConversationContent
  | LexemeContent
  | PhraseContent
  | TopicContent
  | UnifiedDocContent
  | VerifiedSourceContent
  | VerifiedClaimContent;

interface ContentCache {
  [key: string]: LoadedContent;
}

interface UseContentLoaderReturn {
  loadedContent: ContentCache;
  loadingStates: Record<string, boolean>;
  errors: Record<string, string | null>;
  loadContent: (id: string, type: ContentType) => Promise<LoadedContent | null>;
  getContent: (id: string) => LoadedContent | null;
  isLoading: (id: string) => boolean;
  getError: (id: string) => string | null;
  clearContent: (id: string) => void;
  clearAll: () => void;
}

/**
 * Hook for lazy-loading node content from local storage
 *
 * Features:
 * - In-memory caching (content loaded once)
 * - Loading states per node
 * - Error handling per node
 * - Deduplication (prevents multiple simultaneous loads)
 *
 * @example
 * ```tsx
 * const { loadContent, getContent, isLoading } = useContentLoader();
 *
 * const handleNodeClick = async (nodeId: string) => {
 *   const content = await loadContent(nodeId, 'message');
 *   console.log(content);
 * };
 * ```
 */
export function useContentLoader(): UseContentLoaderReturn {
  const [loadedContent, setLoadedContent] = useState<ContentCache>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // Track in-flight requests to prevent duplicate loads
  const inflightRequests = useRef<Record<string, Promise<LoadedContent | null>>>({});

  /**
   * Load content for a specific node
   */
  const loadContent = useCallback(
    async (id: string, type: ContentType): Promise<LoadedContent | null> => {
      // Return cached content if available
      if (loadedContent[id]) {
        return loadedContent[id];
      }

      // Return in-flight request if already loading
      const existingRequest = inflightRequests.current[id];
      if (existingRequest) {
        return existingRequest;
      }

      // Start loading
      setLoadingStates((prev) => ({ ...prev, [id]: true }));
      setErrors((prev) => ({ ...prev, [id]: null }));

      const loadPromise = (async () => {
        try {
          let content: LoadedContent;

          switch (type) {
            case 'message':
              content = await getMessageContent(id);
              break;
            case 'source':
              content = await getSourceContent(id);
              break;
            case 'code':
              content = await getCodeContent(id);
              break;
            case 'conversation':
              content = await getConversationContent(id);
              break;
            // V2 Node Types
            case 'lexeme':
              content = await getLexemeContent(id);
              break;
            case 'phrase':
              content = await getPhraseContent(id);
              break;
            case 'topic':
              content = await getTopicContent(id);
              break;
            case 'unified-doc':
              content = await getUnifiedDocContent(id);
              break;
            case 'verified-source':
              content = await getVerifiedSourceContent(id);
              break;
            case 'verified-claim':
              content = await getVerifiedClaimContent(id);
              break;
            default:
              throw new Error(`Unknown content type: ${type}`);
          }

          // Cache the content
          setLoadedContent((prev) => ({ ...prev, [id]: content }));

          return content;
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to load content';
          setErrors((prev) => ({ ...prev, [id]: errorMessage }));
          console.error(`Error loading ${type} content for ${id}:`, error);
          return null;
        } finally {
          setLoadingStates((prev) => ({ ...prev, [id]: false }));
          delete inflightRequests.current[id];
        }
      })();

      inflightRequests.current[id] = loadPromise;
      return loadPromise;
    },
    [loadedContent]
  );

  /**
   * Get cached content without triggering a load
   */
  const getContent = useCallback(
    (id: string): LoadedContent | null => {
      return loadedContent[id] || null;
    },
    [loadedContent]
  );

  /**
   * Check if content is currently loading
   */
  const isLoading = useCallback(
    (id: string): boolean => {
      return loadingStates[id] || false;
    },
    [loadingStates]
  );

  /**
   * Get error for a specific node
   */
  const getError = useCallback(
    (id: string): string | null => {
      return errors[id] || null;
    },
    [errors]
  );

  /**
   * Clear cached content for a specific node
   */
  const clearContent = useCallback((id: string) => {
    setLoadedContent((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    setErrors((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Clear all cached content
   */
  const clearAll = useCallback(() => {
    setLoadedContent({});
    setLoadingStates({});
    setErrors({});
    inflightRequests.current = {};
  }, []);

  return {
    loadedContent,
    loadingStates,
    errors,
    loadContent,
    getContent,
    isLoading,
    getError,
    clearContent,
    clearAll,
  };
}

/**
 * Hook for loading and displaying message content with UI state
 *
 * @example
 * ```tsx
 * function MessageNode({ messageId }: { messageId: string }) {
 *   const { content, isLoading, error, load } = useMessageContent(messageId);
 *
 *   return (
 *     <div>
 *       {!content && <button onClick={load}>Load Content</button>}
 *       {isLoading && <Spinner />}
 *       {error && <Error message={error} />}
 *       {content && <div>{content.content}</div>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMessageContent(messageId: string) {
  const { loadContent, getContent, isLoading, getError } = useContentLoader();

  const content = getContent(messageId) as MessageContent | null;
  const loading = isLoading(messageId);
  const error = getError(messageId);

  const load = useCallback(() => {
    return loadContent(messageId, 'message');
  }, [messageId, loadContent]);

  return {
    content,
    isLoading: loading,
    error,
    load,
  };
}

/**
 * Hook for loading source document content
 */
export function useSourceContent(sourceId: string) {
  const { loadContent, getContent, isLoading, getError } = useContentLoader();

  const content = getContent(sourceId) as SourceContent | null;
  const loading = isLoading(sourceId);
  const error = getError(sourceId);

  const load = useCallback(() => {
    return loadContent(sourceId, 'source');
  }, [sourceId, loadContent]);

  return {
    content,
    isLoading: loading,
    error,
    load,
  };
}

/**
 * Hook for loading code block content
 */
export function useCodeContent(codeId: string) {
  const { loadContent, getContent, isLoading, getError } = useContentLoader();

  const content = getContent(codeId) as CodeContent | null;
  const loading = isLoading(codeId);
  const error = getError(codeId);

  const load = useCallback(() => {
    return loadContent(codeId, 'code');
  }, [codeId, loadContent]);

  return {
    content,
    isLoading: loading,
    error,
    load,
  };
}
