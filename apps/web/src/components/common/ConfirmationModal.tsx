/**
 * Polymorphic Confirmation Modal
 *
 * A reusable modal component for confirmations, warnings, errors, and info messages.
 * Supports custom colors, icons, and actions based on variant.
 */

'use client';

import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';

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
    confirmBg: 'bg-yellow-600 hover:bg-yellow-700',
    confirmText: 'text-white',
  },
  error: {
    bg: 'bg-red-600/10',
    border: 'border-red-500/30',
    iconBg: 'bg-red-500/20',
    icon: AlertCircle,
    iconColor: 'text-red-400',
    titleColor: 'text-red-300',
    messageColor: 'text-red-200/80',
    confirmBg: 'bg-red-600 hover:bg-red-700',
    confirmText: 'text-white',
  },
  info: {
    bg: 'bg-blue-600/10',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/20',
    icon: Info,
    iconColor: 'text-blue-400',
    titleColor: 'text-blue-300',
    messageColor: 'text-blue-200/80',
    confirmBg: 'bg-blue-600 hover:bg-blue-700',
    confirmText: 'text-white',
  },
  success: {
    bg: 'bg-green-600/10',
    border: 'border-green-500/30',
    iconBg: 'bg-green-500/20',
    icon: CheckCircle,
    iconColor: 'text-green-400',
    titleColor: 'text-green-300',
    messageColor: 'text-green-200/80',
    confirmBg: 'bg-green-600 hover:bg-green-700',
    confirmText: 'text-white',
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
              <h3 className={`text-lg font-semibold ${config.titleColor} mb-2`}>{title}</h3>
              <p className={`text-sm ${config.messageColor} whitespace-pre-wrap`}>{message}</p>
              {details && (
                <p className="text-xs text-slate-400 mt-3 p-3 bg-slate-900/50 rounded border border-slate-700">
                  {details}
                </p>
              )}
            </div>

            {/* Close button */}
            {!isProcessing && (
              <button
                onClick={handleCancel}
                className="flex-shrink-0 p-1 hover:bg-slate-800/50 rounded transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-900/30 border-t border-slate-700/50">
            {/* Left side - Minimize button (only show when processing and onMinimize is provided) */}
            <div>
              {isProcessing && onMinimize && (
                <button
                  onClick={onMinimize}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {minimizeText}
                </button>
              )}
            </div>

            {/* Right side - Cancel and Confirm buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={handleConfirm}
                disabled={isProcessing}
                className={`px-4 py-2 text-sm font-medium ${config.confirmBg} ${config.confirmText} disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2`}
              >
                {isProcessing && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
