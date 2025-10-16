import { useState, useEffect } from 'react';
import { TreeNode } from '../components/common/NavigationBar';
import { getToken, useAuth } from '../contexts/AuthContext';
import {
  SettingCategory,
  SettingSection,
  SettingControl,
} from '@canvas-memory/types/src/settings';
import * as Icons from 'lucide-react';

/**
 * useSettingsTree Hook
 *
 * Fetches settings registry from API and transforms to TreeNode format
 * for use in NavigationBar component. Automatically filters based on
 * user permissions (returned from backend).
 */
export function useSettingsTree() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettingsRegistry() {
      const token = getToken();
      if (!token) {
        setTree([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
        const response = await fetch(`${API_BASE_URL}/api/v1/settings/registry/all`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch settings registry');
        }

        const data = await response.json();

        if (!data.success || !data.registry) {
          throw new Error('Invalid registry response');
        }

        // Transform registry to TreeNode[]
        const treeNodes = transformRegistryToTree(data.registry);
        setTree(treeNodes);
      } catch (err: any) {
        console.error('Error fetching settings registry:', err);
        setError(err.message || 'Failed to load settings');
        setTree([]);
      } finally {
        setLoading(false);
      }
    }

    fetchSettingsRegistry();
  }, []);

  return { tree, loading, error };
}

/**
 * Transform SettingCategory[] to TreeNode[]
 */
function transformRegistryToTree(registry: SettingCategory[]): TreeNode[] {
  return registry
    .sort((a, b) => a.order - b.order)
    .map((category) => transformCategoryToNode(category));
}

/**
 * Transform SettingCategory to TreeNode
 */
function transformCategoryToNode(category: SettingCategory): TreeNode {
  const Icon = getIconComponent(category.icon);

  return {
    id: `category_${category.id}`,
    label: category.label,
    type: 'folder',
    icon: Icon,
    children: category.sections
      .sort((a, b) => a.order - b.order)
      .map((section) => transformSectionToNode(section, category.id)),
    metadata: {
      categoryId: category.id,
      adminOnly: category.adminOnly,
    },
  };
}

/**
 * Transform SettingSection to TreeNode
 */
function transformSectionToNode(
  section: SettingSection,
  categoryId: string
): TreeNode {
  const Icon = section.icon ? getIconComponent(section.icon) : undefined;

  // If section has subsections, it's a folder node
  if (section.subsections && section.subsections.length > 0) {
    return {
      id: `section_${categoryId}_${section.id}`,
      label: section.label,
      type: 'folder',
      icon: Icon,
      children: [
        // Controls in this section
        ...section.controls.map((control) =>
          transformControlToNode(control, categoryId, section.id)
        ),
        // Subsections
        ...section.subsections
          .sort((a, b) => a.order - b.order)
          .map((subsection) => transformSectionToNode(subsection, categoryId)),
      ],
      metadata: {
        categoryId,
        sectionId: section.id,
        adminOnly: section.adminOnly,
        description: section.description,
      },
    };
  }

  // Section is a file node (represents a group of controls)
  return {
    id: `section_${categoryId}_${section.id}`,
    label: section.label,
    type: 'file',
    icon: Icon,
    metadata: {
      categoryId,
      sectionId: section.id,
      adminOnly: section.adminOnly,
      description: section.description,
      controlCount: section.controls.length,
      controls: section.controls.map((c) => c.id),
    },
  };
}

/**
 * Transform SettingControl to TreeNode
 * (Only used when section has both controls and subsections)
 */
function transformControlToNode(
  control: SettingControl,
  categoryId: string,
  sectionId: string
): TreeNode {
  return {
    id: `control_${control.id}`,
    label: control.label,
    type: 'file',
    metadata: {
      categoryId,
      sectionId,
      controlId: control.id,
      adminOnly: control.adminOnly,
      description: control.description,
    },
  };
}

/**
 * Map icon name to Lucide icon component
 */
function getIconComponent(iconName: string): React.ComponentType<any> {
  // Map common icon names to Lucide components
  const iconMap: Record<string, React.ComponentType<any>> = {
    Settings: Icons.Settings,
    Palette: Icons.Palette,
    LayoutGrid: Icons.LayoutGrid,
    Building2: Icons.Building2,
    Database: Icons.Database,
    Plug: Icons.Plug,
    Bell: Icons.Bell,
    Shield: Icons.Shield,
    Download: Icons.Download,
    Wrench: Icons.Wrench,
    User: Icons.User,
    Users: Icons.Users,
    Lock: Icons.Lock,
    Key: Icons.Key,
    Mail: Icons.Mail,
    Globe: Icons.Globe,
    Zap: Icons.Zap,
    Clock: Icons.Clock,
    File: Icons.File,
    Folder: Icons.Folder,
    FolderOpen: Icons.FolderOpen,
  };

  return iconMap[iconName] || Icons.Settings;
}
