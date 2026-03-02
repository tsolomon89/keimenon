'use client';

import { useState, useMemo } from 'react';
import {
  Save,
  X,
  AlertCircle,
  CheckCircle,
  History,
  Clock,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useSettings, useSettingHistory } from '@/hooks/useSettings';
import { useAuth } from '@/contexts/AuthContext';
import { SettingChange } from '@keimenon/types/src/settings';
import { SettingsCard } from './SettingsCard';
import { DataManagementCard, AdminDataManagementCard } from './DataManagementCard';
import { UsersListCard } from './UsersListCard';
import { ErrorTrackingCard } from './ErrorTrackingCard';
import { DebugModalsCard } from './DebugModalsCard';
import { DeduplicationCard } from './DeduplicationCard';
import { ExportDataCard } from './ExportDataCard';
import { ApiKeysPanel } from './ApiKeysPanel';
import { SETTINGS_REGISTRY } from '@keimenon/types/src/settings';

interface SettingsPageProps {
  selectedSectionId?: string; // section_categoryId_sectionId from navigation
  onControlSelect?: (controlId: string) => void;
  onUserSelect?: (user: any) => void; // Callback when user is selected for Inspector
}

/**
 * SettingsPage Component
 *
 * Main settings page that displays settings cards based on selected section.
 * Features:
 * - Live preview with Apply/Revert
 * - Unsaved changes tracking
 * - Permission-based editing
 * - Change history
 */
export function SettingsPage({
  selectedSectionId,
  onControlSelect,
  onUserSelect,
}: SettingsPageProps) {
  const {
    settings: _settings,
    metadata,
    loading,
    error,
    hasUnsavedChanges,
    saving,
    getSetting,
    updateSetting,
    applyChanges,
    revertChanges,
    resetSetting,
    getEffectiveValue,
    hasUnsavedChange,
  } = useSettings();

  const { user } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const [historyControlId, setHistoryControlId] = useState<string | null>(null);

  // Fetch history for the selected control (or null if none selected)
  const {
    history: changeHistory,
    loading: historyLoading,
    error: historyError,
  } = useSettingHistory(showHistory ? historyControlId : null);

  // Parse selected section from ID
  const { categoryId, sectionId } = useMemo(() => {
    if (!selectedSectionId) return { categoryId: null, sectionId: null };

    // Format: section_categoryId_sectionId or category_categoryId
    const parts = selectedSectionId.split('_');
    if (parts[0] === 'section' && parts.length >= 3) {
      return {
        categoryId: parts[1],
        sectionId: parts.slice(2).join('_'),
      };
    }
    if (parts[0] === 'category' && parts.length >= 2) {
      return {
        categoryId: parts[1],
        sectionId: null,
      };
    }
    return { categoryId: null, sectionId: null };
  }, [selectedSectionId]);

  // Get selected category and section
  const selectedCategory = useMemo(() => {
    if (!categoryId) return null;
    return SETTINGS_REGISTRY.find((cat) => cat.id === categoryId);
  }, [categoryId]);

  const selectedSection = useMemo(() => {
    if (!selectedCategory || !sectionId) return null;
    return selectedCategory.sections.find((sec) => sec.id === sectionId);
  }, [selectedCategory, sectionId]);

  // Get controls to display
  const controls = useMemo(() => {
    if (selectedSection) {
      return selectedSection.controls;
    }
    if (selectedCategory) {
      // Show all controls from all sections in category
      return selectedCategory.sections.flatMap((sec) => sec.controls);
    }
    return [];
  }, [selectedCategory, selectedSection]);

  // Handle setting change (live preview)
  const handleChange = (controlId: string, value: any) => {
    updateSetting(controlId, value);
  };

  // Handle setting reset
  const handleReset = (controlId: string) => {
    resetSetting(controlId);
  };

  // Handle apply all changes
  const handleApplyChanges = async () => {
    await applyChanges();
  };

  // Handle discard all changes
  const handleDiscardChanges = () => {
    revertChanges();
  };

  const exportFormatValue = (getEffectiveValue('export_format') as string | undefined) ?? 'json';

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin" />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-red-600/10 border border-red-500/30 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-300 mb-1">Failed to load settings</h3>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Debug logging
  console.log('[SettingsPage] Debug state:', {
    selectedSectionId,
    categoryId,
    sectionId,
    selectedCategory: selectedCategory?.id,
    selectedSection: selectedSection?.id,
    controlsLength: controls.length,
    controls: controls.map((c) => c.id),
  });

  // No section selected
  if (!selectedSectionId || controls.length === 0) {
    console.log('[SettingsPage] No section or controls, showing empty state');
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-2">No settings section selected</p>
          <p className="text-sm text-slate-500">
            Select a section from the navigation to view settings
          </p>
          <div className="mt-4 p-4 bg-slate-800 rounded-lg text-xs text-left text-slate-400">
            <p>
              <strong>Debug Info:</strong>
            </p>
            <p>Selected Section ID: {selectedSectionId || 'none'}</p>
            <p>Category ID: {categoryId || 'none'}</p>
            <p>Section ID: {sectionId || 'none'}</p>
            <p>Controls Count: {controls.length}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Sticky header with unsaved changes bar */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        {/* Title and metadata */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {selectedSection?.label || selectedCategory?.label || 'Settings'}
              </h1>
              {selectedSection?.description && (
                <p className="text-sm text-slate-400 mt-1">{selectedSection.description}</p>
              )}
              {metadata && (
                <p className="text-xs text-slate-500 mt-2">
                  {metadata.permissionLevel} • {metadata.accountId}
                </p>
              )}
            </div>

            {/* History button */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <History className="w-4 h-4" />
              History
            </button>
          </div>
        </div>

        {/* Unsaved changes bar */}
        {hasUnsavedChanges && (
          <div className="px-6 py-3 bg-yellow-600/10 border-t border-yellow-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-yellow-300">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">You have unsaved changes</span>
                <span className="text-yellow-400/70">Changes are previewed but not saved</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscardChanges}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Revert
                </button>
                <button
                  onClick={handleApplyChanges}
                  disabled={saving}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Apply Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings cards */}
      <div className="p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Special handling for data management sections */}
          {sectionId === 'management' && categoryId === 'data' && <DataManagementCard />}

          {sectionId === 'admin_management' &&
            categoryId === 'data' &&
            user?.accountType === 'admin' && <AdminDataManagementCard />}

          {/* Special handling for users section */}
          {sectionId === 'users' && categoryId === 'account' && (
            <UsersListCard onUserSelect={onUserSelect} />
          )}

          {/* Special handling for privacy/error tracking section */}
          {sectionId === 'privacy' && categoryId === 'security' && <ErrorTrackingCard />}

          {/* Special handling for deduplication section */}
          {sectionId === 'deduplication' && categoryId === 'data' && <DeduplicationCard />}

          {/* Special handling for export data section */}
          {sectionId === 'export' && categoryId === 'import_export' && (
            <ExportDataCard exportFormat={exportFormatValue} />
          )}

          {/* Special handling for API keys (BYOK) section */}
          {sectionId === 'api_keys' && categoryId === 'integrations' && <ApiKeysPanel />}

          {/* Debug modals inventory */}
          {sectionId === 'modals' && categoryId === 'debug' && user?.accountType === 'admin' && (
            <DebugModalsCard />
          )}

          {/* Regular settings controls */}
          {sectionId !== 'management' &&
            sectionId !== 'admin_management' &&
            sectionId !== 'users' &&
            sectionId !== 'privacy' &&
            sectionId !== 'deduplication' &&
            sectionId !== 'modals' &&
            sectionId !== 'api_keys' &&
            controls
              .filter(
                (control) =>
                  control.id !== 'clear_keimenon_data' && control.id !== 'clear_all_client_data'
              )
              .map((control) => {
                const effectiveSetting = getSetting(control.id);
                if (!effectiveSetting) return null;

                // Apply unsaved changes to effective value
                const previewValue = getEffectiveValue(control.id);
                const hasLocalChange = hasUnsavedChange(control.id);

                return (
                  <div
                    key={control.id}
                    className={hasLocalChange ? 'ring-2 ring-yellow-500/50 rounded-lg' : ''}
                    onClick={() => {
                      onControlSelect?.(control.id);
                      if (showHistory) setHistoryControlId(control.id);
                    }}
                  >
                    <SettingsCard
                      control={control}
                      effectiveValue={{
                        ...effectiveSetting,
                        value: previewValue,
                      }}
                      onChange={(value) => handleChange(control.id, value)}
                      onReset={() => handleReset(control.id)}
                    />
                  </div>
                );
              })}
        </div>

        {/* Footer info */}
        <div className="max-w-5xl mx-auto mt-6">
          <div className="flex items-start gap-2 px-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Settings Management</p>
              <p className="text-blue-400/80">
                Settings changes are previewed in real-time. Click "Apply Changes" to save them
                permanently. Some settings may require a page refresh or restart to take effect.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto z-50">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Change History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope info */}
            {historyControlId ? (
              <p className="text-xs text-slate-500 mb-4">
                Showing history for{' '}
                <span className="text-purple-400 font-medium">{historyControlId}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mb-4">
                Click a setting to view its change history.
              </p>
            )}

            {/* Quick filter: clickable controls from current section */}
            {controls.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1">
                {controls.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setHistoryControlId(c.id)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      historyControlId === c.id
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {/* Loading state */}
            {historyLoading && historyControlId && (
              <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading history…</span>
              </div>
            )}

            {/* Error state */}
            {historyError && (
              <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{historyError}</p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!historyLoading && !historyError && historyControlId && changeHistory.length === 0 && (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No changes recorded yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Changes will appear here after you modify this setting.
                </p>
              </div>
            )}

            {/* Timeline */}
            {!historyLoading && changeHistory.length > 0 && (
              <div className="space-y-3">
                {changeHistory.map((change: SettingChange) => (
                  <div
                    key={change.id}
                    className="relative bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 hover:border-slate-600/60 transition-colors"
                  >
                    {/* Timestamp */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(change.changedAt).toLocaleString()}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">
                        {change.scope}
                      </span>
                    </div>

                    {/* Value change */}
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className="px-2 py-0.5 bg-red-600/10 border border-red-500/20 rounded text-red-300 text-xs font-mono max-w-[120px] truncate"
                        title={String(change.oldValue)}
                      >
                        {change.oldValue === null || change.oldValue === undefined
                          ? '(default)'
                          : String(change.oldValue)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                      <span
                        className="px-2 py-0.5 bg-green-600/10 border border-green-500/20 rounded text-green-300 text-xs font-mono max-w-[120px] truncate"
                        title={String(change.newValue)}
                      >
                        {String(change.newValue)}
                      </span>
                    </div>

                    {/* Changed by */}
                    {change.changedBy && (
                      <p
                        className="text-[10px] text-slate-600 mt-1.5 truncate"
                        title={change.changedBy}
                      >
                        by {change.changedBy}
                      </p>
                    )}

                    {/* Reason */}
                    {change.reason && (
                      <p className="text-xs text-slate-500 mt-1 italic">{change.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
