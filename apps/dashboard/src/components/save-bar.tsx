"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleAlert, PenLine } from "lucide-react";
import { Button } from "#/components/ui/button";
import { SPRING_SOFT } from "#/lib/animate";

export function SaveBar({
  dirty,
  saving,
  error,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  error?: string | null;
  onSave: () => void;
  onReset: () => void;
}) {
  useEffect(() => {
    if (!dirty || saving) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, saving, onSave]);

  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={SPRING_SOFT}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
        >
          <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-border bg-surface px-3 py-2.5 shadow-e3">
            <PenLine className="size-3.5 shrink-0 text-warning" aria-hidden />
            <span className="text-[15px] font-medium text-fg">
              Careful — you have unsaved changes
            </span>

            {error && (
              <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-danger">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate" title={error}>
                  {error}
                </span>
              </span>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Button variant="ghost" size="md" onClick={onReset} disabled={saving}>
                Reset
              </Button>
              <Button variant="primary" size="md" onClick={onSave} disabled={saving}>
                {saving ? (
                  "Saving…"
                ) : (
                  <>
                    Save changes
                    <kbd className="ml-0.5 rounded border border-fg-on-accent/25 px-1 font-sans text-[12px] leading-4 opacity-80">
                      ⌘S
                    </kbd>
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
