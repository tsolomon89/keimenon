'use client';

import { useState } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle, Link } from 'lucide-react';
import { API_BASE_URL } from '@/lib/env.config';
import { URLInputZone } from '@/components/ingest/URLInputZone';
import { URLIngestResponse } from '@/lib/api-client';

interface UploadModalProps {
  onClose: () => void;
}

type UploadMode = 'files' | 'url';
type UploadStage = 'upload' | 'configuration' | 'processing' | 'confirm';

export function UploadModal({ onClose }: UploadModalProps) {
  const [mode, setMode] = useState<UploadMode>('files');
  const [files, setFiles] = useState<File[]>([]);
  const [currentStage, setCurrentStage] = useState<UploadStage>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [urlResult, setUrlResult] = useState<URLIngestResponse | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selectedFiles]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setCurrentStage('processing');
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('board_id', 'default_board');

      const response = await fetch(`${API_BASE_URL}/api/v1/ingest/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      setUploadComplete(true);
      setCurrentStage('confirm');
      setTimeout(() => {
        onClose();
        window.location.reload(); // Refresh to show new sources
      }, 2000);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
      setUploading(false);
      setCurrentStage('upload');
    }
  };

  const handleContinueToConfig = () => {
    if (files.length > 0) {
      setCurrentStage('configuration');
    }
  };

  const handleURLSuccess = (response: URLIngestResponse) => {
    setUrlResult(response);
    setUploadComplete(true);
    setCurrentStage('confirm');
    setTimeout(() => {
      onClose();
      window.location.reload(); // Refresh to show new sources
    }, 2000);
  };

  const handleModeChange = (newMode: UploadMode) => {
    // Only allow mode change if not in the middle of processing
    if (currentStage === 'upload' || currentStage === 'configuration') {
      setMode(newMode);
      // Reset state when switching modes
      setFiles([]);
      setCurrentStage('upload');
      setUrlResult(null);
    }
  };

  // Get stage indicator steps based on mode
  const getStages = () => {
    if (mode === 'url') {
      return ['input', 'processing', 'confirm'];
    }
    return ['upload', 'configuration', 'processing', 'confirm'];
  };

  const stages = getStages();

  // Map current stage to URL mode stages for indicator
  const getDisplayStage = () => {
    if (mode === 'url') {
      if (currentStage === 'upload') return 'input';
      return currentStage;
    }
    return currentStage;
  };

  const displayStage = getDisplayStage();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-modal-title"
        data-testid="upload-modal"
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex-shrink-0">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Upload className="w-6 h-6 text-purple-500" />
              <h2 id="upload-modal-title" className="text-xl font-bold">
                Add Sources
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Close upload modal"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Mode Tabs */}
          {(currentStage === 'upload' || currentStage === 'configuration') && (
            <div className="px-6 pt-4 border-b border-slate-800">
              <div className="flex gap-1">
                <button
                  onClick={() => handleModeChange('files')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                    mode === 'files'
                      ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Files
                </button>
                <button
                  onClick={() => handleModeChange('url')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                    mode === 'url'
                      ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  URL
                </button>
              </div>
            </div>
          )}

          {/* Stage Indicator */}
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/30">
            <div className="flex items-center justify-between max-w-2xl mx-auto">
              {stages.map((stage, index) => {
                const isActive = displayStage === stage;
                const isCompleted = stages.indexOf(displayStage) > index;
                const isAccessible = stages.indexOf(displayStage) >= index;

                return (
                  <div key={stage} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                          isCompleted
                            ? 'bg-purple-600 text-white'
                            : isActive
                              ? 'bg-purple-600 text-white ring-4 ring-purple-600/30'
                              : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {isCompleted ? <CheckCircle className="w-4 h-4" /> : index + 1}
                      </div>
                      <span
                        className={`text-xs font-medium capitalize ${
                          isAccessible ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {stage}
                      </span>
                    </div>
                    {index < stages.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-purple-600' : 'bg-slate-800'}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Config Panel - Only show in configuration stage for file mode */}
        {mode === 'files' && currentStage === 'configuration' && (
          <div className="p-6 border-b border-slate-800 bg-slate-950/50 space-y-4 flex-shrink-0">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Import Options</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-slate-400 mb-2">Board</label>
                <select className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
                  <option>Default Board</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-2">Auto-group</label>
                <select className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
                  <option>Enabled</option>
                  <option>Disabled</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dedupe"
                defaultChecked
                className="rounded bg-slate-800 border-slate-700"
              />
              <label htmlFor="dedupe" className="text-sm text-slate-400">
                Detect and flag duplicates
              </label>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStage === 'confirm' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {mode === 'url' ? 'URL Ingested!' : 'Upload Complete!'}
              </h3>
              <p className="text-slate-400">
                {urlResult?.duplicate
                  ? 'Duplicate content detected - linked to existing source.'
                  : 'Your sources are being processed...'}
              </p>
              {urlResult?.metadata?.title && (
                <p className="text-slate-300 mt-2 font-medium">{urlResult.metadata.title}</p>
              )}
            </div>
          ) : currentStage === 'processing' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-16 h-16 text-purple-500 animate-spin mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {mode === 'url' ? 'Fetching Content...' : 'Processing Upload...'}
              </h3>
              <p className="text-slate-400">
                {mode === 'url'
                  ? 'Extracting content from URL...'
                  : 'Please wait while we upload your files...'}
              </p>
            </div>
          ) : mode === 'url' ? (
            // URL Input Mode
            <URLInputZone onSuccess={handleURLSuccess} />
          ) : currentStage === 'configuration' ? (
            <div className="space-y-4">
              <div className="text-center py-8">
                <h3 className="text-lg font-semibold mb-2">Review Your Files</h3>
                <p className="text-sm text-slate-400">
                  {files.length} file{files.length !== 1 ? 's' : ''} ready to upload with the
                  configuration above
                </p>
              </div>
              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
                    >
                      <FileText className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-xl p-12 text-center cursor-pointer transition-all"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.json,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-semibold mb-2">Drag & drop files here</p>
                <p className="text-sm text-slate-400">or click to browse</p>
                <div className="mt-4 text-xs text-slate-500">
                  <p>Accepted: PDF, TXT, Markdown, PNG, JPEG, JSON, CSV</p>
                  <p>Max 10 files, 10MB each</p>
                </div>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-300">
                      Selected Files ({files.length})
                    </h3>
                    <button
                      onClick={() => setFiles([])}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
                      >
                        <FileText className="w-5 h-5 text-purple-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-slate-400">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-slate-400">
            {mode === 'url'
              ? 'Enter a URL to extract content'
              : `${files.length} file${files.length !== 1 ? 's' : ''} selected`}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              {uploadComplete ? 'Close' : 'Cancel'}
            </button>
            {mode === 'files' && currentStage === 'upload' && (
              <button
                onClick={handleContinueToConfig}
                disabled={files.length === 0}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                Continue to Configuration
              </button>
            )}
            {mode === 'files' && currentStage === 'configuration' && (
              <button
                onClick={handleUpload}
                disabled={files.length === 0 || uploading}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Start Upload
              </button>
            )}
            {currentStage === 'processing' && (
              <button
                disabled
                className="px-6 py-2 bg-slate-700 cursor-not-allowed rounded-lg font-semibold flex items-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
