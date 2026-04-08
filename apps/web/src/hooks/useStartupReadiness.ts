'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/lib/env.config';

type StartupPhase = 'checking' | 'ready' | 'error';

interface ReadyPayload {
  ready?: boolean;
  checks?: Record<string, boolean>;
  timestamp?: string;
}

interface ModuleHealthPayload {
  healthy?: boolean;
  issues?: Array<{ module?: string; issue?: string }>;
}

export interface StartupReadinessState {
  phase: StartupPhase;
  endpoint: string;
  attempts: number;
  elapsedMs: number;
  checks: Record<string, boolean>;
  issues: string[];
  lastError: string | null;
}

interface UseStartupReadinessOptions {
  enabled?: boolean;
  pollMs?: number;
}

const DEFAULT_POLL_MS = 2000;

async function fetchJson(url: string) {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

export function useStartupReadiness(options: UseStartupReadinessOptions = {}) {
  const { enabled = true, pollMs = DEFAULT_POLL_MS } = options;
  const endpoint = `${API_BASE_URL}/ready`;
  const modulesEndpoint = `${API_BASE_URL}/health/modules`;
  const mountedRef = useRef(true);
  const startedAtRef = useRef<number>(Date.now());
  const attemptsRef = useRef(0);

  const [state, setState] = useState<StartupReadinessState>({
    phase: enabled ? 'checking' : 'ready',
    endpoint,
    attempts: 0,
    elapsedMs: 0,
    checks: {},
    issues: [],
    lastError: null,
  });

  const updateState = useCallback((patch: Partial<StartupReadinessState>) => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const runCheck = useCallback(async () => {
    const nextAttempt = attemptsRef.current + 1;
    attemptsRef.current = nextAttempt;
    const elapsedMs = Date.now() - startedAtRef.current;

    try {
      const readyResult = await fetchJson(endpoint);
      const readyPayload = (readyResult.payload || {}) as ReadyPayload;
      const checks = readyPayload.checks || {};
      const isReady = readyResult.response.ok && readyPayload.ready === true;

      let issues: string[] = [];
      if (!isReady) {
        const moduleResult = await fetchJson(modulesEndpoint);
        const modulePayload = (moduleResult.payload || {}) as ModuleHealthPayload;
        issues = (modulePayload.issues || [])
          .map((entry) => {
            const moduleName = entry.module || 'unknown';
            const issue = entry.issue || 'unknown issue';
            return `${moduleName}: ${issue}`;
          })
          .filter(Boolean);
      }

      updateState({
        phase: isReady ? 'ready' : 'checking',
        endpoint,
        attempts: nextAttempt,
        elapsedMs,
        checks,
        issues,
        lastError: null,
      });
    } catch (error: any) {
      updateState({
        phase: 'error',
        endpoint,
        attempts: nextAttempt,
        elapsedMs,
        checks: {},
        issues: [],
        lastError: error?.message || 'Unable to reach backend readiness endpoint',
      });
    }
  }, [endpoint, modulesEndpoint, updateState]);

  useEffect(() => {
    mountedRef.current = true;
    startedAtRef.current = Date.now();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      attemptsRef.current = 0;
      updateState({
        phase: 'ready',
        endpoint,
        attempts: 0,
        elapsedMs: 0,
        checks: {},
        issues: [],
        lastError: null,
      });
      return;
    }

    const tick = async () => {
      await runCheck();
    };

    attemptsRef.current = 0;
    tick();
    const timer = window.setInterval(tick, pollMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, endpoint, pollMs, runCheck, updateState]);

  const retry = useCallback(async () => {
    await runCheck();
  }, [runCheck]);

  return useMemo(
    () => ({
      ...state,
      retry,
    }),
    [retry, state]
  );
}
