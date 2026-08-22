"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportMyData } from "#/actions/user-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { downloadJson } from "#/lib/download";
import { DataBreakdownChart } from "./data-breakdown-chart";

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
      downloadJson(`lumi-data-export-${Date.now()}.json`, res.data);
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
              <DataBreakdownChart data={summary} />
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
