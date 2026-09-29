"use client";

import { useEffect, useRef } from "react";
import type { DashboardEvent } from "@lumi/contracts/events";

const DashboardEventTypes = new Set<DashboardEvent["type"]>([
  "module.stateChanged",
  "config.changed",
]);

function isDashboardEvent(value: unknown): value is DashboardEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    DashboardEventTypes.has(v.type as DashboardEvent["type"]) &&
    typeof v.guildId === "string"
  );
}

/** Subscribes to `/api/guilds/[guildId]/events` for as long as this component is mounted. */
export function useGuildEvents(guildId: string, onEvent: (event: DashboardEvent) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource(`/api/guilds/${guildId}/events`);
    source.onmessage = (message) => {
      let payload: unknown;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }
      if (isDashboardEvent(payload)) onEventRef.current(payload);
    };
    return () => source.close();
  }, [guildId]);
}
