import { useState, useEffect, useCallback, useRef } from 'react';
import { getToken } from '../contexts/AuthContext';
import { SettingControl, EffectiveSettingValue, SettingChange } from '@keimenon/types/src/settings';
import { errorCapture } from '@/services/error-capture.service';
import { API_BASE_URL } from '@/lib/env.config';
import { authenticatedFetch } from '@/lib/api-client';

interface SettingsData {
  [controlId: string]: EffectiveSettingValue;
}

interface SettingsMetadata {
  accountId: string;
  userId: string;
  permissionLevel: string;
  timestamp: number;
}

async function getResponseErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({}) as Record<string, unknown>);
  const baseMessage =
    typeof payload?.error === 'string' && payload.error.trim().length > 0
      ? payload.error
      : fallback;

  if (payload?.code === 'SETTINGS_SCHEMA_DRIFT') {
    const remediation = (payload as any)?.diagnostics?.remediation;
    if (typeof remediation === 'string' && remediation.trim().length > 0) {
      return `${baseMessage}. ${remediation}`;
    }
  }

  return baseMessage;
}

/**
 * useSettings Hook
 *
 * Manages settings state and API interactions:
 * - Fetches all settings with effective values
 * - Updates individual settings
 * - Resets settings to defaults
 * - Tracks unsaved changes
 * - Provides live preview functionality
 */
export function useSettings() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [metadata, setMetadata] = useState<SettingsMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch all settings
  const fetchSettings = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setSettings({});
      setMetadata(null);
      setLoading(false);
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      // Add timeout to prevent hanging
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const message = await getResponseErrorMessage(
          response,
          `Failed to fetch settings (${response.status})`
        );
        throw new Error(message);
      }

      const data = await response.json();

      if (!data.success || !data.settings) {
        throw new Error('Invalid settings response');
      }

      setSettings(data.settings);
      setMetadata(data.metadata);
    } catch (err: any) {
      // Ignore abort errors (from timeout or component unmount)
      if (err.name === 'AbortError') {
        console.debug('[useSettings] Fetch aborted');
        return;
      }

      console.error('Error fetching settings:', err);

      // Capture error for console display
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'api',
          operation: 'settings.fetchAll',
          metadata: {
            component: 'useSettings',
            endpoint: '/api/v1/settings',
          },
        },
        'error'
      );

      const userMessage = capturedError.userMessage || err.message || 'Failed to load settings';
      setError(userMessage);
      setSettings({});
      setMetadata(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch settings on mount and cleanup on unmount
  useEffect(() => {
    fetchSettings();

    return () => {
      // Abort any pending request when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchSettings]);

  // Get specific setting
  const getSetting = useCallback(
    (controlId: string): EffectiveSettingValue | undefined => {
      return settings[controlId];
    },
    [settings]
  );

  // Update setting value (local state only, not saved yet)
  const updateSetting = useCallback((controlId: string, value: any) => {
    setUnsavedChanges((prev) => ({
      ...prev,
      [controlId]: value,
    }));
  }, []);

  // Apply all unsaved changes
  const applyChanges = useCallback(async () => {
    const token = getToken();
    if (!token || Object.keys(unsavedChanges).length === 0) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Save each changed setting
      const promises = Object.entries(unsavedChanges).map(async ([controlId, value]) => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/${controlId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value }),
        });

        if (!response.ok) {
          const message = await getResponseErrorMessage(response, 'Failed to update setting');
          throw new Error(message);
        }

        return response.json();
      });

      await Promise.all(promises);

      // Refetch settings to get updated effective values
      await fetchSettings();

      // Clear unsaved changes
      setUnsavedChanges({});
    } catch (err: any) {
      console.error('Error applying changes:', err);

      // Capture error for console display
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'api',
          operation: 'settings.applyChanges',
          metadata: {
            component: 'useSettings',
            changedSettings: Object.keys(unsavedChanges),
          },
        },
        'error'
      );

      const userMessage = capturedError.userMessage || err.message || 'Failed to save settings';
      setError(userMessage);
    } finally {
      setSaving(false);
    }
  }, [unsavedChanges, fetchSettings]);

  // Revert all unsaved changes
  const revertChanges = useCallback(() => {
    setUnsavedChanges({});
  }, []);

  // Reset specific setting to default
  const resetSetting = useCallback(
    async (controlId: string) => {
      const token = getToken();
      if (!token) return;

      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/${controlId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const message = await getResponseErrorMessage(response, 'Failed to reset setting');
          throw new Error(message);
        }

        // Refetch settings
        await fetchSettings();

        // Remove from unsaved changes if present
        setUnsavedChanges((prev) => {
          const next = { ...prev };
          delete next[controlId];
          return next;
        });
      } catch (err: any) {
        console.error('Error resetting setting:', err);

        // Capture error for console display
        const capturedError = errorCapture.capture(
          err,
          {
            domain: 'api',
            operation: 'settings.reset',
            metadata: {
              component: 'useSettings',
              controlId,
            },
          },
          'error'
        );

        const userMessage = capturedError.userMessage || err.message || 'Failed to reset setting';
        setError(userMessage);
      }
    },
    [fetchSettings]
  );

  // Get effective value for control (with unsaved changes applied)
  const getEffectiveValue = useCallback(
    (controlId: string): any => {
      // Check unsaved changes first
      if (controlId in unsavedChanges) {
        return unsavedChanges[controlId];
      }

      // Return saved effective value
      return settings[controlId]?.value;
    },
    [settings, unsavedChanges]
  );

  // Check if setting has unsaved changes
  const hasUnsavedChange = useCallback(
    (controlId: string): boolean => {
      return controlId in unsavedChanges;
    },
    [unsavedChanges]
  );

  return {
    settings,
    metadata,
    loading,
    error,
    unsavedChanges,
    hasUnsavedChanges: Object.keys(unsavedChanges).length > 0,
    saving,
    getSetting,
    updateSetting,
    applyChanges,
    revertChanges,
    resetSetting,
    getEffectiveValue,
    hasUnsavedChange,
    refetch: fetchSettings,
  };
}

/**
 * useSettingHistory Hook
 *
 * Fetches change history for a specific setting
 */
export function useSettingHistory(controlId: string | null) {
  const [history, setHistory] = useState<SettingChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      const token = getToken();
      if (!token || !controlId) {
        setHistory([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await authenticatedFetch(
          `${API_BASE_URL}/api/v1/settings/history/${controlId}`
        );

        if (!response.ok) {
          const message = await getResponseErrorMessage(response, 'Failed to fetch history');
          throw new Error(message);
        }

        const data = await response.json();

        if (!data.success || !data.history) {
          throw new Error('Invalid history response');
        }

        setHistory(data.history);
      } catch (err: any) {
        console.error('Error fetching history:', err);

        // Capture error for console display
        const capturedError = errorCapture.capture(
          err,
          {
            domain: 'api',
            operation: 'settings.fetchHistory',
            metadata: {
              component: 'useSettingHistory',
              controlId,
            },
          },
          'error'
        );

        const userMessage = capturedError.userMessage || err.message || 'Failed to load history';
        setError(userMessage);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [controlId]);

  return { history, loading, error };
}

/**
 * useSettingDetails Hook
 *
 * Fetches full details for a specific setting including control definition and history
 */
export function useSettingDetails(controlId: string | null) {
  const [control, setControl] = useState<SettingControl | null>(null);
  const [effectiveValue, setEffectiveValue] = useState<any>(null);
  const [source, setSource] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [history, setHistory] = useState<SettingChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      const token = getToken();
      if (!token || !controlId) {
        resetState();
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/${controlId}`);

        if (!response.ok) {
          const message = await getResponseErrorMessage(
            response,
            'Failed to fetch setting details'
          );
          throw new Error(message);
        }

        const data = await response.json();

        if (!data.success || !data.setting) {
          throw new Error('Invalid setting response');
        }

        setControl(data.setting.control);
        setEffectiveValue(data.setting.effectiveValue);
        setSource(data.setting.source);
        setCanEdit(data.setting.canEdit);
        setCanReset(data.setting.canReset);
        setIsDefault(data.setting.isDefault);
        setHistory(data.history || []);
      } catch (err: any) {
        console.error('Error fetching setting details:', err);

        // Capture error for console display
        const capturedError = errorCapture.capture(
          err,
          {
            domain: 'api',
            operation: 'settings.fetchDetails',
            metadata: {
              component: 'useSettingDetails',
              controlId,
            },
          },
          'error'
        );

        const userMessage = capturedError.userMessage || err.message || 'Failed to load setting';
        setError(userMessage);
        resetState();
      } finally {
        setLoading(false);
      }
    }

    fetchDetails();
  }, [controlId]);

  function resetState() {
    setControl(null);
    setEffectiveValue(null);
    setSource(null);
    setCanEdit(false);
    setCanReset(false);
    setIsDefault(false);
    setHistory([]);
  }

  return {
    control,
    effectiveValue,
    source,
    canEdit,
    canReset,
    isDefault,
    history,
    loading,
    error,
  };
}
