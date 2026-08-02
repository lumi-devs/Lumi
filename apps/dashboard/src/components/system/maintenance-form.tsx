"use client";

import { useState, useTransition } from "react";
import { setMaintenanceMode } from "#/actions/system-actions";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Switch } from "#/components/ui/switch";
import { Input, Label } from "#/components/ui/input";
import { Button } from "#/components/ui/button";

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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(nextEnabled: boolean, nextMessage: string) {
    setError(null);
    startTransition(async () => {
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
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Card>
  );
}
