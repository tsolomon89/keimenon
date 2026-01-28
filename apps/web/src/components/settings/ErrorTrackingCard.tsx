/**
 * Error Tracking Settings Card
 *
 * Allows users to opt-in/opt-out of Sentry error tracking.
 * Shows privacy information and what data is sent.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, Shield, Check, X } from 'lucide-react';
import {
  hasUserConsent,
  setUserConsent,
  initSentry,
  isSentryEnabled,
} from '@/services/sentry.service';

export function ErrorTrackingCard() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const sentryConfigured = isSentryEnabled();

  useEffect(() => {
    setIsEnabled(hasUserConsent());
  }, []);

  const handleToggle = () => {
    const newValue = !isEnabled;
    setUserConsent(newValue);
    setIsEnabled(newValue);

    // Initialize Sentry if enabling
    if (newValue) {
      initSentry();
    }
  };

  if (!sentryConfigured) {
    return (
      <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-slate-800 rounded-lg">
            <Shield className="w-5 h-5 text-slate-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-white mb-2">Error Tracking</h3>
            <p className="text-sm text-slate-400">
              Error tracking is not configured. To enable, add NEXT_PUBLIC_SENTRY_DSN to your
              environment variables.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-slate-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-blue-400" />
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium text-white">Error Tracking (Sentry)</h3>

            {/* Toggle Switch */}
            <button
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled ? 'bg-blue-600' : 'bg-slate-700'
              }`}
              role="switch"
              aria-checked={isEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <p className="text-sm text-slate-400 mb-4">
            {isEnabled ? (
              <span className="text-green-400">
                ✓ Helping improve Keimenon by sending error reports
              </span>
            ) : (
              'Help improve Keimenon by sending anonymous error reports'
            )}
          </p>

          {/* What We Collect */}
          <div className="space-y-3">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showDetails ? '▼' : '▶'} What data is sent?
            </button>

            {showDetails && (
              <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-white font-medium">
                        Error messages and stack traces
                      </span>
                      <p className="text-slate-400">Technical error details to help fix bugs</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-white font-medium">Browser and OS information</span>
                      <p className="text-slate-400">
                        To reproduce and fix platform-specific issues
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-white font-medium">User ID and Account ID</span>
                      <p className="text-slate-400">Non-personally identifiable IDs only</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-white font-medium">Operation context</span>
                      <p className="text-slate-400">What you were doing when the error occurred</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-3 space-y-2">
                  <p className="text-sm font-medium text-white">What we DON'T collect:</p>

                  <div className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-slate-300">Email addresses or passwords</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-slate-300">API tokens or authentication keys</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-slate-300">Your chat messages or file contents</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-slate-300">
                        Personally identifiable information (PII)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-800/30 rounded p-3 mt-3">
                  <div className="flex gap-2">
                    <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-300">
                      <p className="font-medium mb-1">Privacy Guarantee</p>
                      <p className="text-blue-400">
                        All sensitive data is automatically scrubbed before sending. You can disable
                        this at any time with no questions asked.
                      </p>
                    </div>
                  </div>
                </div>

                {sentryConfigured && (
                  <p className="text-xs text-slate-500 mt-3">
                    Learn more:{' '}
                    <a
                      href="https://docs.sentry.io/security-legal-pii/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Sentry Privacy Policy
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Status indicator */}
          {isEnabled && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>Error tracking active</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
