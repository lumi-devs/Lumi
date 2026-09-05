"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Layers3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SideNav, SideNavUser } from "#/components/layout/side-nav";
import { guildManagementGroups, guildTopLinks } from "#/lib/guild-nav";
import { guildIconUrl } from "#/lib/discord-format";
import { cn } from "#/lib/utils";

export interface SwitcherGuild {
  id: string;
  name: string;
  /** Raw Discord icon hash, resolved to a CDN URL here. */
  icon: string | null;
}

// Static UX default from the design — Discipline & Appeals and Safety & Security
// start expanded (the categories most guilds touch), Community & Engagement,
// Monitoring & Diagnostics start expanded, Configuration starts collapsed.
// Independent of live alert state.
const DEFAULT_OPEN_CATEGORIES = new Set([
  "Discipline & Appeals",
  "Safety & Security",
  "Community & Engagement",
  "Monitoring & Diagnostics",
]);

export function GuildSideNav({
  guildId,
  guildName,
  guildIcon,
  memberCount,
  guilds,
  username,
  avatar,
  isBotOwner,
  panicArmed,
}: {
  guildId: string;
  guildName: string;
  /** Fully-resolved icon URL for the *current* guild (comes over RPC). */
  guildIcon: string | null;
  memberCount: number;
  guilds: SwitcherGuild[];
  username: string;
  avatar: string;
  isBotOwner: boolean;
  /** Drives the Security category's alert dot. */
  panicArmed?: boolean;
}) {
  const groups = [
    { title: "Overview", links: guildTopLinks(guildId) },
    ...guildManagementGroups(guildId).map((group) => ({
      ...group,
      collapsible: true,
      defaultOpen: DEFAULT_OPEN_CATEGORIES.has(group.title),
      badge: group.links.length,
      alertDot: group.title === "Safety & Security" ? Boolean(panicArmed) : false,
    })),
  ];

  return (
    <SideNav
      groups={groups}
      tag="Dashboard"
      switcher={
        <GuildSwitcher
          guildId={guildId}
          guildName={guildName}
          guildIcon={guildIcon}
          memberCount={memberCount}
          guilds={guilds}
        />
      }
      footer={
        <SideNavUser
          username={username}
          avatar={avatar}
          role={isBotOwner ? "bot owner" : "manager"}
        />
      }
    />
  );
}

const MEMBERS = new Intl.NumberFormat("en-GB");

function GuildSwitcher({
  guildId,
  guildName,
  guildIcon,
  memberCount,
  guilds,
}: {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  memberCount: number;
  guilds: SwitcherGuild[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-control border border-border bg-surface-hover px-2.5 py-2 text-left outline-none transition-colors hover:border-border-strong">
        <GuildAvatar name={guildName} icon={guildIcon} />
        <span className="min-w-0 flex-1">
          <span className="font-display block truncate text-[14.5px] font-semibold text-fg">
            {guildName}
          </span>
          <span className="tabular block font-mono text-[12.5px] text-fg-subtle">
            {MEMBERS.format(memberCount)} members
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {guilds.map((g) => (
          <DropdownMenuItem key={g.id} asChild>
            <Link href={`/guild/${g.id}`}>
              <GuildAvatar name={g.name} icon={guildIconUrl(g.id, g.icon)} small />
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              {g.id === guildId ? (
                <Check aria-hidden className="size-3.5 shrink-0 text-accent-fg" />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/guilds">
            <Layers3 aria-hidden />
            All servers
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GuildAvatar({
  name,
  icon,
  small,
}: {
  name: string;
  icon: string | null;
  small?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-bg-subtle font-semibold text-fg-muted",
        small ? "size-5 text-[12px]" : "size-7 text-[13px]",
      )}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Discord CDN icon
        <img src={icon} alt="" className="size-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
