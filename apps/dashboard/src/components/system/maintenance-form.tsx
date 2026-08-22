"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import { useOptimisticAction } from "#/lib/use-server-action";
import { SPRING_SNAPPY } from "#/lib/animate";

export function MaintenanceForm({
  maintenanceMode,
  maintenanceMessage,
}: {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
}) {
  const [message, setMessage] = useState(maintenanceMessage ?? "");
  const reduce = useReducedMotion();
  const {
    value: enabled,
    isPending,
    error,
    run,
  } = useOptimisticAction(maintenanceMode);

  function save(nextEnabled: boolean, nextMessage: string) {
    run(
      nextEnabled,
      () => setMaintenanceMode(nextEnabled, nextMessage || undefined),
      "Failed to reach the bot — maintenance mode is unchanged.",
    );
  }

  return (
    <Card
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
              onChange={(v) => save(v, message)}
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
        <p className="text-[13px] text-fg-subtle">
          Shown to users in place of the normal command response.
        </p>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SNAPPY}
            >
              <ActionError error={error} className="mt-1" />
            </motion.div>
          )}
        </AnimatePresence>
      </CardBody>
    </Card>
  );
}
