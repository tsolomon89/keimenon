'use client';

import { useState, useCallback } from 'react';
import { X, Upload, FileText, Settings, Info } from 'lucide-react';
import { FileUploadZone } from '../ingest/FileUploadZone';

interface ChatImportConfig {
  sources_role_subset: 'user' | 'assistant' | 'both';
  sources_min_chars_user: number;
  sources_min_chars_assistant: number;
  sources_stitch_strategy: 'by_title' | 'by_chat' | 'by_chat_role';
  sources_preserve_chat_integrity: boolean;
  sources_cap: number;
  sources_attach_mode: 'non-unique' | 'unique';
  similarity_threshold: number;
  export_code: boolean;
  code_global_dedupe: boolean;
  code_min_chars: number;
  sources_export_format: 'md' | 'txt' | 'json';
  include_assistant_context: boolean;
}

const DEFAULT_CONFIG: ChatImportConfig = {
  sources_role_subset: 'user',
  sources_min_chars_user: 400,
  sources_min_chars_assistant: 400,
  sources_stitch_strategy: 'by_title',
  sources_preserve_chat_integrity: true,
  sources_cap: 150,
  sources_attach_mode: 'non-unique',
  similarity_threshold: 0.35,
  export_code: true,
  code_global_dedupe: true,
  code_min_chars: 50,
  sources_export_format: 'md',
  include_assistant_context: false,
};

interface ChatImportModalProps {
  onDismiss: () => void;
}

export function ChatImportModal({ onDismiss }: ChatImportModalProps) {
  const [config, setConfig] = useState<ChatImportConfig>(DEFAULT_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success?: boolean;
    message?: string;
    stats?: any;
  }>({});

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setUploadStatus({});
  }, []);

  const handleImport = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadStatus({});

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('config', JSON.stringify(config));

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/v1/import/chat/batch`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus({
          success: true,
          message: `Successfully imported ${result.summary.successful} of ${result.summary.total_files} files`,
          stats: result.summary,
        });
        // Clear files after successful upload
        setTimeout(() => {
          setFiles([]);
        }, 2000);
      } else {
        setUploadStatus({
          success: false,
          message: result.error || 'Import failed',
        });
      }
    } catch (error: any) {
      setUploadStatus({
        success: false,
        message: error.message || 'Network error during import',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Import AI Chat Conversations</h2>
              <p className="text-sm text-slate-400">
                Import from ChatGPT, Claude, Gemini, or other AI platforms
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Upload */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Select Chat Export Files</h3>
            <FileUploadZone
              onFilesSelected={handleFilesSelected}
              acceptedTypes={['application/json', '.jsonl']}
            />
            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-sm text-slate-400">Selected files:</p>
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 px-3 py-2 rounded"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{file.name}</span>
                    <span className="text-slate-500">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Messages */}
          {uploadStatus.message && (
            <div
              className={`p-4 rounded-lg border ${
                uploadStatus.success
                  ? 'bg-green-900/20 border-green-500/50 text-green-300'
                  : 'bg-red-900/20 border-red-500/50 text-red-300'
              }`}
            >
              <p className="font-medium">{uploadStatus.message}</p>
              {uploadStatus.stats && (
                <div className="mt-2 text-sm space-y-1">
                  <p>Total conversations: {uploadStatus.stats.total_conversations || 'N/A'}</p>
                  <p>Sources created: {uploadStatus.stats.total_sources || 'N/A'}</p>
                  <p>Code blocks extracted: {uploadStatus.stats.total_code_blocks || 'N/A'}</p>
                </div>
              )}
            </div>
          )}

          {/* Basic Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Import Options
            </h3>

            {/* Message Subset */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Which messages to include in sources:
              </label>
              <div className="flex gap-2">
                {(['user', 'assistant', 'both'] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() =>
                      setConfig({ ...config, sources_role_subset: option })
                    }
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      config.sources_role_subset === option
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {option === 'both' ? 'Both' : option === 'user' ? 'User Only' : 'Assistant Only'}
                  </button>
                ))}
              </div>
            </div>

            {/* Stitch Strategy */}
            <div>
              <label className="block text-sm font-medium mb-2">
                How to group messages into sources:
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800">
                  <input
                    type="radio"
                    name="stitch_strategy"
                    checked={config.sources_stitch_strategy === 'by_title'}
                    onChange={() =>
                      setConfig({ ...config, sources_stitch_strategy: 'by_title' })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">By Conversation Title</div>
                    <div className="text-xs text-slate-400">
                      Group messages from conversations with similar titles (recommended)
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800">
                  <input
                    type="radio"
                    name="stitch_strategy"
                    checked={config.sources_stitch_strategy === 'by_chat'}
                    onChange={() =>
                      setConfig({ ...config, sources_stitch_strategy: 'by_chat' })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium">One Source per Conversation</div>
                    <div className="text-xs text-slate-400">
                      Each conversation becomes a separate source file
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Code Extraction */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.export_code}
                  onChange={(e) =>
                    setConfig({ ...config, export_code: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm font-medium">Extract code blocks from conversations</span>
              </label>
            </div>
          </div>

          {/* Advanced Options */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
            >
              <Settings className="w-4 h-4" />
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
                {/* Min chars */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Minimum message length (characters):
                  </label>
                  <input
                    type="number"
                    value={config.sources_min_chars_user}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sources_min_chars_user: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                  />
                </div>

                {/* Sources cap */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Maximum sources to create:
                  </label>
                  <input
                    type="number"
                    value={config.sources_cap}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sources_cap: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                  />
                </div>

                {/* Similarity threshold */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Similarity threshold (0-1):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={config.similarity_threshold}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        similarity_threshold: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                  />
                </div>

                {/* Attach mode */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.sources_attach_mode === 'unique'}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          sources_attach_mode: e.target.checked ? 'unique' : 'non-unique',
                        })
                      }
                      className="rounded"
                    />
                    <span className="text-sm">
                      Unique segments only (each segment in only one source)
                    </span>
                  </label>
                </div>

                {/* Code dedup */}
                {config.export_code && (
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.code_global_dedupe}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            code_global_dedupe: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm">Deduplicate code blocks globally</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-lg">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1 text-slate-300">
                <p className="font-medium text-blue-300">Supported Platforms:</p>
                <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                  <li>ChatGPT (conversations.json or messages format)</li>
                  <li>Claude (JSON export)</li>
                  <li>Gemini (JSON export)</li>
                  <li>Generic JSON formats with auto-detection</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6 flex items-center justify-between">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={files.length === 0 || uploading}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import Conversations
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
