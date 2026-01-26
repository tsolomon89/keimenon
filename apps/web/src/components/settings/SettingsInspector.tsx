'use client';

import { AlertCircle, Clock, User, Info, ExternalLink, History as HistoryIcon } from 'lucide-react';
import { useSettingDetails } from '@/hooks/useSettings';
import { ConfigScope } from '@keimenon/types/src/settings';

interface SettingsInspectorProps {
  selectedControlId: string | null;
}

/**
 * SettingsInspector Component
 *
 * Right sidebar inspector for Settings mode.
 * Shows detailed information about the selected setting:
 * - Control definition and metadata
 * - Description and help text
 * - Current effective value and source
 * - Change history
 * - Validation rules
 */
export function SettingsInspector({ selectedControlId }: SettingsInspectorProps) {
  const { control, effectiveValue, source, canEdit, canReset, isDefault, history, loading, error } =
    useSettingDetails(selectedControlId);

  if (!selectedControlId) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Settings Inspector</h3>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* Info card */}
            <div className="flex items-start gap-3 p-4 bg-blue-600/10 border border-blue-500/30 rounded-lg">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-300 mb-2">How to use Settings</h4>
                <ul className="text-xs text-blue-400/80 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 flex-shrink-0">1.</span>
                    <span>Select a settings category from the left navigation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 flex-shrink-0">2.</span>
                    <span>Click on a setting card in the main area to view details</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 flex-shrink-0">3.</span>
                    <span>Make changes and click "Apply Changes" to save</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Quick tips */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Quick Tips
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2 text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />
                  <span>Settings are organized by category and section</span>
                </div>
                <div className="flex items-start gap-2 text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />
                  <span>Changes are previewed in real-time before saving</span>
                </div>
                <div className="flex items-start gap-2 text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />
                  <span>Some settings may require a restart to take effect</span>
                </div>
                <div className="flex items-start gap-2 text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0 mt-1.5" />
                  <span>Admin-only settings are locked for non-admin users</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !control) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-400 mb-2">Failed to load setting</p>
          <p className="text-xs text-red-500">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white mb-1">{control.label}</h3>
        {control.description && <p className="text-xs text-slate-400">{control.description}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Current Value */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Current Value
            </h4>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Effective Value</span>
                <span className="text-xs text-slate-400">
                  Source: {formatScope(source || 'defaults')}
                </span>
              </div>
              <div className="font-mono text-sm text-white">
                {formatValue(effectiveValue, control.type)}
              </div>
              {isDefault && (
                <div className="mt-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-400 inline-block">
                  Default value
                </div>
              )}
            </div>
          </div>

          {/* Control Info */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Control Information
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">ID</span>
                <span className="font-mono text-slate-300">{control.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-300">{control.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Scope</span>
                <span className="text-slate-300">{formatScope(control.scope)}</span>
              </div>
              {control.unit && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Unit</span>
                  <span className="text-slate-300">{control.unit}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Can Edit</span>
                <span className={canEdit ? 'text-green-400' : 'text-red-400'}>
                  {canEdit ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Can Reset</span>
                <span className={canReset ? 'text-green-400' : 'text-slate-500'}>
                  {canReset ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Validation Rules */}
          {(control.min !== undefined ||
            control.max !== undefined ||
            control.pattern ||
            control.required) && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Validation Rules
              </h4>
              <div className="space-y-2 text-xs">
                {control.required && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-1 h-1 rounded-full bg-red-500" />
                    <span>Required field</span>
                  </div>
                )}
                {control.min !== undefined && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    <span>
                      Minimum: {control.min}
                      {control.unit}
                    </span>
                  </div>
                )}
                {control.max !== undefined && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    <span>
                      Maximum: {control.max}
                      {control.unit}
                    </span>
                  </div>
                )}
                {control.pattern && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    <span>Pattern: {control.pattern}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Options (for select/multiselect) */}
          {control.options && control.options.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Available Options
              </h4>
              <div className="space-y-1">
                {control.options.map((opt) => (
                  <div
                    key={opt.value}
                    className="flex items-center justify-between px-2 py-1 bg-slate-800 rounded text-xs"
                  >
                    <span className="text-slate-300">{opt.label}</span>
                    <span className="font-mono text-slate-500">{opt.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Help Link */}
          {control.helpUrl && (
            <div>
              <a
                href={control.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-blue-600/10 border border-blue-500/30 rounded text-sm text-blue-300 hover:bg-blue-600/20 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>View Documentation</span>
              </a>
            </div>
          )}

          {/* Change History */}
          {history && history.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <HistoryIcon className="w-3 h-3" />
                Change History
              </h4>
              <div className="space-y-2">
                {history.slice(0, 10).map((change) => (
                  <div
                    key={change.id}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-slate-400">
                        <User className="w-3 h-3" />
                        <span>Changed by user</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(change.changedAt)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 flex-shrink-0">From:</span>
                        <span className="font-mono text-red-400">
                          {formatValue(change.oldValue, control.type)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-slate-500 flex-shrink-0">To:</span>
                        <span className="font-mono text-green-400">
                          {formatValue(change.newValue, control.type)}
                        </span>
                      </div>
                    </div>
                    {change.reason && (
                      <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">
                        {change.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {control.requiresRestart && (
            <div className="flex items-start gap-2 px-3 py-2 bg-yellow-600/10 border border-yellow-500/30 rounded text-xs text-yellow-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Requires Restart</p>
                <p className="text-yellow-400/80">
                  Changes to this setting will only take effect after restarting the application.
                </p>
              </div>
            </div>
          )}

          {control.adminOnly && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-xs text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Admin Only</p>
                <p className="text-red-400/80">
                  This setting can only be modified by administrators.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Format config scope for display
 */
function formatScope(scope: ConfigScope | string): string {
  const scopeNames: Record<ConfigScope, string> = {
    defaults: 'System Default',
    org: 'Organization',
    workspace: 'Workspace',
    role: 'Role',
    user: 'User',
    view: 'View',
    component: 'Component',
  };
  return scopeNames[scope as ConfigScope] || scope;
}

/**
 * Format value based on control type
 */
function formatValue(value: any, type: string): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  switch (type) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'multiselect':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return String(value);
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
