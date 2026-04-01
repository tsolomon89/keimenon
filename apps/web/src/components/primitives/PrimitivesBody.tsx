'use client';

import { useState, useEffect } from 'react';
import { useShell } from '@/contexts/ShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { Bar, List, Tile, PrimitiveCard as Card, Text, Viewer } from '@keimenon/ui';
import { SETTINGS_SECTIONS } from '../specs/settings.spec';
import { fetchSettings, getAnalyticsOverview } from '@/lib/api-client';
import { Users, Database, Building2 } from 'lucide-react';

/**
 * PrimitivesBody - New UI architecture using nine primitives
 *
 * This component replaces the old viewport structure with a clean
 * primitives-based architecture:
 * - Bar (left): Navigation
 * - Viewer (center): Content based on keimenonMode
 * - Bar (right): Inspector
 *
 * Mode handling:
 * - keimenonMode determines what Viewer shows
 * - shellMode + operatingMode determine Bar configurations
 * - No conditional branching in render tree (mode is data, not structure)
 */
export function PrimitivesBody() {
  const { shellMode, keimenonMode } = useShell();
  const { user } = useAuth();
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [viewerData, setViewerData] = useState<any>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Load data based on keimenon mode and selected section
  useEffect(() => {
    loadViewerData();
  }, [keimenonMode, selectedSection, user]);

  async function loadViewerData() {
    setViewerLoading(true);
    try {
      if (keimenonMode === 'settings' && selectedSection && user?.accountId) {
        const settingsPayload = await fetchSettings(user.accountId);
        const sectionConfig = Object.values(SETTINGS_SECTIONS).find(
          (s) => s.id === selectedSection
        );
        const fieldKeys = sectionConfig?.fields || [];
        const settings = settingsPayload?.settings || {};
        const sectionData = fieldKeys.reduce((accumulator: Record<string, unknown>, key) => {
          if (settings[key]) {
            accumulator[key] = settings[key];
          }
          return accumulator;
        }, {});

        setViewerData({ [selectedSection]: sectionData });
      } else if (keimenonMode === 'dashboard') {
        const overview = await getAnalyticsOverview();
        setViewerData([
          {
            title: 'Active Accounts',
            value: overview.accounts.active.toLocaleString(),
            subtitle: `${overview.accounts.total_seats.toLocaleString()} seats`,
          },
          {
            title: 'Active (7d)',
            value: overview.user_activity.last_7_days.toLocaleString(),
            subtitle: `${overview.user_activity.avg_session_time_minutes} min avg session`,
          },
          {
            title: 'Nodes',
            value: overview.storage.total_nodes.toLocaleString(),
            subtitle: `${overview.storage.total_edges.toLocaleString()} edges`,
          },
        ]);
      } else {
        setViewerData(null);
      }
    } catch (error) {
      console.error('Failed to load viewer data:', error);
      setViewerData(null);
    } finally {
      setViewerLoading(false);
    }
  }

  // Navigation items based on keimenon mode
  const getNavigationItems = () => {
    if (keimenonMode === 'settings') {
      return Object.values(SETTINGS_SECTIONS);
    }
    if (keimenonMode === 'dashboard') {
      return [
        { id: 'overview', label: 'Overview', icon: Database },
        { id: 'users', label: 'Users', icon: Users },
        { id: 'accounts', label: 'Accounts', icon: Building2 },
      ];
    }
    return [];
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Bar - Navigation */}
      <Bar
        mode="navigation"
        position="left"
        title={
          keimenonMode === 'settings'
            ? 'Settings'
            : keimenonMode === 'dashboard'
              ? 'Dashboard'
              : 'Navigation'
        }
        width="280px"
      >
        <div className="p-4">
          <List
            items={getNavigationItems()}
            layout="vertical"
            gap="sm"
            renderItem={(item) => (
              <Tile
                title={item.label}
                icon={item.icon}
                iconColor={selectedSection === item.id ? 'purple' : 'slate'}
                selected={selectedSection === item.id}
                onClick={() => setSelectedSection(item.id)}
              />
            )}
            emptyState={{
              message: 'No navigation items available',
            }}
          />

          {/* Debug info */}
          <Card variant="info" className="mt-6">
            <Text role="label" className="mb-2">
              Debug Info
            </Text>
            <div className="space-y-1">
              <Text role="hint">Shell: {shellMode}</Text>
              <Text role="hint">Keimenon: {keimenonMode}</Text>
              <Text role="hint">Section: {selectedSection || 'none'}</Text>
            </div>
          </Card>
        </div>
      </Bar>

      {/* Center Viewer - Main Content */}
      <Viewer mode={keimenonMode as any} data={viewerData} loading={viewerLoading} />

      {/* Right Bar - Inspector */}
      <Bar mode="inspector" position="right" title="Details" width="320px">
        <div className="p-4">
          {selectedSection ? (
            <Card title="Selection">
              <Text role="label" className="mb-2">
                Selected Section
              </Text>
              <Text role="value">{selectedSection}</Text>
            </Card>
          ) : (
            <Card variant="subtle">
              <Text role="hint" mode="muted" className="text-center">
                Select an item to view details
              </Text>
            </Card>
          )}
        </div>
      </Bar>
    </div>
  );
}
