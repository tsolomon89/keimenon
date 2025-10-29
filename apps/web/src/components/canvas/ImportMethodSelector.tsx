'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ChatImportModal } from './ChatImportModal';
import { UploadModal } from './UploadModal';

// Dynamically import legacy components only if their flags are enabled
const ImportModuleOld =
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS === '1'
    ? dynamic(() => import('./ImportModule.old').then((mod) => ({ default: mod.ImportModule })), {
        ssr: false,
      })
    : null;

const LocalFirstImportModalOld =
  process.env.NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST === '1'
    ? dynamic(
        () =>
          import('./LocalFirstImportModal.old').then((mod) => ({
            default: mod.LocalFirstImportModal,
          })),
        { ssr: false }
      )
    : null;

type ImportMethod = 'job' | 'hybrid' | 'local' | 'ingest';

interface ImportMethodSelectorProps {
  onClose: () => void;
  onSuccess?: (results?: any) => void;
}

export function ImportMethodSelector({ onClose, onSuccess }: ImportMethodSelectorProps) {
  const [method, setMethod] = useState<ImportMethod>('job');

  const methods = [
    {
      value: 'job' as ImportMethod,
      label: '✅ Job-Based (Primary Rail)',
      enabled: true,
      description: 'Production import via /api/v1/jobs/import with SSE progress tracking',
    },
    {
      value: 'hybrid' as ImportMethod,
      label: '⚠️ Hybrid Local-First',
      enabled: process.env.NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST === '1',
      description: 'Browser processing with server fallback (experimental)',
    },
    {
      value: 'local' as ImportMethod,
      label: '❌ Browser-Only (Broken)',
      enabled: process.env.NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS === '1',
      description: 'Local-only processing - KNOWN BUG: Does not save to database',
    },
    {
      value: 'ingest' as ImportMethod,
      label: '📄 File Ingest (Different Use Case)',
      enabled: true,
      description: 'General file upload and processing system',
    },
  ];

  const enabledMethods = methods.filter((m) => m.enabled);
  const currentMethodInfo = methods.find((m) => m.value === method);

  return (
    <div className="flex flex-col h-full">
      {/* Debug Header */}
      <div className="p-4 bg-yellow-900/20 border-b border-yellow-600/30">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔧</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-yellow-400 mb-1">
              Debug Mode: Import Method Selector
            </h3>
            <p className="text-xs text-yellow-400/80 mb-3">
              Select which import path to test. This selector is only visible when
              NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR=1.
            </p>

            {/* Method Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">Import Method:</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as ImportMethod)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {enabledMethods.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* Method Description */}
              {currentMethodInfo && (
                <p className="text-xs text-slate-400 italic">{currentMethodInfo.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Import Component */}
      <div className="flex-1 overflow-hidden">
        {method === 'job' && <ChatImportModal onDismiss={onClose} />}

        {method === 'ingest' && <UploadModal onClose={onClose} />}

        {method === 'hybrid' && LocalFirstImportModalOld && (
          <LocalFirstImportModalOld onClose={onClose} onSuccess={onSuccess} />
        )}

        {method === 'local' && ImportModuleOld && (
          <ImportModuleOld variant="panel" onClose={onClose} onSuccess={onSuccess} />
        )}
      </div>
    </div>
  );
}
