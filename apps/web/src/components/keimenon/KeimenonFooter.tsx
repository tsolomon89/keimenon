'use client';

import {
  Terminal,
  Activity,
  Clock,
  Keyboard,
  Download,
  Trash2,
  Filter,
  AlertCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useConsole } from '@/contexts/ConsoleContext';
import { ErrorDomain, ErrorSeverity } from '@/services/error-capture.service';
import { useState, useEffect } from 'react';

interface KeimenonFooterProps {
  isOpen: boolean;
}

export function KeimenonFooter({ isOpen }: KeimenonFooterProps) {
  const { errors, errorCounts, setFilters, clearErrors, exportErrors, activeTab, setActiveTab } =
    useConsole();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<ErrorDomain | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<ErrorSeverity | 'all'>('all');

  // Apply filters - using useEffect to avoid stale state reads
  useEffect(() => {
    setFilters({
      domain: selectedDomain === 'all' ? undefined : selectedDomain,
      severity: selectedSeverity === 'all' ? undefined : selectedSeverity,
      search: searchQuery || undefined,
    });
  }, [selectedDomain, selectedSeverity, searchQuery, setFilters]);

  // Handle export
  const handleExport = (format: 'json' | 'csv') => {
    const data = exportErrors(format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-errors-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) {
    return (
      <div className="h-8 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm flex items-center justify-between px-4 text-xs">
        <div className="flex items-center gap-4 text-slate-500">
          <span>Ready</span>
          <span>•</span>
          <span>0 nodes, 0 edges</span>
          {errorCounts.error > 0 && (
            <>
              <span>•</span>
              <span className="text-red-400">
                {errorCounts.error} error{errorCounts.error !== 1 ? 's' : ''}
              </span>
            </>
          )}
          {errorCounts.warn > 0 && (
            <>
              <span>•</span>
              <span className="text-yellow-400">
                {errorCounts.warn} warning{errorCounts.warn !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500">Press ` to open console</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm flex flex-col">
      {/* Tabs */}
      <div className="h-10 border-b border-slate-800 flex items-center justify-between px-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'console'
                ? 'bg-slate-800 text-white'
                : 'hover:bg-slate-800/50 text-slate-400'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Console
            {errorCounts.error > 0 && (
              <span className="px-1.5 py-0.5 bg-red-600/20 border border-red-500/30 rounded text-xs text-red-400">
                {errorCounts.error}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-white'
                : 'hover:bg-slate-800/50 text-slate-400'
            }`}
          >
            <Clock className="w-4 h-4" />
            Logs
            {errors.length > 0 && (
              <span className="px-1.5 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded text-xs text-blue-400">
                {errors.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'tasks'
                ? 'bg-slate-800 text-white'
                : 'hover:bg-slate-800/50 text-slate-400'
            }`}
          >
            <Activity className="w-4 h-4" />
            Tasks
            <span className="px-1.5 py-0.5 bg-purple-600/20 border border-purple-500/30 rounded text-xs">
              0
            </span>
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
              activeTab === 'shortcuts'
                ? 'bg-slate-800 text-white'
                : 'hover:bg-slate-800/50 text-slate-400'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Shortcuts
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(activeTab === 'console' || activeTab === 'logs') && (
            <>
              <button
                onClick={() => handleExport('json')}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                title="Export as JSON"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={clearErrors}
                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters (Console & Logs tabs only) */}
      {(activeTab === 'console' || activeTab === 'logs') && (
        <div className="border-b border-slate-800 px-4 py-2 flex items-center gap-3 text-sm">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value as ErrorDomain | 'all')}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          >
            <option value="all">All Domains</option>
            <option value="api">API</option>
            <option value="import">Import</option>
            <option value="analytics">Analytics</option>
            <option value="ui">UI</option>
            <option value="database">Database</option>
            <option value="system">System</option>
            <option value="jobs">Jobs</option>
          </select>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as ErrorSeverity | 'all')}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          >
            <option value="all">All Severities</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input
            type="text"
            placeholder="Search errors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1 text-xs outline-none focus:border-purple-500"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'console' && <ConsoleTab errors={errors} />}
        {activeTab === 'logs' && <LogsTab errors={errors} />}
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'shortcuts' && <ShortcutsTab />}
      </div>
    </div>
  );
}

// Console Tab: Error-focused view with stack traces
function ConsoleTab({ errors }: { errors: any[] }) {
  if (errors.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No errors captured</p>
        <p className="text-xs mt-1">Errors will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="p-4 font-mono text-sm space-y-3">
      {errors.map((error) => (
        <div
          key={error.id}
          className={`border-l-2 pl-3 py-2 ${
            error.severity === 'error'
              ? 'border-red-500 bg-red-950/20'
              : error.severity === 'warn'
                ? 'border-yellow-500 bg-yellow-950/20'
                : error.severity === 'info'
                  ? 'border-blue-500 bg-blue-950/20'
                  : 'border-slate-500 bg-slate-950/20'
          }`}
        >
          <div className="flex items-start gap-2 mb-1">
            {error.severity === 'error' && <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />}
            {error.severity === 'warn' && (
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
            )}
            {error.severity === 'info' && <Info className="w-4 h-4 text-blue-400 mt-0.5" />}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {new Date(error.timestamp).toLocaleTimeString()}
                </span>
                <span className="px-1.5 py-0.5 bg-slate-800 rounded text-xs text-slate-400">
                  {error.domain}
                </span>
                <span className="text-xs text-slate-500">{error.operation}</span>
              </div>
              <p className="mt-1 text-white">{error.message}</p>
              {error.context?.metadata && Object.keys(error.context.metadata).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">
                    Metadata ({Object.keys(error.context.metadata).length} items)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {Object.entries(error.context.metadata).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-xs">
                        <span className="text-slate-500 font-medium min-w-[120px]">{key}:</span>
                        <span className="text-slate-300 break-all">
                          {typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {error.stack && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-white">
                    Stack trace
                  </summary>
                  <pre className="mt-1 text-xs text-slate-500 overflow-x-auto">{error.stack}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Logs Tab: Structured log viewer
function LogsTab({ errors }: { errors: any[] }) {
  if (errors.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No logs recorded</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-800">
      {errors.map((error) => (
        <div key={error.id} className="px-4 py-2 hover:bg-slate-900/50 transition-colors">
          <div className="flex items-start gap-3">
            <span className="text-xs text-slate-500 font-mono w-20 flex-shrink-0">
              {new Date(error.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                error.severity === 'error'
                  ? 'bg-red-600/20 text-red-400'
                  : error.severity === 'warn'
                    ? 'bg-yellow-600/20 text-yellow-400'
                    : error.severity === 'info'
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'bg-slate-600/20 text-slate-400'
              }`}
            >
              {error.severity.toUpperCase()}
            </span>
            <span className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-400">
              {error.domain}
            </span>
            <span className="flex-1 text-sm text-white">{error.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Tasks Tab: Import/processing status (placeholder for now)
function TasksTab() {
  return (
    <div className="p-8 text-center text-slate-500">
      <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>No active tasks</p>
      <p className="text-xs mt-1">Import and processing tasks will appear here</p>
    </div>
  );
}

// Shortcuts Tab: Keyboard shortcuts reference
function ShortcutsTab() {
  const shortcuts = [
    { key: '`', description: 'Toggle console' },
    { key: 'Ctrl+K', description: 'Focus search' },
    { key: 'Esc', description: 'Close console' },
  ];

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Keyboard Shortcuts</h3>
      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.key}
            className="flex items-center justify-between py-2 px-3 bg-slate-900/50 rounded"
          >
            <span className="text-sm text-slate-300">{shortcut.description}</span>
            <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-mono">
              {shortcut.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
