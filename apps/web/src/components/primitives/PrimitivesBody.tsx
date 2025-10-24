'use client';

import { useState, useEffect } from 'react';
import { useShell } from '@/contexts/ShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { Bar } from './Bar';
import { Viewer } from './Viewer';
import { List } from './List';
import { Card } from './Card';
import { Tile } from './Tile';
import { Text } from './Text';
import { UsersAdapter } from '../adapters/UsersAdapter';
import { SETTINGS_SECTIONS } from '../specs/settings.spec';
import { Settings, Users, Database, Building2 } from 'lucide-react';

/**
 * PrimitivesBody - New UI architecture using nine primitives
 *
 * This component replaces the old viewport structure with a clean
 * primitives-based architecture:
 * - Bar (left): Navigation
 * - Viewer (center): Content based on canvasMode
 * - Bar (right): Inspector
 *
 * Mode handling:
 * - canvasMode determines what Viewer shows
 * - shellMode + operatingMode determine Bar configurations
 * - No conditional branching in render tree (mode is data, not structure)
 */
export function PrimitivesBody() {
  const { shellMode, canvasMode } = useShell();
  const { user } = useAuth();
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [viewerData, setViewerData] = useState<any>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Load data based on canvas mode and selected section
  useEffect(() => {
    loadViewerData();
  }, [canvasMode, selectedSection, user]);

  async function loadViewerData() {
    setViewerLoading(true);
    try {
      if (canvasMode === 'settings' && selectedSection) {
        // Load settings data for selected section
        const sectionConfig = Object.values(SETTINGS_SECTIONS).find(
          (s) => s.id === selectedSection
        );
        if (sectionConfig) {
          // Mock settings data
          setViewerData({
            [selectedSection]: {
              // This would come from an actual settings API
              example: 'Settings data would be loaded here',
            },
          });
        }
      } else if (canvasMode === 'dashboard') {
        // Mock dashboard metrics
        setViewerData([
          { title: 'Total Users', value: '1,234', subtitle: '+12% this month' },
          { title: 'Active Sessions', value: '456', subtitle: 'Currently online' },
          { title: 'Storage Used', value: '78 GB', subtitle: '22 GB remaining' },
        ]);
      }
    } catch (error) {
      console.error('Failed to load viewer data:', error);
    } finally {
      setViewerLoading(false);
    }
  }

  // Navigation items based on canvas mode
  const getNavigationItems = () => {
    if (canvasMode === 'settings') {
      return Object.values(SETTINGS_SECTIONS);
    }
    if (canvasMode === 'dashboard') {
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
          canvasMode === 'settings'
            ? 'Settings'
            : canvasMode === 'dashboard'
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
              <Text role="hint">Canvas: {canvasMode}</Text>
              <Text role="hint">Section: {selectedSection || 'none'}</Text>
            </div>
          </Card>
        </div>
      </Bar>

      {/* Center Viewer - Main Content */}
      <Viewer mode={canvasMode as any} data={viewerData} loading={viewerLoading} />

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
