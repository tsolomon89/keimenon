'use client';

import { CheckCircle2, AlertCircle, FolderTree, Copy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@keimenon/ui';
import Link from 'next/link';

interface IngestResultsProps {
  results: {
    success: boolean;
    sources: any[];
    groupSuggestions: any[];
    duplicates: any[];
    stats: {
      uploaded: number;
      duplicates: number;
      groups: number;
    };
  };
}

export function IngestResults({ results }: IngestResultsProps) {
  if (!results.success) {
    return (
      <Card className="border-red-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            Upload Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-300">An error occurred during upload. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Summary */}
      <Card className="border-green-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-400">
            <CheckCircle2 className="w-5 h-5" />
            Upload Successful
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{results.stats.uploaded}</p>
              <p className="text-sm text-slate-400">Files Uploaded</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">{results.stats.groups}</p>
              <p className="text-sm text-slate-400">Groups Created</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{results.stats.duplicates}</p>
              <p className="text-sm text-slate-400">Duplicates Detected</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Uploaded Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {results.sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{source.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {source.mime_type}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {(source.size_bytes / 1024).toFixed(2)} KB
                    </span>
                  </div>
                </div>
                <code className="text-xs text-slate-500 font-mono">{source.id}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Auto-grouped Suggestions */}
      {results.groupSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="w-5 h-5" />
              Suggested Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.groupSuggestions.map((group) => (
                <div
                  key={group.groupId}
                  className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{group.name}</h4>
                      <p className="text-xs text-slate-400 mt-1">{group.reason}</p>
                    </div>
                    <Badge>{group.members.length} items</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {group.members.map((memberId: string) => (
                      <span
                        key={memberId}
                        className="text-xs px-2 py-1 bg-slate-700 rounded font-mono"
                      >
                        {memberId.slice(0, 12)}...
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicates */}
      {results.duplicates.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-400">
              <Copy className="w-5 h-5" />
              Duplicate Files Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400 mb-4">
              These files have identical content and were deduplicated:
            </p>
            <div className="space-y-2">
              {results.duplicates.map((dup, index) => (
                <div
                  key={index}
                  className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20"
                >
                  <p className="text-sm">
                    <span className="font-semibold">Canonical:</span>{' '}
                    <code className="text-xs font-mono">{dup.canonical}</code>
                  </p>
                  <p className="text-sm mt-1">
                    <span className="font-semibold">Duplicates:</span>{' '}
                    {dup.duplicates.map((d: string) => (
                      <code key={d} className="text-xs font-mono mr-2">
                        {d}
                      </code>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      <div className="flex items-center justify-center gap-4 pt-4">
        <Link
          href="/board/default_board"
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
        >
          View on Canvas
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors"
        >
          Upload More Files
        </button>
      </div>
    </div>
  );
}
