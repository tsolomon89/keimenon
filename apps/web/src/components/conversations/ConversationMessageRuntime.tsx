import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ArrowLeft, Sparkles, Send, AlertCircle, User, Bot, Cpu } from 'lucide-react';
import { organizationService, ConversationThread } from '../../services/organization-service';
import { getGemmaStatusLabel } from '../../utils/gemma-status-helper';
import { ProvenanceViewerModal } from './ProvenanceViewerModal';
import { GemmaSetupPanel } from './GemmaSetupPanel';
import type { MessageNode, ConversationContextPack } from '@keimenon/types';

interface ConversationMessageRuntimeProps {
  conversation: ConversationThread;
  onBack: () => void;
  className?: string;
}

export function ConversationMessageRuntime({
  conversation,
  onBack,
  className = '',
}: ConversationMessageRuntimeProps) {
  const [messages, setMessages] = useState<MessageNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextPack, setContextPack] = useState<ConversationContextPack | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [gemmaStatus, setGemmaStatus] = useState<any>(null);
  const [isCheckingGemma, setIsCheckingGemma] = useState(false);
  const [showSetupPanel, setShowSetupPanel] = useState(false);
  const [selectedProvenanceRunId, setSelectedProvenanceRunId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchMessages() {
      try {
        setLoading(true);
        setError(null);
        const [fetchedMessages, fetchedContext, fetchedGemmaStatus] = await Promise.all([
          organizationService.getConversationMessages(conversation.id),
          organizationService.getConversationContextPack(conversation.id),
          organizationService.getGemmaStatus(),
        ]);
        if (isMounted) {
          setMessages(fetchedMessages);
          setContextPack(fetchedContext);
          setGemmaStatus(fetchedGemmaStatus);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load messages');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchMessages();

    return () => {
      isMounted = false;
    };
  }, [conversation.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const refreshGemmaStatus = async () => {
    try {
      setIsCheckingGemma(true);
      const fetchedGemmaStatus = await organizationService.getGemmaStatus();
      setGemmaStatus(fetchedGemmaStatus);
    } catch (err) {
      console.error('Failed to refresh Gemma status', err);
    } finally {
      setIsCheckingGemma(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    const content = inputValue.trim();
    setInputValue('');
    setSending(true);
    setError(null);

    // Optimistically add user message placeholder if needed,
    // but the API returns the actual saved message anyway.

    try {
      const response = await organizationService.postConversationMessage(
        conversation.id,
        content,
        true
      );

      setMessages((prev) => {
        const newMessages = [...prev, response.userMessage];
        if (response.assistantMessage) {
          const assistantMsg = { ...response.assistantMessage };
          if (response.agentRunDetails) {
            (assistantMsg as any)._agentRunDetails = response.agentRunDetails;
          }
          newMessages.push(assistantMsg);
        }
        return newMessages;
      });

      if (response.synthesisError) {
        setError(response.synthesisError);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      // If it failed completely, user can try again
      setInputValue(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col h-full bg-slate-900 text-slate-200 ${className}`}>
      {/* Header */}
      <div className="flex-none flex items-center p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-2 mr-3 rounded-md hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-white truncate">
            {conversation.title || 'Untitled Conversation'}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 text-blue-400" />
              Runtime Active
            </span>
            <span>&bull;</span>
            <span className="truncate opacity-75 text-slate-500 font-mono">
              ID: {conversation.id}
            </span>
            {gemmaStatus && (
              <>
                <span>&bull;</span>
                {(() => {
                  const statusInfo = getGemmaStatusLabel(gemmaStatus);
                  let bgClass = 'bg-slate-800 text-slate-400';
                  let dotClass = 'bg-slate-500';

                  switch (statusInfo.tone) {
                    case 'online':
                      bgClass = 'bg-emerald-900/50 text-emerald-400';
                      dotClass = 'bg-emerald-400';
                      break;
                    case 'warning':
                      bgClass = 'bg-yellow-900/50 text-yellow-400';
                      dotClass = 'bg-yellow-400';
                      break;
                    case 'error':
                      bgClass = 'bg-red-900/50 text-red-400';
                      dotClass = 'bg-red-400';
                      break;
                    case 'neutral':
                    default:
                      bgClass = 'bg-slate-800 text-slate-500';
                      dotClass = 'bg-slate-500';
                      break;
                  }

                  return (
                    <button
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity cursor-pointer ${bgClass}`}
                      title={gemmaStatus.error || 'Local Runtime Status'}
                      onClick={() => setShowSetupPanel(!showSetupPanel)}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></div>
                      {statusInfo.label}
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        </div>
        {showSetupPanel && (
          <GemmaSetupPanel
            status={gemmaStatus}
            onClose={() => setShowSetupPanel(false)}
            onRefresh={refreshGemmaStatus}
            isChecking={isCheckingGemma}
          />
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Context Bounds Summary */}
        {contextPack && (
          <div className="max-w-3xl mx-auto mb-6 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => setIsContextExpanded(!isContextExpanded)}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-slate-200">Context Bounds</span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="bg-slate-900 px-2 py-0.5 rounded-full">
                    {contextPack.truncation.returned_sources} sources
                  </span>
                  <span className="bg-slate-900 px-2 py-0.5 rounded-full">
                    {contextPack.truncation.returned_groups} groups
                  </span>
                  <span className="bg-slate-900 px-2 py-0.5 rounded-full">
                    {contextPack.truncation.returned_evidence_items} evidence items
                  </span>
                </div>
              </div>
              <div className="text-xs text-slate-500">{isContextExpanded ? 'Hide' : 'View'}</div>
            </div>

            {isContextExpanded && (
              <div className="px-4 py-3 border-t border-slate-700/50 text-sm text-slate-300">
                {contextPack.truncation.evidence_truncated && (
                  <div className="mb-3 p-2 bg-yellow-900/20 border border-yellow-700/30 text-yellow-300 rounded flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Evidence truncated to maximum limit ({contextPack.limits.max_evidence_items}{' '}
                      items).
                    </span>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {contextPack.source_ids.map((srcId: string) => (
                        <span
                          key={srcId}
                          className="bg-slate-900/80 px-2 py-1 rounded text-xs border border-slate-700 truncate max-w-[200px]"
                        >
                          {srcId}
                        </span>
                      ))}
                    </div>
                  </div>
                  {contextPack.group_ids.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Groups
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {contextPack.group_ids.map((grpId: string) => (
                          <span
                            key={grpId}
                            className="bg-slate-900/80 px-2 py-1 rounded text-xs border border-slate-700 truncate max-w-[200px]"
                          >
                            {grpId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Loading runtime state...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg">Conversation Started</p>
            <p className="text-sm opacity-75 mt-2 max-w-md text-center">
              Send a message to begin the synthesis loop using the selected context.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const content = msg.content;
              const synthesisError = (msg as any).synthesis_error;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`flex-none w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-blue-600' : 'bg-emerald-600'}`}
                  >
                    {isUser ? (
                      <User className="w-5 h-5 text-white" />
                    ) : (
                      <Bot className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div
                    className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : 'flex justify-start'}`}
                  >
                    <div
                      className={`inline-block px-4 py-3 rounded-2xl max-w-[85%] ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                        {content}
                      </div>
                      {synthesisError && (
                        <div className="mt-3 text-xs bg-red-900/50 border border-red-500/50 text-red-200 p-2 rounded flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Synthesis failed: {synthesisError}</span>
                        </div>
                      )}
                      {(msg as any)._agentRunDetails && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-col gap-2">
                          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded">
                              <User className="w-3 h-3 text-emerald-400" />
                              Agent: Research Assistant
                            </span>
                            <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded">
                              <Sparkles className="w-3 h-3 text-emerald-400" />
                              Provider: {(msg as any)._agentRunDetails.provider}
                            </span>
                            {(msg as any)._agentRunDetails.model && (
                              <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded">
                                <Cpu className="w-3 h-3 text-purple-400" />
                                Model: {(msg as any)._agentRunDetails.model}
                              </span>
                            )}
                            <span className="flex items-center gap-1 bg-slate-900/50 px-2 py-0.5 rounded">
                              <Bot className="w-3 h-3 text-blue-400" />
                              Skill: {(msg as any)._agentRunDetails.skill_used}
                            </span>
                            {(msg as any)._agentRunDetails.agent_run_id && (
                              <span className="bg-slate-900/50 px-2 py-0.5 rounded font-mono">
                                Run: {(msg as any)._agentRunDetails.agent_run_id?.substring(0, 8)}
                                ...
                              </span>
                            )}
                            <span className="bg-slate-900/50 px-2 py-0.5 rounded">
                              {(msg as any)._agentRunDetails.duration_ms}ms
                            </span>

                            <button
                              className="ml-auto flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors"
                              onClick={() => {
                                if ((msg as any)._agentRunDetails.agent_run_id) {
                                  setSelectedProvenanceRunId(
                                    (msg as any)._agentRunDetails.agent_run_id
                                  );
                                }
                              }}
                            >
                              View Provenance
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex gap-4 flex-row">
                <div className="flex-none w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-600">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0 flex justify-start">
                  <div className="inline-block px-4 py-3 rounded-2xl bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-4 bg-slate-900 border-t border-slate-800">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-3 p-3 bg-red-900/30 border border-red-900/50 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div className="text-sm text-red-200">{error}</div>
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500 transition-all">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message runtime..."
              className="flex-1 max-h-48 min-h-[56px] w-full bg-transparent border-0 resize-none py-4 pl-4 pr-12 text-slate-200 placeholder:text-slate-500 focus:ring-0"
              rows={1}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              className="absolute right-2 bottom-2 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <div className="mt-2 text-center text-xs text-slate-500">
            Press Enter to send, Shift+Enter for new line. Context bounds are enforced by the
            adapter.
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedProvenanceRunId && (
        <ProvenanceViewerModal
          runId={selectedProvenanceRunId}
          onClose={() => setSelectedProvenanceRunId(null)}
        />
      )}
    </div>
  );
}
