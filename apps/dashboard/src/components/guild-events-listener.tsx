"use client";

import { useRouter } from "next/navigation";
import { useGuildEvents } from "#/lib/use-guild-events";

/** Mounted once per guild layout; re-reads every server component on any live change to that guild. */
export function GuildEventsListener({ guildId }: { guildId: string }) {
  const router = useRouter();
  useGuildEvents(guildId, () => router.refresh());
  return null;
}
