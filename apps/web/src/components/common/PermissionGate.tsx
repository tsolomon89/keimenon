import { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { usePermissions, Permission } from '@/hooks/usePermissions';

interface PermissionGateProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
  showReason?: boolean;
}

/**
 * Permission Gate Component
 * Conditionally renders children based on permission check
 * Shows reason if permission is denied
 */
export function PermissionGate({ permission, children, fallback, showReason = false }: PermissionGateProps) {
  const { checkPermission } = usePermissions();
  const check = checkPermission(permission);

  if (check.allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showReason && check.reason) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-600/10 border border-yellow-500/30 rounded text-sm text-yellow-300">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{check.reason}</span>
      </div>
    );
  }

  return null;
}

interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  permission: Permission;
  children: ReactNode;
}

/**
 * Permission Button Component
 * Automatically disables button if permission check fails
 * Shows tooltip with reason on hover
 */
export function PermissionButton({ permission, children, className, ...props }: PermissionButtonProps) {
  const { checkPermission } = usePermissions();
  const check = checkPermission(permission);

  return (
    <button
      {...props}
      disabled={!check.allowed || props.disabled}
      className={`${className} ${!check.allowed ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={!check.allowed ? check.reason : props.title}
    >
      {children}
    </button>
  );
}

interface PermissionTooltipProps {
  permission: Permission;
  children: ReactNode;
}

/**
 * Permission Tooltip
 * Wraps any element and shows permission reason as tooltip
 */
export function PermissionTooltip({ permission, children }: PermissionTooltipProps) {
  const { checkPermission } = usePermissions();
  const check = checkPermission(permission);

  return (
    <div
      className="relative group"
      title={!check.allowed ? check.reason : undefined}
    >
      {children}
      {!check.allowed && check.reason && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3 text-yellow-400" />
            <span>{check.reason}</span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}
