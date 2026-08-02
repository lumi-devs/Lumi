"use client";

import { useState } from "react";
import { setMaintenanceMode } from "#/actions/system-actions";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Input, Label } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
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
    <Card>
      <CardHeader>
        <div className="grow">
          <CardTitle>Maintenance mode</CardTitle>
          <CardDescription>
            Instantly puts every guild-facing command into a downtime state.
          </CardDescription>
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            save(v, message);
          }}
          disabled={isPending}
          aria-label="Toggle maintenance mode"
        />
      </CardHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="maintenanceMessage">Downtime message</Label>
        <div className="flex gap-2">
          <Input
            id="maintenanceMessage"
            placeholder="Lumi is undergoing scheduled maintenance…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => save(enabled, message)}
          >
            Save
          </Button>
        </div>
        <ActionError error={error} />
      </div>
    </Card>
  );
}
