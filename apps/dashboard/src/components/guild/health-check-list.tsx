"use client";

import Link from "next/link";
import {
  CircleCheck,
  CircleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "#/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { ProgressRing } from "#/components/ui/progress-ring";
import { useStaggerIn } from "#/lib/animate";
import { buildHealthChecks, type HealthCheck } from "#/lib/health-checks";
import type { DashboardRoleView, DashboardModuleView } from "#/lib/dashboard-data";

function CheckRow({ check }: { check: HealthCheck }) {
  const Icon: LucideIcon = check.ok ? CircleCheck : CircleAlert;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          check.ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-5 font-medium text-fg">{check.title}</p>
        <p className="mt-0.5 text-[14px] leading-5 text-fg-muted">{check.detail}</p>
      </div>
      {!check.ok && check.fixHref ? (
        <Link
          href={check.fixHref}
          className="shrink-0 self-center text-[14px] font-medium text-accent-fg hover:underline"
        >
          {check.fixLabel ?? "Fix"}
        </Link>
      ) : null}
    </div>
  );
}

export function HealthCheckList({
  guildId,
  roles,
  securityConfig,
  filterModule,
}: {
  guildId: string;
  roles: DashboardRoleView[];
  securityConfig: Record<string, unknown> | undefined;
  filterModule: DashboardModuleView | undefined;
}) {
  const checks = buildHealthChecks(guildId, roles, securityConfig, filterModule);
  const passing = checks.filter((c) => c.ok).length;
  const containerRef = useStaggerIn<HTMLDivElement>("[data-check-row]", { resetKey: guildId });

  return (
    <Card>
      <CardHeader
        actions={
          <ProgressRing
            value={(passing / checks.length) * 100}
            size={40}
            strokeWidth={4}
            label={`${passing}/${checks.length}`}
          />
        }
      >
        <CardTitle>Health Check</CardTitle>
        <CardDescription>
          {passing} of {checks.length} checks passing.
        </CardDescription>
      </CardHeader>
      <div ref={containerRef} className="divide-y divide-border">
        {checks.map((check) => (
          <div key={check.id} data-check-row>
            <CheckRow check={check} />
          </div>
        ))}
      </div>
    </Card>
  );
}
