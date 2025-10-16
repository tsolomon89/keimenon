'use client';

import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  acceptedTypes?: string[];
}

export function FileUploadZone({
  onFilesSelected,
  acceptedTypes = [],
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter((file) => {
        if (acceptedTypes.length === 0) return true;
        return acceptedTypes.includes(file.type);
      });

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }

      if (validFiles.length < files.length) {
        alert(
          `${files.length - validFiles.length} file(s) were rejected due to invalid type`
        );
      }
    },
    [onFilesSelected, acceptedTypes]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input
      e.target.value = '';
    },
    [onFilesSelected]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        border-3 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-all duration-300
        ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10 scale-105'
            : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
        }
      `}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-4">
        <div
          className={`
          p-4 rounded-full transition-colors
          ${isDragging ? 'bg-purple-500/20' : 'bg-slate-800'}
        `}
        >
          {isDragging ? (
            <FileText className="w-12 h-12 text-purple-400" />
          ) : (
            <Upload className="w-12 h-12 text-slate-400" />
          )}
        </div>

        <div>
          <p className="text-lg font-semibold mb-2">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-sm text-slate-400">
            or click to browse your computer
          </p>
        </div>

        {acceptedTypes.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Accepted file types:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {getFileTypeLabels(acceptedTypes).map((label) => (
                <span
                  key={label}
                  className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500">
          <p>Maximum file size: 10 MB</p>
          <p>Maximum files per upload: 10</p>
        </div>
      </div>
    </div>
  );
}

function getFileTypeLabels(mimeTypes: string[]): string[] {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF',
    'text/plain': 'TXT',
    'text/markdown': 'Markdown',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'application/json': 'JSON',
    'text/csv': 'CSV',
  };

  return mimeTypes.map((type) => labels[type] || type);
}
