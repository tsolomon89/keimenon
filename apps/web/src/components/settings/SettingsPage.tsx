'use client';

import { useState, useMemo } from 'react';
import { Save, X, AlertCircle, CheckCircle, History } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { SettingsCard } from './SettingsCard';
import {
  SETTINGS_REGISTRY,
} from '@canvas-memory/types/src/settings';

interface SettingsPageProps {
  selectedSectionId?: string; // section_categoryId_sectionId from navigation
  onControlSelect?: (controlId: string) => void;
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
export function SettingsPage({ selectedSectionId, onControlSelect }: SettingsPageProps) {
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

  const [showHistory, setShowHistory] = useState(false);

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
              <h3 className="text-sm font-semibold text-red-300 mb-1">
                Failed to load settings
              </h3>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No section selected
  if (!selectedSectionId || controls.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-2">No settings section selected</p>
          <p className="text-sm text-slate-500">
            Select a section from the navigation to view settings
          </p>
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
                <p className="text-sm text-slate-400 mt-1">
                  {selectedSection.description}
                </p>
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
                <span className="text-yellow-400/70">
                  Changes are previewed but not saved
                </span>
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
      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {controls.map((control) => {
            const effectiveSetting = getSetting(control.id);
            if (!effectiveSetting) return null;

            // Apply unsaved changes to effective value
            const previewValue = getEffectiveValue(control.id);
            const hasLocalChange = hasUnsavedChange(control.id);

            return (
              <div
                key={control.id}
                className={hasLocalChange ? 'ring-2 ring-yellow-500/50 rounded-lg' : ''}
                onClick={() => onControlSelect?.(control.id)}
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

      {/* History panel (TODO: implement) */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto">
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
            <p className="text-sm text-slate-400">History view coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
}
