'use client';

import { ChatImportConfig, PlatformDetection, AnalysisResult } from '@/types/chat-import';
import { PlatformDetectionBadge } from './PlatformDetectionBadge';
import { ExtractionSection } from './sections/ExtractionSection';
import { BranchesSection } from './sections/BranchesSection';
import { MinLengthSection } from './sections/MinLengthSection';
import { ProcessingModeSection } from './sections/ProcessingModeSection';
import { GroupsSection } from './sections/GroupsSection';
import { DuplicateDetectionSection } from './sections/DuplicateDetectionSection';
import { CodeExtractionSection } from './sections/CodeExtractionSection';
import { AgentBootstrapSection } from './sections/AgentBootstrapSection';

interface ImportStageConfigProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
  platformDetection: PlatformDetection | null;
  analysis: AnalysisResult | null;
  agentRuntimeEnabled: boolean;
}

export function ImportStageConfig({
  config,
  onConfigChange,
  platformDetection,
  analysis,
  agentRuntimeEnabled,
}: ImportStageConfigProps) {
  return (
    <div className="space-y-6">
      {/* Platform Detection (read-only) */}
      {platformDetection && <PlatformDetectionBadge detection={platformDetection} />}

      {/* All form sections */}
      <ExtractionSection config={config} onConfigChange={onConfigChange} />

      <BranchesSection config={config} onConfigChange={onConfigChange} />

      <MinLengthSection
        config={config}
        onConfigChange={onConfigChange}
        analysis={analysis || undefined}
      />

      <ProcessingModeSection config={config} onConfigChange={onConfigChange} />

      <GroupsSection config={config} onConfigChange={onConfigChange} />

      <AgentBootstrapSection
        config={config}
        onConfigChange={onConfigChange}
        agentRuntimeEnabled={agentRuntimeEnabled}
      />

      <DuplicateDetectionSection config={config} onConfigChange={onConfigChange} />

      <CodeExtractionSection config={config} onConfigChange={onConfigChange} />
    </div>
  );
}
