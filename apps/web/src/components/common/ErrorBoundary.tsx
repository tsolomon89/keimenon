/**
 * React Error Boundary
 *
 * Catches React component errors and displays fallback UI
 * Automatically captures errors to ErrorCaptureService for debugging
 *
 * Usage:
 *   <ErrorBoundary fallback={<MyFallbackUI />}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */

'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { errorCapture } from '@/services/error-capture.service';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Capture error for console display
    errorCapture.capture(
      error,
      {
        domain: 'ui',
        operation: 'react.componentError',
        metadata: {
          componentStack: errorInfo.componentStack,
          digest: (errorInfo as any).digest,
        },
      },
      'error'
    );

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary] Component error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
          <div className="max-w-lg w-full">
            <div className="bg-red-600/10 border border-red-500/30 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 p-3 bg-red-600/20 rounded-lg">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-red-300 mb-2">Something went wrong</h2>
                  <p className="text-sm text-red-300/80 mb-4">
                    {this.state.error?.message || 'An unexpected error occurred'}
                  </p>

                  {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                    <details className="mb-4">
                      <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300 mb-2">
                        Error Details (Development Only)
                      </summary>
                      <div className="bg-slate-950 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                        <div className="text-red-400 mb-2">
                          <strong>Error:</strong> {this.state.error?.message}
                        </div>
                        <div className="text-red-400 mb-2">
                          <strong>Stack:</strong>
                          <pre className="mt-1 text-slate-400">{this.state.error?.stack}</pre>
                        </div>
                        <div className="text-red-400">
                          <strong>Component Stack:</strong>
                          <pre className="mt-1 text-slate-400">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      </div>
                    </details>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={this.handleReset}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Reload Page
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-4">
                    Press ` (backtick) to view error details in the console
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap components with error boundary
 *
 * @example
 * export default withErrorBoundary(MyComponent);
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
