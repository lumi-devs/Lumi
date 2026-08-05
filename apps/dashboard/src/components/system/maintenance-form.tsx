"use client";

import { useState } from "react";
import { setMaintenanceMode } from "#/actions/system-actions";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Input, Label } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";

/** dashboard.md §9A `SystemGlobalConfigCard` maintenance controls. */
export function MaintenanceForm({
  maintenanceMode,
  maintenanceMessage,
}: {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
}) {
  const [enabled, setEnabled] = useState(maintenanceMode);
  const [message, setMessage] = useState(maintenanceMessage ?? "");
  const { isPending, error, setError, run } = useServerAction();

  function save(nextEnabled: boolean, nextMessage: string) {
    run(async () => {
      const res = await setMaintenanceMode(nextEnabled, nextMessage || undefined);
      if (!res.ok) setError(res.error ?? "Failed");
    });
  }

  return (
    <Card
      // The one screen-level state that changes the bot's behaviour for every
      // user gets a coloured left rule when it's on, so an operator can tell
      // at a glance from anywhere on the page.
      className={enabled ? "border-warning/40" : undefined}
    >
      <CardHeader
        actions={
          <>
            <Badge variant={enabled ? "warning" : "neutral"} dot>
              {enabled ? "Active" : "Off"}
            </Badge>
            <Switch
              checked={enabled}
              onChange={(v) => {
                setEnabled(v);
                save(v, message);
              }}
              disabled={isPending}
              aria-label="Toggle maintenance mode"
            />
          </>
        }
      >
        <CardTitle>Maintenance mode</CardTitle>
        <CardDescription>
          Instantly puts every guild-facing command into a downtime state.
        </CardDescription>
      </CardHeader>

      <CardBody className="flex flex-col gap-2">
        <Label htmlFor="maintenanceMessage">Downtime message</Label>
        <div className="flex gap-2">
          <Input
            id="maintenanceMessage"
            placeholder="Lumi is undergoing scheduled maintenance…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => save(enabled, message)}
          >
            Save
          </Button>
        </div>
        <p className="text-[11px] text-fg-subtle">
          Shown to users in place of the normal command response.
        </p>
        <ActionError error={error} className="mt-1" />
      </CardBody>
    </Card>
  );
}
