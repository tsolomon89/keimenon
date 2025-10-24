import React, { useEffect, useState } from 'react';
import { getStorageStats, StorageStats } from '@/lib/api-client';

interface DeduplicationStats {
  totalNodes: number;
  uniqueContent: number;
  duplicates: number;
  spaceSaved: number;
  efficiency: number;
}

export function StorageStatsDashboard() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [dedupStats, setDedupStats] = useState<DeduplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const graphStats = stats ? (stats.database ?? stats.neo4j ?? null) : null;
  const graphLabel = stats?.storage_mode === 'neo4j' ? 'Neo4j' : 'Graph Database';
  const graphStorageName = stats?.storage_mode === 'neo4j' ? 'Neo4j' : 'The graph database';

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch storage stats
      const data = await getStorageStats();
      setStats(data);

      // Fetch deduplication stats (optional - won't fail if unavailable)
      try {
        const token = localStorage.getItem('canvas_memory_token');
        const userStr = localStorage.getItem('canvas_memory_user');
        if (token && userStr) {
          const user = JSON.parse(userStr);
          const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
          const response = await fetch(
            `${API_BASE_URL}/api/v1/deduplication/stats?accountId=${user.accountId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            const dedupData = await response.json();
            setDedupStats(dedupData);
          }
        }
      } catch (dedupErr) {
        // Silently fail - dedup stats are optional
        console.log('Deduplication stats unavailable');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load storage stats');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 flex items-center gap-2 z-40"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        Storage Stats
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Storage Statistics</h3>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={loadStats}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && stats && (
          <div className="space-y-4">
            {/* Storage Model Badge */}
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-medium text-green-800">
                  {stats.storage_model === 'local-first'
                    ? 'Local-First Storage Active'
                    : stats.storage_model}
                </span>
              </div>
              <p className="text-xs text-green-700 mt-1">
                Documents stored locally, metadata in Neo4j
              </p>
            </div>

            {/* Local Storage Stats */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Local Storage</h4>
              <div className="bg-gray-50 rounded p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Documents:</span>
                  <span className="font-medium text-gray-900">
                    {stats.local_storage.totalDocuments.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Size:</span>
                  <span className="font-medium text-gray-900">
                    {formatBytes(stats.local_storage.totalSize)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Path:</span>
                  <span className="font-mono text-xs text-gray-900">
                    {stats.local_storage.path}
                  </span>
                </div>

                {/* By Type Breakdown */}
                {Object.keys(stats.local_storage.byType).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-600 mb-2">By Type:</p>
                    {Object.entries(stats.local_storage.byType).map(([type, data]) => (
                      <div key={type} className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 capitalize">{type}:</span>
                        <span className="text-gray-900">
                          {data.count} ({formatBytes(data.size)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Graph Stats */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">{graphLabel} Stats</h4>
              {graphStats ? (
                <div className="bg-blue-50 rounded p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Nodes:</span>
                    <span className="font-medium text-gray-900">
                      {graphStats.total_nodes.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Messages:</span>
                    <span className="text-gray-900">
                      {graphStats.message_nodes.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Sources:</span>
                    <span className="text-gray-900">
                      {graphStats.source_nodes.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Code Blocks:</span>
                    <span className="text-gray-900">
                      {graphStats.code_block_nodes.toLocaleString()}
                    </span>
                  </div>
                  {typeof graphStats.total_edges === 'number' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Edges:</span>
                      <span className="text-gray-900">
                        {graphStats.total_edges.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded p-3 text-xs text-gray-600">
                  Graph statistics are not available for this environment.
                </div>
              )}
            </div>

            {/* Deduplication Stats */}
            {dedupStats && dedupStats.duplicates > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Content Deduplication</h4>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Duplicates Found:</span>
                    <span className="font-medium text-yellow-800">
                      {dedupStats.duplicates.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Space Saved:</span>
                    <span className="font-medium text-yellow-800">
                      {formatBytes(dedupStats.spaceSaved)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Efficiency:</span>
                    <span className="text-gray-900">{dedupStats.efficiency}%</span>
                  </div>
                  <a
                    href="/settings?category=data&section=deduplication"
                    className="block mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Manage duplicates →
                  </a>
                </div>
              </div>
            )}

            {/* Efficiency Badge */}
            {stats.local_storage.totalSize > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded p-3">
                <p className="text-xs text-purple-800">
                  <strong>Storage Efficiency:</strong> Full content stored locally for privacy and
                  speed.
                  {graphStorageName} stores only metadata and relationships (~90% storage
                  reduction).
                </p>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={loadStats}
              className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-2"
            >
              Refresh Stats
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
