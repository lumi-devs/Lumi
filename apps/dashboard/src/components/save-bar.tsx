"use client";

import { useEffect } from "react";
import { Button } from "#/components/ui/button";

/** Floating save bar — dashboard.md §7 wireframe bottom row. */
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
    if (!dirty) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, onSave]);

  if (!dirty) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="glass-card flex w-full max-w-2xl items-center gap-4 rounded-xl border-warning/30 px-4 py-3 shadow-2xl">
        <span className="text-sm font-medium text-warning">
          ⚠️ Careful — you have unsaved changes!
        </span>
        {error && <span className="text-xs text-danger">{error}</span>}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
            Reset
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes ⌘S"}
          </Button>
        </div>
      </div>
    </div>
  );
}
