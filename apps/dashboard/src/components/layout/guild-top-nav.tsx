"use client";

import { TopNav } from "#/components/layout/top-nav";
import { guildManagementGroups, guildTopLinks } from "#/lib/guild-nav";

export function GuildTopNav({ guildId }: { guildId: string }) {
  return (
    <TopNav
      directLinks={guildTopLinks(guildId)}
      groups={guildManagementGroups(guildId)}
    />
  );
}
