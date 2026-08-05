"use client";

import { useEffect } from "react";
import { CircleAlert, PenLine } from "lucide-react";
import { Button } from "#/components/ui/button";

/**
 * Floating unsaved-changes bar.
 *
 * Hierarchy is explicit: Reset is a ghost button, Save is the only solid
 * accent control on the screen, and the ⌘S hint lives inside it as a kbd chip
 * rather than being appended to the label as literal text. The warning is a
 * lucide icon in the warning tone — not a ⚠️ emoji, which rendered as a full
 * colour glyph and made the bar look like a toast from a different app.
 */
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

  if (!dirty) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-e3">
        <PenLine className="size-3.5 shrink-0 text-warning" aria-hidden />
        <span className="text-[13px] font-medium text-fg">
          Careful — you have unsaved changes
        </span>

        {error && (
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-danger">
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
                <kbd className="ml-0.5 rounded border border-white/25 px-1 font-sans text-[10px] leading-4 opacity-80">
                  ⌘S
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
