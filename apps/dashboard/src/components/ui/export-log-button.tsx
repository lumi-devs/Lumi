"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "#/components/ui/button";
import { downloadJson } from "#/lib/download";

/**
 * Client wrapper around a server action shaped like `guild-export-actions.ts`
 * (`{ ok, error?, items?: T[] }`) - fetches the whole filtered log (not just
 * the current page) and downloads it as JSON.
 */
export function ExportLogButton<T>({
  label = "Download log",
  filename,
  action,
}: {
  label?: string;
  filename: string;
  action: () => Promise<{ ok: boolean; error?: string; items?: T[] }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok || !res.items) {
        setError(res.error ?? "Export failed");
        return;
      }
      downloadJson(filename, res.items);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={handleClick} disabled={isPending}>
        <Download aria-hidden />
        {isPending ? "Preparing…" : label}
      </Button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
