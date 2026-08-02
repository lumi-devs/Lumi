"use client";

import { useCallback, useState, useTransition } from "react";

interface ActionLike {
  ok: boolean;
  error?: string;
}

export interface UseServerActionResult {
  /** True while the most recently started task is still in flight. */
  isPending: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  /**
   * Clears any previous error and runs `task` inside a transition (so
   * `isPending` reflects it). `task` is responsible for calling `setError`
   * on failure — this just centralizes the "reset error, wrap in
   * `useTransition`" wiring every dashboard form was repeating by hand.
   */
  run: (task: () => Promise<void>) => void;
}

/**
 * Shared `useState(error) + useTransition` plumbing behind the dashboard's
 * "call a Server Action from a Client Component" forms
 * (guild/system config forms, maintenance toggle, GDPR delete, ...).
 */
export function useServerAction(): UseServerActionResult {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = useCallback((task: () => Promise<void>) => {
    setError(null);
    startTransition(() => {
      void task();
    });
  }, []);

  return { isPending, error, setError, run };
}

export interface UseOptimisticActionResult<T> {
  /** The optimistic value — flips immediately, rolls back on failure. */
  value: T;
  isPending: boolean;
  error: string | null;
  /**
   * Sets `value` to `nextValue` immediately, then runs `action`. If it
   * resolves `{ ok: false }`, `value` is rolled back to what it was before
   * this call and `error` is set (falling back to `fallbackError`).
   */
  run: (nextValue: T, action: () => Promise<ActionLike>, fallbackError?: string) => void;
}

/**
 * Optimistic-update variant of {@link useServerAction} for switches/toggles:
 * the module-toggle-grid / global-kill-switch style "flip now, revert on
 * failure" pattern.
 */
export function useOptimisticAction<T>(initialValue: T): UseOptimisticActionResult<T> {
  const [value, setValue] = useState(initialValue);
  const { isPending, error, setError, run: runTask } = useServerAction();

  const run = useCallback(
    (nextValue: T, action: () => Promise<ActionLike>, fallbackError = "Failed") => {
      const prev = value;
      setValue(nextValue);
      runTask(async () => {
        const res = await action();
        if (!res.ok) {
          setValue(prev);
          setError(res.error ?? fallbackError);
        }
      });
    },
    [value, runTask, setError],
  );

  return { value, isPending, error, run };
}
