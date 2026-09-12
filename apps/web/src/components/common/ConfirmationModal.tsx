'use client';

import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { Button } from '@keimenon/ui';

export type ConfirmationVariant = 'warning' | 'error' | 'info' | 'success';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  variant?: ConfirmationVariant;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isProcessing?: boolean;
  details?: string; // Optional additional details
  onMinimize?: () => void; // Optional minimize handler (for background operations)
  minimizeText?: string; // Text for minimize button
}

const variantConfig = {
  warning: {
    bg: 'bg-yellow-600/10',
    border: 'border-yellow-500/30',
    iconBg: 'bg-yellow-500/20',
    icon: AlertTriangle,
    iconColor: 'text-yellow-400',
    titleColor: 'text-yellow-300',
    messageColor: 'text-yellow-200/80',
    confirmVariant: 'warning' as const,
  },
  error: {
    bg: 'bg-red-600/10',
    border: 'border-red-500/30',
    iconBg: 'bg-red-500/20',
    icon: AlertCircle,
    iconColor: 'text-red-400',
    titleColor: 'text-red-300',
    messageColor: 'text-red-200/80',
    confirmVariant: 'danger' as const,
  },
  info: {
    bg: 'bg-blue-600/10',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/20',
    icon: Info,
    iconColor: 'text-blue-400',
    titleColor: 'text-blue-300',
    messageColor: 'text-blue-200/80',
    confirmVariant: 'default' as const,
  },
  success: {
    bg: 'bg-green-600/10',
    border: 'border-green-500/30',
    iconBg: 'bg-green-500/20',
    icon: CheckCircle,
    iconColor: 'text-green-400',
    titleColor: 'text-green-300',
    messageColor: 'text-green-200/80',
    confirmVariant: 'default' as const,
  },
};

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  variant = 'warning',
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isProcessing = false,
  details,
  onMinimize,
  minimizeText = 'Minimize',
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = () => {
    if (!isProcessing) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  // Prevent background scroll when modal is open
  if (typeof window !== 'undefined' && isOpen) {
    document.body.style.overflow = 'hidden';
  } else if (typeof window !== 'undefined') {
    document.body.style.overflow = 'unset';
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />

      {/* Modal */}
      <div className="relative w-full max-w-md">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmation-modal-title"
          aria-describedby="confirmation-modal-description"
          data-testid="confirmation-modal"
          className={`relative ${config.bg} border ${config.border} rounded-xl shadow-2xl overflow-hidden`}
        >
          {/* Header */}
          <div className="flex items-start gap-4 p-6 pb-4">
            {/* Icon */}
            <div className={`flex-shrink-0 ${config.iconBg} rounded-lg p-3`}>
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3
                id="confirmation-modal-title"
                className={`text-lg font-semibold ${config.titleColor} mb-2`}
              >
                {title}
              </h3>
              <p
                id="confirmation-modal-description"
                className={`text-sm ${config.messageColor} whitespace-pre-wrap`}
              >
                {message}
              </p>
              {details && (
                <p className="text-xs text-slate-400 mt-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                  {details}
                </p>
              )}
            </div>

            {/* Close button */}
            {!isProcessing && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                className="flex-shrink-0 h-8 w-8 p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-900/30 border-t border-slate-700/50">
            {/* Left side - Minimize button */}
            <div>
              {isProcessing && onMinimize && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMinimize}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {minimizeText}
                </Button>
              )}
            </div>

            {/* Right side - Cancel and Confirm buttons */}
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isProcessing}>
                {cancelText}
              </Button>
              <Button
                variant={config.confirmVariant}
                size="sm"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                {isProcessing && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {confirmText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
