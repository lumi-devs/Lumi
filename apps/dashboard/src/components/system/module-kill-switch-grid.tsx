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
import { Switch } from "#/components/ui/switch";
import { Field, Input } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { Alert } from "#/components/ui/alert";
import { EmptyState } from "#/components/ui/empty-state";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "#/components/ui/table";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";
import type { GlobalModuleStateView } from "#/lib/dashboard-data";

/**
 * dashboard.md §9A `GlobalModuleKillSwitchGrid`. Only lists modules with an
 * explicit `GlobalModuleState` row (i.e. ones some Bot Owner has already
 * overridden) — every module not shown here is implicitly enabled bot-wide.
 * The form below can force-disable (or re-enable) any module by name.
 *
 * Presented as a table rather than a card grid: these rows are records with
 * identical fields (name, state, reason) and an operator reads down the
 * "state" column, which a 3-across card grid makes impossible.
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
          <TableScroll>
            <Table>
              <THead>
                <tr>
                  <TH className="w-56">Module</TH>
                  <TH>Reason</TH>
                  <TH className="w-24 text-right">State</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.moduleName}>
                    <TD className="font-mono text-[12px] text-fg">
                      {r.moduleName}
                    </TD>
                    <TD className="text-fg-muted">
                      {r.reason ?? (
                        <span className="text-fg-subtle">No reason recorded</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-2">
                        <Badge variant={r.enabled ? "success" : "danger"} dot>
                          {r.enabled ? "On" : "Off"}
                        </Badge>
                        <Switch
                          checked={r.enabled}
                          onChange={(v) => apply(r.moduleName, v)}
                          disabled={isPending}
                          aria-label={`Toggle ${r.moduleName} globally`}
                        />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroll>
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
              <Input
                id="moduleName"
                placeholder="e.g. tempvc"
                className="font-mono text-[12px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
