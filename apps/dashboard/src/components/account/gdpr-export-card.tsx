"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportMyData } from "#/actions/user-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Button } from "#/components/ui/button";

function countEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value == null ? 0 : 1;
}

export function GdprExportCard() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const res = await exportMyData();
      if (!res.ok || !res.data) {
        setError(res.error ?? "Export failed");
        return;
      }

      const nextSummary: Record<string, number> = {};
      for (const [moduleName, moduleData] of Object.entries(res.data)) {
        nextSummary[moduleName] = countEntries(moduleData);
      }
      setSummary(nextSummary);

      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumi-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
            <Download className="size-4" aria-hidden />
          </span>
          <div>
            <CardTitle>Download my data</CardTitle>
            <CardDescription>
              A JSON export of everything Lumi stores about you (AFK status,
              moderation cases, temp voice channels you own, and more).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Button
          variant="primary"
          onClick={handleExport}
          disabled={isPending}
          className="self-start"
        >
          {isPending ? "Preparing export…" : "Download my data"}
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
        {summary && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-fg-muted">
              Records found, by module
            </p>
            {Object.keys(summary).length === 0 ? (
              <p className="text-xs text-fg-subtle">
                Nothing on file for your account.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {Object.entries(summary).map(([moduleName, count]) => (
                  <li
                    key={moduleName}
                    className="flex items-center justify-between rounded-control border border-border bg-surface-hover px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-fg">{moduleName}</span>
                    <span className="text-fg-muted">
                      {count} record{count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
