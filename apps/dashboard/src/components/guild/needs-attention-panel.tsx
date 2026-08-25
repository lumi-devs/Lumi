"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import { Card, CardHeader, CardTitle } from "#/components/ui/card";

export type AttentionSeverity = "critical" | "warning";

export interface AttentionRow {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
}

const SEVERITY_ICON: Record<AttentionSeverity, LucideIcon> = {
  critical: CircleAlert,
  warning: TriangleAlert,
};

const SEVERITY_TINT: Record<AttentionSeverity, string> = {
  critical: "bg-danger-soft text-danger-fg",
  warning: "bg-warning-soft text-warning-fg",
};

const DEFAULT_VISIBLE = 2;

export function NeedsAttentionPanel({ rows }: { rows: AttentionRow[] }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const criticalCount = rows.filter((r) => r.severity === "critical").length;
  const visible = expanded ? rows : rows.slice(0, DEFAULT_VISIBLE);
  const remaining = rows.length - visible.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Needs attention
          {criticalCount > 0 ? (
            <span className="rounded-full bg-danger-soft px-2 py-0.5 font-mono text-[12px] font-normal text-danger-fg">
              {criticalCount} critical
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <div className="divide-y divide-border">
        {visible.map((row) => {
          const Icon = SEVERITY_ICON[row.severity];
          return (
            <div key={row.id} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                  SEVERITY_TINT[row.severity],
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-5 font-medium text-fg">{row.title}</p>
                <p className="mt-0.5 text-[14px] leading-5 text-fg-muted">{row.detail}</p>
              </div>
              <Link
                href={row.actionHref}
                className="shrink-0 self-center text-[14px] font-medium text-accent-fg hover:underline"
              >
                {row.actionLabel}
              </Link>
            </div>
          );
        })}
      </div>
      {!expanded && remaining > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-border px-4 py-2.5 text-left text-[13.5px] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          Show {remaining} more
        </button>
      ) : null}
    </Card>
  );
}
