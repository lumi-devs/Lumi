"use client";

import { useState } from "react";
import { toggleGlobalModule } from "#/actions/system-actions";
import { Card } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Input, Label } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";
import type { GlobalModuleStateView } from "#/lib/dashboard-data";

/**
 * dashboard.md §9A `GlobalModuleKillSwitchGrid`. Only lists modules with an
 * explicit `GlobalModuleState` row (i.e. ones some Bot Owner has already
 * overridden) — every module not shown here is implicitly enabled bot-wide.
 * The form below can force-disable (or re-enable) any module by name.
 */
export function ModuleKillSwitchGrid({
  moduleStates,
}: {
  moduleStates: GlobalModuleStateView[];
}) {
  const [rows, setRows] = useState(moduleStates);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const { isPending, error, setError, run } = useServerAction();

  function apply(moduleName: string, enabled: boolean, reasonText?: string) {
    run(async () => {
      const res = await toggleGlobalModule(moduleName, enabled, reasonText);
      if (!res.ok) {
        setError(res.error ?? "Failed");
        return;
      }
      setRows((prev) => {
        const existing = prev.find((r) => r.moduleName === moduleName);
        const next = { moduleName, enabled, reason: reasonText ?? existing?.reason ?? null };
        return existing
          ? prev.map((r) => (r.moduleName === moduleName ? next : r))
          : [...prev, next];
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.moduleName} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.moduleName}</p>
              {r.reason && (
                <p className="truncate text-xs text-white/40">{r.reason}</p>
              )}
            </div>
            <Switch
              checked={r.enabled}
              onChange={(v) => apply(r.moduleName, v)}
              disabled={isPending}
              aria-label={`Toggle ${r.moduleName} globally`}
            />
          </Card>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-white/40">
            No global overrides — every module is enabled bot-wide.
          </p>
        )}
      </div>

      <Card>
        <p className="mb-3 text-sm font-semibold">Force-disable a module</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="moduleName">Module name</Label>
            <Input
              id="moduleName"
              placeholder="e.g. tempvc"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            variant="danger"
            disabled={!name || isPending}
            onClick={() => apply(name, false, reason || undefined)}
            className="self-end"
          >
            Disable globally
          </Button>
        </div>
        <ActionError error={error} className="mt-2" />
      </Card>
    </div>
  );
}
