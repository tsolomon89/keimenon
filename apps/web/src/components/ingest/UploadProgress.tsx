'use client';

import { File, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@canvas-memory/ui';

interface UploadProgressProps {
  files: File[];
  uploading: boolean;
  onRemove: (index: number) => void;
}

export function UploadProgress({
  files,
  uploading,
  onRemove,
}: UploadProgressProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <File className="w-5 h-5" />
          Selected Files ({files.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-purple-500 animate-spin flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatFileSize(file.size)} • {file.type || 'Unknown type'}
                  </p>
                </div>
              </div>

              {!uploading && (
                <button
                  onClick={() => onRemove(index)}
                  className="p-1 hover:bg-slate-700 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {uploading && (
          <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <p className="text-sm text-purple-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading {files.length} file{files.length !== 1 ? 's' : ''}...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
