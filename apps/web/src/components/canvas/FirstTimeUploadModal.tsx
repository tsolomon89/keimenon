'use client';

import { X, Upload, FileText, Sparkles } from 'lucide-react';

interface FirstTimeUploadModalProps {
  onDismiss: () => void;
  onOpenUpload?: () => void;
  onOpenChatImport?: () => void;
}

export function FirstTimeUploadModal({
  onDismiss,
  onOpenUpload,
  onOpenChatImport,
}: FirstTimeUploadModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        aria-describedby="welcome-modal-description"
        data-testid="first-time-upload-modal"
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl"
      >
        {/* Header */}
        <div className="relative p-8 border-b border-slate-800">
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close welcome modal"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-600/20 rounded-xl">
              <Sparkles className="w-8 h-8 text-purple-400" />
            </div>
            <div>
              <h2 id="welcome-modal-title" className="text-2xl font-bold mb-2">
                Welcome to Canvas Memory OS!
              </h2>
              <p id="welcome-modal-description" className="text-slate-400">
                Let's get you started by uploading your first sources
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <button
              onClick={() => {
                onDismiss();
                onOpenUpload?.();
              }}
              className="w-full flex gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 rounded-xl transition-all text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                <Upload className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Upload Files</h3>
                <p className="text-sm text-slate-400">
                  Drag and drop PDFs, text files, markdown documents, images, JSON, or CSV files
                  onto the canvas. Up to 10 files at once, 10MB each.
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                onDismiss();
                onOpenChatImport?.();
              }}
              className="w-full flex gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 rounded-xl transition-all text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Import Chat Conversations</h3>
                <p className="text-sm text-slate-400">
                  Import conversations from Claude, ChatGPT, or other AI platforms. The system will
                  automatically organize and index your conversations.
                </p>
              </div>
            </button>
          </div>

          {/* Tips */}
          <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-xl">
            <h4 className="text-sm font-semibold text-blue-400 mb-2">💡 Pro Tip</h4>
            <p className="text-sm text-slate-400">
              After uploading, sources are automatically grouped by similarity. You can reorganize
              them on the canvas, create custom groups, and build connections between related
              content.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input type="checkbox" className="rounded bg-slate-800 border-slate-700" />
            Don't show this again
          </label>
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
