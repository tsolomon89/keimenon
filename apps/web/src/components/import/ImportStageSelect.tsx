'use client';

import { FileText } from 'lucide-react';
import { FileUploadZone } from '../ingest/FileUploadZone';

interface ImportStageSelectProps {
  onFilesSelected: (files: File[]) => void;
  files: File[];
}

export function ImportStageSelect({ onFilesSelected, files }: ImportStageSelectProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">Select Chat Export Files</h3>
        <FileUploadZone
          onFilesSelected={onFilesSelected}
          acceptedTypes={['application/json', '.jsonl']}
        />
        <p className="text-xs text-slate-400 mt-2">
          Supports ChatGPT, Claude, Gemini exports (JSON/JSONL)
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm text-slate-400">Selected files:</p>
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 px-3 py-2 rounded"
            >
              <FileText className="w-4 h-4" />
              <span>{file.name}</span>
              <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
