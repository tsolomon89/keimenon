'use client';

import { useState } from 'react';

/**
 * Test Error Page
 *
 * This page is used to test the ErrorBoundary component.
 * It intentionally throws errors to verify error handling works correctly.
 *
 * TO DELETE: Remove this file after verifying ErrorBoundary works
 */

function ComponentThatThrows({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error from ComponentThatThrows - ErrorBoundary should catch this!');
  }

  return <div className="text-green-600">Component rendered successfully (not throwing)</div>;
}

export default function TestErrorPage() {
  const [shouldThrow, setShouldThrow] = useState(false);
  const [renderError, setRenderError] = useState(false);

  const throwSyncError = () => {
    throw new Error('Synchronous error thrown - ErrorBoundary should catch this!');
  };

  const throwAsyncError = async () => {
    throw new Error('Async error thrown - This will NOT be caught by ErrorBoundary');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Error Boundary Test Page</h1>

        <div className="bg-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">Test 1: Render Error (Caught by ErrorBoundary)</h2>
          <p className="text-slate-400">
            This will trigger a component render error that should be caught by the ErrorBoundary.
          </p>
          <button
            onClick={() => setRenderError(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
          >
            Trigger Render Error
          </button>

          {renderError && <ComponentThatThrows shouldThrow={true} />}
        </div>

        <div className="bg-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">
            Test 2: Click Handler Error (Caught by ErrorBoundary)
          </h2>
          <p className="text-slate-400">
            This will throw an error in a click handler, which should be caught by the
            ErrorBoundary.
          </p>
          <button
            onClick={throwSyncError}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-white"
          >
            Throw Sync Error
          </button>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">
            Test 3: Async Error (NOT caught by ErrorBoundary)
          </h2>
          <p className="text-slate-400">
            This will throw an async error, which will NOT be caught by ErrorBoundary. Check browser
            console for the error.
          </p>
          <button
            onClick={() => {
              throwAsyncError().catch((err) => {
                console.error('Async error (not caught by ErrorBoundary):', err);
              });
            }}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-white"
          >
            Throw Async Error
          </button>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">Test 4: Toggle Component</h2>
          <p className="text-slate-400">
            Toggle between throwing and not throwing to test ErrorBoundary reset.
          </p>
          <button
            onClick={() => setShouldThrow(!shouldThrow)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            {shouldThrow ? 'Stop Throwing' : 'Start Throwing'}
          </button>

          <ComponentThatThrows shouldThrow={shouldThrow} />
        </div>

        <div className="bg-green-900/20 border border-green-600 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-2">Expected Behavior</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-green-300">
            <li>Test 1 & 2: Should show ErrorBoundary fallback UI</li>
            <li>Test 3: Should log error to console (not caught by ErrorBoundary)</li>
            <li>Test 4: Should toggle between error and success states</li>
            <li>ErrorBoundary should show "Reset" button to recover</li>
            <li>Errors should be logged to error capture service (if configured)</li>
          </ul>
        </div>

        <div className="bg-blue-900/20 border border-blue-600 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">How to Use</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-300">
            <li>Click each "Trigger Error" button to test different error scenarios</li>
            <li>Verify ErrorBoundary shows fallback UI with error details</li>
            <li>Click "Reset" button in ErrorBoundary to recover</li>
            <li>Check browser console for error logging</li>
            <li>Verify error is sent to error tracking service (if integrated)</li>
          </ol>
        </div>

        <div className="bg-red-900/20 border border-red-600 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-red-400 mb-2">⚠️ Important</h3>
          <p className="text-sm text-red-300">
            This is a TEST PAGE ONLY. Delete this file (
            <code>apps/web/src/app/test-error/page.tsx</code>) after verifying the ErrorBoundary
            works correctly.
          </p>
        </div>
      </div>
    </div>
  );
}
