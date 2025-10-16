'use client';

import { useState, useCallback } from 'react';
import { X, Upload, FileText, Save } from 'lucide-react';
import {
  ChatImportConfig,
  DEFAULT_IMPORT_CONFIG,
  PlatformDetection,
  UploadProgress,
  AnalysisResult,
  DuplicateGroup,
  ReviewDecision,
} from '@/types/chat-import';
import { ImportStageSelect } from '../import/ImportStageSelect';
import { ImportStageProcessing } from '../import/ImportStageProcessing';
import { ImportStageConfig } from '../import/ImportStageConfig';
import { DuplicateReviewPanel } from '../import/DuplicateReviewPanel';
import { importChatFiles, analyzeFiles, detectPlatform } from '@/lib/api-client';

interface ChatImportModalProps {
  onDismiss: () => void;
}

type Stage = 'select' | 'processing' | 'config' | 'review' | 'complete';

export function ChatImportModal({ onDismiss }: ChatImportModalProps) {
  // State
  const [stage, setStage] = useState<Stage>('select');
  const [config, setConfig] = useState<ChatImportConfig>(DEFAULT_IMPORT_CONFIG);
  const [files, setFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [platformDetection, setPlatformDetection] = useState<PlatformDetection | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'uploading',
    percent: 0,
    message: '',
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  const processFiles = async (filesToProcess: File[]) => {
    try {
      // Stage 1: Uploading
      setProgress({ stage: 'uploading', percent: 10, message: 'Uploading files...' });
      await delay(300);

      // Stage 2: Detecting platform
      setProgress({ stage: 'detecting', percent: 30, message: 'Detecting platform...' });

      // Detect platform from first file
      if (filesToProcess.length > 0) {
        const detection = await detectPlatform(filesToProcess[0]);
        setPlatformDetection({
          platform: detection.platform as any,
          conversationCount: 0, // Will be calculated during analysis
          messageCount: 0,
          confidence: detection.confidence,
        });
      }

      // Stage 3: Analyzing
      setProgress({ stage: 'analyzing', percent: 60, message: 'Analyzing content...' });

      // Analyze files to get statistics
      const analysisData = await analyzeFiles(filesToProcess);

      // Update platform detection with counts
      if (platformDetection) {
        setPlatformDetection({
          ...platformDetection,
          conversationCount: analysisData.total_conversations,
          messageCount: analysisData.total_messages,
        });
      }

      // Set analysis result
      setAnalysis({
        totalMessages: analysisData.total_messages,
        userMessages: Math.floor(analysisData.total_messages * 0.5), // Estimate
        assistantMessages: Math.floor(analysisData.total_messages * 0.5), // Estimate
        codeBlocks: 0, // Will be detected during import
        averageMessageLength: 500, // Estimate
        filteredMessageCount: Math.floor(analysisData.total_messages * 0.6), // Estimate based on min length
      });

      // Stage 4: Ready
      setProgress({ stage: 'ready', percent: 100, message: 'Ready for configuration' });
      await delay(300);
      setStage('config');
    } catch (error) {
      console.error('Error processing files:', error);
      setProgress({
        stage: 'error',
        percent: 0,
        message: 'Failed to process files. Please try again.',
      });
    }
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // File selection handler
  const handleFilesSelected = useCallback(
    async (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setStage('processing');
      await processFiles(selectedFiles);
    },
    [processFiles]
  );

  const handleImport = async () => {
    try {
      console.log('Starting import with config:', config);
      console.log('Files to import:', files.map(f => f.name));

      if (files.length === 0) {
        alert('Please select files to import');
        return;
      }

      // Set importing state and show loading
      setIsImporting(true);
      setStage('processing');
      setProgress({ stage: 'uploading', percent: 20, message: 'Uploading to server...' });

      console.log('Calling importChatFiles...');

      // Call real import API
      const response = await importChatFiles(files, config);

      console.log('Got response:', response);

      if (!response.success) {
        console.error('Import failed:', response.error);
        setIsImporting(false);
        alert(`Import failed: ${response.error}`);
        return;
      }

      console.log('Import successful:', response);

      // Aggregate results from all files
      const allDuplicateGroups = response.results
        ?.flatMap(r => r.result?.duplicate_groups || [])
        .filter(g => g !== undefined) || [];

      // Calculate aggregate stats
      const totalConversations = response.results?.reduce((sum, r) => sum + (r.result?.stats.total_conversations || 0), 0) || 0;
      const totalMessages = response.results?.reduce((sum, r) => sum + (r.result?.stats.total_messages || 0), 0) || 0;
      const totalSources = response.results?.reduce((sum, r) => sum + (r.result?.stats.total_sources || 0), 0) || 0;
      const totalCodeBlocks = response.results?.reduce((sum, r) => sum + (r.result?.stats.total_code_blocks || 0), 0) || 0;

      // Check if we have duplicate groups to review
      if (allDuplicateGroups.length > 0) {
        setIsImporting(false);
        setDuplicateGroups(allDuplicateGroups);
        setStage('review');
      } else {
        // No duplicates or duplicate detection disabled, complete import
        setIsImporting(false);
        alert(
          `Import complete!\n\n` +
          `Conversations: ${totalConversations}\n` +
          `Messages: ${totalMessages}\n` +
          `Sources: ${totalSources}\n` +
          `Code blocks: ${totalCodeBlocks}`
        );
        onDismiss();
      }
    } catch (error) {
      console.error('Import error:', error);
      setIsImporting(false);
      setProgress({
        stage: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleReviewComplete = (decisions: Map<string, ReviewDecision>) => {
    // TODO: Apply decisions and finalize import
    console.log('Review decisions:', decisions);
    onDismiss();
  };

  const getStageTitle = () => {
    switch (stage) {
      case 'select':
        return 'Select chat export files to import';
      case 'processing':
        return 'Processing your files...';
      case 'config':
        return 'Configure import settings';
      case 'review':
        return 'Review potential duplicates';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Import AI Chat Conversations</h2>
              <p className="text-sm text-slate-400">{getStageTitle()}</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content - Stage-based rendering */}
        {stage === 'review' ? (
          // Full-height review panel (no padding wrapper)
          <div className="flex-1 flex flex-col min-h-0">
            <DuplicateReviewPanel
              groups={duplicateGroups}
              onReviewComplete={handleReviewComplete}
              onCancel={onDismiss}
            />
          </div>
        ) : (
          <div className="p-6">
            {stage === 'select' && (
              <ImportStageSelect onFilesSelected={handleFilesSelected} files={files} />
            )}

            {stage === 'processing' && (
              <ImportStageProcessing
                platformDetection={platformDetection}
                progress={progress}
              />
            )}

            {stage === 'config' && (
              <ImportStageConfig
                config={config}
                onConfigChange={setConfig}
                platformDetection={platformDetection}
                analysis={analysis}
              />
            )}
          </div>
        )}

        {/* Footer - hide for review stage (has its own footer) */}
        {stage !== 'review' && (
          <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6 flex items-center justify-between">
            <button
              onClick={onDismiss}
              className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>

            {stage === 'config' && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    /* TODO: Save preset */
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Preset
                </button>

                <button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Import & Review
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
