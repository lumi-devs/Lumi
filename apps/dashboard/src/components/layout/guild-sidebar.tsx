"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar";
import { Glyph } from "#/components/ui/glyph";
import { StatusDot } from "#/components/ui/badge";
import { Wordmark } from "./wordmark";
import { useCollapsedNavGroups } from "#/hooks/use-collapsed-nav-groups";
import type { DashboardModuleView } from "#/lib/dashboard-data";
import { guildManagementGroups, guildTopLinks, type GuildNavGroup } from "#/lib/guild-nav";

const MotionChevron = motion.create(ChevronRight);

function CollapsibleNavGroup({
  guildId,
  group,
  isActive,
}: {
  guildId: string;
  group: GuildNavGroup;
  isActive: (href: string) => boolean;
}) {
  const { collapsed, toggle } = useCollapsedNavGroups(guildId);
  const open = !collapsed.has(group.title);

  return (
    <Collapsible open={open} onOpenChange={() => toggle(group.title)}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="w-full cursor-pointer gap-1.5">
            <MotionChevron
              aria-hidden
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="size-3 shrink-0"
            />
            {group.title}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.links.map((l) => (
                <SidebarMenuItem key={l.href}>
                  <SidebarMenuButton asChild isActive={isActive(l.href)}>
                    <Link href={l.href}>
                      <l.icon aria-hidden />
                      <span>{l.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function GuildSidebar({
  guildId,
  modules,
}: {
  guildId: string;
  modules: DashboardModuleView[];
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === `/guild/${guildId}` ? pathname === href : pathname?.startsWith(href);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link href="/" aria-label="Lumi home" className="flex items-center gap-2 px-2 py-1.5">
          <Wordmark />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {guildTopLinks(guildId).map((l) => (
                <SidebarMenuItem key={l.href}>
                  <SidebarMenuButton asChild isActive={isActive(l.href)}>
                    <Link href={l.href}>
                      <l.icon aria-hidden />
                      <span>{l.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Modules · {modules.length}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {modules.map((m) => {
                const href = `/guild/${guildId}/modules/${m.name}`;
                const enabled = m.enabled || m.name === "core";
                return (
                  <SidebarMenuItem key={m.name}>
                    <SidebarMenuButton asChild isActive={pathname === href}>
                      <Link href={href}>
                        <Glyph emoji={m.emoji} size="sm" />
                        <span className="truncate">{m.displayName}</span>
                        <StatusDot
                          active={enabled}
                          className="ml-auto"
                          title={enabled ? "Enabled" : "Disabled"}
                        />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {guildManagementGroups(guildId).map((group) => (
          <CollapsibleNavGroup
            key={group.title}
            guildId={guildId}
            group={group}
            isActive={(href) => pathname === href}
          />
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
