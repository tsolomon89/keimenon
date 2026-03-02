'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { errorCapture } from '@/services/error-capture.service';
import { API_BASE_URL } from '@/lib/env.config';

type ExportFormat = 'json' | 'csv' | 'graphml';

interface ExportDataCardProps {
  exportFormat?: string;
}

function normalizeExportFormat(format: string | undefined): ExportFormat {
  if (format === 'csv' || format === 'graphml') {
    return format;
  }
  return 'json';
}

function getFallbackFilename(format: ExportFormat): string {
  return `keimenon-export.${format}`;
}

function parseFilenameFromHeader(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || null;
}

export function ExportDataCard({ exportFormat }: ExportDataCardProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedFormat = normalizeExportFormat(exportFormat);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setError(null);

      const token = localStorage.getItem('keimenon_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/data/export?format=${encodeURIComponent(resolvedFormat)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        const capturedError = errorCapture.capture(
          new Error(errorData.error || 'Failed to export data'),
          {
            domain: 'database',
            operation: 'dataManagement.exportData',
            metadata: {
              component: 'ExportDataCard',
              endpoint: '/api/v1/data/export',
              format: resolvedFormat,
              statusCode: response.status,
              errorDetails: errorData,
            },
          },
          'error'
        );

        throw new Error(capturedError.userMessage || errorData.error || 'Failed to export data');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename =
        parseFilenameFromHeader(response.headers.get('Content-Disposition')) ||
        getFallbackFilename(resolvedFormat);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to export data:', err);

      let errorMessage = err.message;
      if (err.message?.includes('Not authenticated')) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }

      setError(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 bg-blue-500/20 rounded-lg p-3">
          <Download className="w-6 h-6 text-blue-400" />
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Export Keimenon Data</h3>
          <p className="text-xs text-slate-400">
            Download a backup of all your Keimenon graph data (nodes and edges) as a{' '}
            {resolvedFormat.toUpperCase()} file. This export format can be used for your own local
            backups or transferring data.
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Action button */}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isExporting && <Loader2 className="w-4 h-4 animate-spin" />}
        {isExporting ? 'Exporting Data...' : `Export Data (${resolvedFormat.toUpperCase()})`}
      </button>
    </div>
  );
}
