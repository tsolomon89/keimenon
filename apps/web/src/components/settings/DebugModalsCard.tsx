'use client';

import { useMemo } from 'react';
import { ShieldAlert, Activity, Archive, FolderOpen } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type ModalStatus = 'active' | 'legacy' | 'orphaned' | 'archived' | 'quarantined';

interface ModalInfo {
  name: string;
  path: string;
  status: ModalStatus;
  description: string;
  integration: string;
}

const STATUS_LABELS: Record<ModalStatus, { label: string; color: string; icon: JSX.Element }> = {
  active: {
    label: 'Active',
    color: 'bg-green-500/15 text-green-300 border border-green-500/20',
    icon: <Activity className="w-3.5 h-3.5" />,
  },
  legacy: {
    label: 'Legacy',
    color: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20',
    icon: <FolderOpen className="w-3.5 h-3.5" />,
  },
  quarantined: {
    label: 'Quarantined',
    color: 'bg-orange-500/15 text-orange-300 border border-orange-500/20',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  orphaned: {
    label: 'Orphaned',
    color: 'bg-red-500/15 text-red-300 border border-red-500/20',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
  },
  archived: {
    label: 'Archived',
    color: 'bg-slate-500/15 text-slate-300 border border-slate-500/20',
    icon: <Archive className="w-3.5 h-3.5" />,
  },
};

const MODALS: ModalInfo[] = [
  {
    name: 'CreateAccountModal',
    path: 'apps/web/src/components/modals/CreateAccountModal.tsx',
    status: 'active',
    description: 'Admin-only dialog for onboarding new client accounts.',
    integration: 'Invoked from CRM navigation (+ Account) in CanvasSidebar.',
  },
  {
    name: 'CreateUserInAccountModal',
    path: 'apps/web/src/components/modals/CreateUserInAccountModal.tsx',
    status: 'active',
    description: 'Creates users within a selected account (single or multi-select).',
    integration: 'Launched from AccountInspector and multi-account inspector.',
  },
  {
    name: 'ConfirmationModal',
    path: 'apps/web/src/components/common/ConfirmationModal.tsx',
    status: 'active',
    description: 'Reusable confirmation dialog with action/abort options.',
    integration: 'DataManagementCard (settings) and other destructive workflows.',
  },
  {
    name: 'FirstTimeUploadModal',
    path: 'apps/web/src/components/canvas/FirstTimeUploadModal.tsx',
    status: 'active',
    description: 'Welcome modal shown to first-time users with import shortcuts.',
    integration: 'Triggered from CanvasPage when localStorage key is unset.',
  },
  {
    name: 'LocalFirstImportModal',
    path: 'apps/web/src/components/canvas/LocalFirstImportModal.tsx',
    status: 'active',
    description: 'Primary local-first ingestion flow (IndexedDB pipeline).',
    integration: 'Canvas upload button (default) and FirstTimeUploadModal continue flow.',
  },
  {
    name: 'UploadModal',
    path: 'apps/web/src/components/canvas/UploadModal.tsx',
    status: 'legacy',
    description: 'Legacy cloud upload experience retained for parity testing.',
    integration: 'Shift+Upload fallback from CanvasPage handleOpenUpload.',
  },
  {
    name: 'ChatImportModal',
    path: 'apps/web/src/components/canvas/ChatImportModal.tsx',
    status: 'active',
    description: 'Guided chat import flow with duplicate review and job tracking.',
    integration: 'Canvas toolbar chat import entry & welcome modal CTA.',
  },
  {
    name: 'StreamingUploadModal (quarantined)',
    path: 'apps/web/src/components/import/StreamingUploadModal.old.tsx',
    status: 'quarantined',
    description: 'Legacy streaming uploader. Quarantined during import system consolidation.',
    integration: 'No live references. Available via DEBUG_IMPORT_SELECTOR flag if needed.',
  },
  {
    name: 'ChatImportModal (legacy backup)',
    path: 'apps/web/src/components/canvas/ChatImportModal.old.tsx',
    status: 'archived',
    description: 'Snapshot of the pre-refactor chat import flow.',
    integration: 'Stored for reference only; not imported anywhere.',
  },
];

export function DebugModalsCard() {
  const { user } = useAuth();

  const statusCounts = useMemo(() => {
    return MODALS.reduce<Record<ModalStatus, number>>(
      (acc, modal) => {
        acc[modal.status] += 1;
        return acc;
      },
      { active: 0, legacy: 0, quarantined: 0, orphaned: 0, archived: 0 }
    );
  }, []);

  if (user?.accountType !== 'admin') {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-sm text-red-200">
        Debug modals are restricted to administrator accounts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-lg font-semibold text-slate-100 mb-2">Modal Inventory</h3>
        <p className="text-sm text-slate-400">
          Reference matrix for modal components across the workspace, including legacy and archived
          flows.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(statusCounts).map(([status, count]) => {
          const meta = STATUS_LABELS[status as ModalStatus];
          return (
            <div key={status} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              <div
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${meta.color}`}
              >
                {meta.icon}
                <span>{meta.label}</span>
              </div>
              <p className="text-2xl font-semibold text-white mt-2">{count}</p>
              <p className="text-xs text-slate-500">modal{count === 1 ? '' : 's'}</p>
            </div>
          );
        })}
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 bg-slate-950/60">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Modal
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Description
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Integration
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {MODALS.map((modal) => {
              const meta = STATUS_LABELS[modal.status];
              return (
                <tr key={modal.name} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-100">{modal.name}</span>
                      <code className="text-xs text-slate-500 mt-1">{modal.path}</code>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${meta.color}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-slate-300">
                    {modal.description}
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-slate-400">
                    {modal.integration}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
