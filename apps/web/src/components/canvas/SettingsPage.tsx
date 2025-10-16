'use client';

import { useState } from 'react';
import { User, Building2, Globe, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionButton } from '@/components/common/PermissionGate';

interface SettingCardProps {
  title: string;
  description: string;
  value: string | number | boolean;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  onChange: (value: any) => void;
  disabled?: boolean;
}

function SettingCard({ title, description, value, type, options, onChange, disabled }: SettingCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>

      {type === 'boolean' && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
          />
          <span className="text-sm text-slate-300">{value ? 'Enabled' : 'Disabled'}</span>
        </label>
      )}

      {type === 'text' && (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
        />
      )}

      {type === 'number' && (
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
        />
      )}

      {type === 'select' && options && (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { isAdmin, rank, getRankName, checkPermission } = usePermissions();
  const [selectedSection, _setSelectedSection] = useState<string>('user-profile');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Mock settings state (in real app, fetch from backend)
  const [userSettings, setUserSettings] = useState({
    displayName: 'Admin User',
    email: 'admin@admin.com',
    notifications: true,
    theme: 'dark',
  });

  const [accountSettings, setAccountSettings] = useState({
    accountName: 'Admin Account',
    maxNodes: 10000,
    retentionDays: 90,
    enableAudit: true,
  });

  const [globalSettings, setGlobalSettings] = useState({
    defaultTier: 'free',
    maxUploadSize: 10,
    enableRegistration: false,
  });

  const handleSaveChanges = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setHasChanges(false);
  };

  const handleDiscardChanges = () => {
    setHasChanges(false);
    // Reset to original values (in real app, refetch from backend)
  };

  // Render settings based on selected section
  const renderSettings = () => {
    switch (selectedSection) {
      case 'user-profile':
        return (
          <div className="space-y-4">
            <SettingCard
              title="Display Name"
              description="Your name as it appears to other users"
              value={userSettings.displayName}
              type="text"
              onChange={(value) => {
                setUserSettings({ ...userSettings, displayName: value });
                setHasChanges(true);
              }}
            />
            <SettingCard
              title="Email"
              description="Your email address for notifications"
              value={userSettings.email}
              type="text"
              onChange={(value) => {
                setUserSettings({ ...userSettings, email: value });
                setHasChanges(true);
              }}
            />
            <SettingCard
              title="Notifications"
              description="Receive email notifications for important events"
              value={userSettings.notifications}
              type="boolean"
              onChange={(value) => {
                setUserSettings({ ...userSettings, notifications: value });
                setHasChanges(true);
              }}
            />
          </div>
        );

      case 'user-preferences':
        return (
          <div className="space-y-4">
            <SettingCard
              title="Theme"
              description="Choose your preferred color theme"
              value={userSettings.theme}
              type="select"
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'auto', label: 'Auto' },
              ]}
              onChange={(value) => {
                setUserSettings({ ...userSettings, theme: value });
                setHasChanges(true);
              }}
            />
          </div>
        );

      case 'account-billing':
        const canEditAccount = checkPermission('edit_account_settings');
        return (
          <div className="space-y-4">
            <SettingCard
              title="Account Name"
              description="The name of your account"
              value={accountSettings.accountName}
              type="text"
              onChange={(value) => {
                setAccountSettings({ ...accountSettings, accountName: value });
                setHasChanges(true);
              }}
              disabled={!canEditAccount.allowed}
            />
            <SettingCard
              title="Max Nodes"
              description="Maximum number of nodes allowed in your account"
              value={accountSettings.maxNodes}
              type="number"
              onChange={(value) => {
                setAccountSettings({ ...accountSettings, maxNodes: value });
                setHasChanges(true);
              }}
              disabled={!canEditAccount.allowed}
            />
            {!canEditAccount.allowed && (
              <div className="flex items-center gap-2 px-3 py-2 bg-yellow-600/10 border border-yellow-500/30 rounded text-sm text-yellow-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{canEditAccount.reason}</span>
              </div>
            )}
          </div>
        );

      case 'account-members':
        return (
          <div className="space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Team Members</h3>
              <p className="text-sm text-slate-400">Member management coming soon...</p>
            </div>
          </div>
        );

      case 'global-defaults':
        const canEditGlobal = checkPermission('edit_global_settings');
        return (
          <div className="space-y-4">
            <SettingCard
              title="Default Tier"
              description="Default tier for new accounts"
              value={globalSettings.defaultTier}
              type="select"
              options={[
                { value: 'free', label: 'Free' },
                { value: 'professional', label: 'Professional' },
                { value: 'business', label: 'Business' },
              ]}
              onChange={(value) => {
                setGlobalSettings({ ...globalSettings, defaultTier: value });
                setHasChanges(true);
              }}
              disabled={!canEditGlobal.allowed}
            />
            <SettingCard
              title="Max Upload Size (MB)"
              description="Maximum file upload size in megabytes"
              value={globalSettings.maxUploadSize}
              type="number"
              onChange={(value) => {
                setGlobalSettings({ ...globalSettings, maxUploadSize: value });
                setHasChanges(true);
              }}
              disabled={!canEditGlobal.allowed}
            />
            {!canEditGlobal.allowed && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{canEditGlobal.reason}</span>
              </div>
            )}
          </div>
        );

      case 'global-policies':
        return (
          <div className="space-y-4">
            <SettingCard
              title="Enable Registration"
              description="Allow new users to register accounts"
              value={globalSettings.enableRegistration}
              type="boolean"
              onChange={(value) => {
                setGlobalSettings({ ...globalSettings, enableRegistration: value });
                setHasChanges(true);
              }}
              disabled={!checkPermission('edit_global_settings').allowed}
            />
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-slate-500">Select a setting category</p>
          </div>
        );
    }
  };

  const getSectionTitle = () => {
    const titles: Record<string, string> = {
      'user-profile': 'User Profile',
      'user-preferences': 'Preferences',
      'account-billing': 'Billing & Limits',
      'account-members': 'Team Members',
      'global-defaults': 'Global Defaults',
      'global-policies': 'Global Policies',
    };
    return titles[selectedSection] || 'Settings';
  };

  const getSectionIcon = () => {
    if (selectedSection.startsWith('user-')) return User;
    if (selectedSection.startsWith('account-')) return Building2;
    if (selectedSection.startsWith('global-')) return Globe;
    return User;
  };

  const Icon = getSectionIcon();

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className="w-6 h-6 text-purple-400" />
            <div>
              <h1 className="text-2xl font-bold">{getSectionTitle()}</h1>
              <p className="text-sm text-slate-400 mt-1">
                {isAdmin ? `Admin (${getRankName(rank)})` : `User (${getRankName(rank)})`}
              </p>
            </div>
          </div>

          {hasChanges && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <X className="w-4 h-4" />
                Discard
              </button>
              <PermissionButton
                permission="edit_account_settings"
                onClick={handleSaveChanges}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </PermissionButton>
            </div>
          )}
        </div>

        {/* Settings Cards */}
        {renderSettings()}

        {/* Footer Info */}
        <div className="flex items-start gap-2 px-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Settings Management</p>
            <p className="text-blue-400/80">
              Changes are applied immediately. Global settings (admin only) affect all accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
