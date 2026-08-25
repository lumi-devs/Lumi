"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Switch } from "#/components/ui/switch";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";
import type { ActionResult } from "#/actions/guild-actions";

/** Same enable/disable affordance `ModuleConfigForm` uses, generalized so any bespoke module page can reuse it in its `PageHeader` actions slot. */
export function ModuleMasterToggle({
  guildId,
  moduleName,
  enabled: initialEnabled,
  toggle,
}: {
  guildId: string;
  moduleName: string;
  enabled: boolean;
  toggle: (guildId: string, moduleName: string, enabled: boolean) => Promise<ActionResult>;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const { isPending, error, setError, run } = useServerAction();

  function handleToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    run(async () => {
      const res = await toggle(guildId, moduleName, next);
      if (!res.ok) {
        setEnabled(prev);
        setError(res.error ?? "Failed to toggle");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={enabled ? "success" : "neutral"} dot>
        {enabled ? "Enabled" : "Disabled"}
      </Badge>
      <Switch
        checked={enabled}
        onChange={handleToggle}
        disabled={isPending}
        aria-label={`Toggle ${moduleName}`}
      />
      <ActionError error={error} />
    </div>
  );
}
