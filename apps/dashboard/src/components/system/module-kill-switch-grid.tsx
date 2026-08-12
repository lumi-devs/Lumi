"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { toggleGlobalModule } from "#/actions/system-actions";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";
import { Field, Input, Select } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Alert } from "#/components/ui/alert";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { moduleKillSwitchColumns } from "#/components/system/module-kill-switch-columns";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";
import type { GlobalModuleStateView } from "#/lib/dashboard-data";

// Only modules with an explicit `GlobalModuleState` row appear; anything absent
// is implicitly enabled bot-wide.
export function ModuleKillSwitchGrid({
  moduleStates,
  allModules,
}: {
  moduleStates: GlobalModuleStateView[];
  allModules: { name: string; displayName: string; emoji: string }[];
}) {
  const [rows, setRows] = useState(moduleStates);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const { isPending, error, setError, run } = useServerAction();

  const columns = moduleKillSwitchColumns({
    isPending,
    onToggle: (moduleName, enabled) => apply(moduleName, enabled),
  });

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
      <Card>
        <CardHeader
          actions={<Badge variant="neutral">{rows.length} override{rows.length === 1 ? "" : "s"}</Badge>}
        >
          <CardTitle>Global overrides</CardTitle>
          <CardDescription>
            Modules with an explicit bot-wide state. Anything not listed here
            follows each guild&apos;s own setting.
          </CardDescription>
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldOff}
            title="No global overrides"
            description="Every module currently follows its per-guild configuration. Use the form below to force one off bot-wide."
          />
        ) : (
          <DataTable columns={columns} data={rows} getRowId={(r) => r.moduleName} />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Force-disable a module</CardTitle>
          <CardDescription>
            Takes effect in every guild on the next command dispatch.
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Module name" htmlFor="moduleName">
              <Select
                id="moduleName"
                value={name}
                onChange={(e) => setName(e.target.value)}
              >
                <option value="">Select a module…</option>
                {allModules.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.emoji} {m.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason (optional)" htmlFor="reason">
              <Input
                id="reason"
                placeholder="Shown in the audit ledger"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Button
              variant="danger"
              disabled={!name || isPending}
              onClick={() => apply(name, false, reason || undefined)}
              className="self-start sm:mt-[22px]"
            >
              Disable globally
            </Button>
          </div>
          <Alert variant="warning">
            This is a kill switch, not a per-guild setting — every server loses
            the module until it is re-enabled here.
          </Alert>
          <ActionError error={error} />
        </CardBody>
      </Card>
    </div>
  );
}
