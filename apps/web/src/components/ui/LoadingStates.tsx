'use client';

export function SpinnerLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={`
        ${sizes[size]}
        border-purple-600 border-t-transparent
        rounded-full animate-spin
      `}
    />
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
      <div
        className="h-full bg-purple-600 transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

export function SkeletonLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-800 rounded ${className}`}>
      <div className="h-full w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent animate-shimmer" />
    </div>
  );
}

export function PulsingDot() {
  return (
    <div className="flex items-center space-x-1">
      <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
      <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse delay-75" />
      <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse delay-150" />
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
  progress?: number;
  showProgress?: boolean;
}

export function LoadingOverlay({ message, progress, showProgress }: LoadingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 max-w-sm w-full mx-4 border border-slate-700 shadow-2xl">
        <div className="flex flex-col items-center gap-4">
          <SpinnerLoader size="lg" />
          {message && <p className="text-slate-300 text-center">{message}</p>}
          {showProgress && progress !== undefined && (
            <div className="w-full">
              <ProgressBar progress={progress} />
              <p className="text-xs text-slate-400 text-center mt-2">{Math.round(progress)}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProcessingStepProps {
  steps: Array<{
    label: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    message?: string;
  }>;
}

export function ProcessingSteps({ steps }: ProcessingStepProps) {
  const statusIcons = {
    pending: (
      <div className="w-6 h-6 rounded-full border-2 border-slate-600 bg-slate-800" />
    ),
    processing: (
      <div className="w-6 h-6 rounded-full border-2 border-purple-600 bg-slate-800 flex items-center justify-center">
        <SpinnerLoader size="sm" />
      </div>
    ),
    completed: (
      <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    ),
    error: (
      <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    ),
  };

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">{statusIcons[step.status]}</div>
          <div className="flex-1">
            <p
              className={`font-medium ${
                step.status === 'completed'
                  ? 'text-green-400'
                  : step.status === 'error'
                  ? 'text-red-400'
                  : step.status === 'processing'
                  ? 'text-purple-400'
                  : 'text-slate-400'
              }`}
            >
              {step.label}
            </p>
            {step.message && (
              <p className="text-sm text-slate-500 mt-1">{step.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
