'use client';

import { useState } from 'react';
import { FourRegionLayout } from '@canvas-memory/ui';
import { FileUploadZone } from '@/components/ingest/FileUploadZone';
import { UploadProgress } from '@/components/ingest/UploadProgress';
import { IngestResults } from '@/components/ingest/IngestResults';
import { Upload, FileCheck, Loader2 } from 'lucide-react';

export default function IngestPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setResults(null);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('board_id', 'default_board');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/ingest/files`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data);
      setFiles([]);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <FourRegionLayout
      header={
        <div className="h-full flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Upload className="w-6 h-6 text-purple-500" />
            <h1 className="text-xl font-semibold">Ingest Files</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">
              {files.length} file{files.length !== 1 ? 's' : ''} ready
            </span>
            <button
              onClick={handleUpload}
              disabled={files.length === 0 || uploading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="h-full overflow-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Upload Zone */}
          <FileUploadZone
            onFilesSelected={handleFilesSelected}
            acceptedTypes={[
              'application/pdf',
              'text/plain',
              'text/markdown',
              'image/png',
              'image/jpeg',
              'application/json',
              'text/csv',
            ]}
          />

          {/* Selected Files */}
          {files.length > 0 && (
            <UploadProgress
              files={files}
              uploading={uploading}
              onRemove={(index) => {
                setFiles((prev) => prev.filter((_, i) => i !== index));
              }}
            />
          )}

          {/* Results */}
          {results && <IngestResults results={results} />}
        </div>
      </div>
    </FourRegionLayout>
  );
}
