"use client";

import { useState } from "react";
import { Check, CircleDashed, Wand2 } from "lucide-react";
import type { GuildSetupRunResult } from "@lumi/contracts";
import { runGuildSetup } from "#/actions/guild-actions";
import { Card, CardBody, CardFooter, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";

export interface SetupChecklistItem {
  key: string;
  label: string;
  description: string;
  /** Already configured before the wizard ran, per the dashboard snapshot this page was rendered with. */
  alreadyDone: boolean;
}

/**
 * One-shot guided bootstrap (Wick-parity plan Phase 7). Everything it does
 * — create the quarantine role, create #logs/#modlogs, flip Anti-Nuke/Join
 * Gate on — is also directly editable from the per-module config pages;
 * this just runs the whole batch through one RPC call and reports what it
 * touched, so a fresh guild doesn't need five separate trips through the
 * module config UI to reach a sane starting point.
 */
export function SetupWizard({
  guildId,
  items,
}: {
  guildId: string;
  items: SetupChecklistItem[];
}) {
  const { isPending, error, run } = useServerAction();
  const [result, setResult] = useState<GuildSetupRunResult | null>(null);

  const allDone = items.every((i) => i.alreadyDone) && !result;

  function handleRun() {
    run(async () => {
      const res = await runGuildSetup(guildId);
      if (!res.ok) {
        return;
      }
      setResult(res.result ?? null);
    });
  }

  return (
    <Card>
      <CardHeader
        actions={
          <Button variant="primary" onClick={handleRun} disabled={isPending}>
            <Wand2 aria-hidden />
            {isPending ? "Running setup…" : "Run Setup"}
          </Button>
        }
      >
        <CardTitle>Guided Setup</CardTitle>
        <CardDescription>
          Creates the quarantine role and log channels this server is missing, then
          enables Anti-Nuke and the Join Gate with their built-in defaults. Safe to
          run more than once — anything already configured is left alone.
        </CardDescription>
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const status = itemStatus(result, item);
            const done = item.alreadyDone || status !== undefined;
            return (
              <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                {done ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{item.label}</p>
                  <p className="text-[12px] leading-5 text-fg-muted">
                    {item.description}
                  </p>
                </div>
                {status ? (
                  <span className="shrink-0 text-[12px] text-fg-subtle">{status}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardBody>
      {error ? (
        <CardFooter className="bg-transparent">
          <ActionError error={error} className="w-full" />
        </CardFooter>
      ) : allDone ? (
        <CardFooter>Everything is already configured — running setup again is a no-op.</CardFooter>
      ) : null}
    </Card>
  );
}

function itemStatus(
  result: GuildSetupRunResult | null,
  item: SetupChecklistItem,
): string | undefined {
  if (!result) return undefined;
  switch (item.key) {
    case "quarantineRole":
      return result.quarantineRole.created ? "Created" : "Already existed";
    case "logsChannel":
      return result.logsChannel.created ? "Created" : "Already existed";
    case "modLogsChannel":
      return result.modLogsChannel.created ? "Created" : "Already existed";
    case "antinuke":
    case "joingate":
      return item.alreadyDone ? "Already enabled" : "Enabled";
    default:
      return undefined;
  }
}
