"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import type { GuildNavGroup, GuildNavLink } from "#/lib/guild-nav";

/** Horizontal glass nav bar: direct links plus one dropdown per group. */
export function TopNav({
  directLinks,
  groups = [],
}: {
  directLinks: GuildNavLink[];
  groups?: GuildNavGroup[];
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;
  const isGroupActive = (group: GuildNavGroup) =>
    group.links.some((l) => pathname === l.href);

  function navItemClass(active: boolean, extra?: string) {
    return cn(
      "flex shrink-0 items-center gap-1.5 rounded-control px-3 py-1.5 text-[13px] font-medium transition-colors",
      active
        ? "bg-accent-soft text-accent-fg"
        : "text-fg-subtle hover:bg-surface-hover hover:text-fg",
      extra,
    );
  }

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-border bg-bg/85 px-4 py-2 backdrop-blur-sm md:px-6">
      {directLinks.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={navItemClass(isActive(l.href))}
        >
          <l.icon aria-hidden className="size-4" />
          {l.label}
        </Link>
      ))}

      {groups.map((group) => (
        <DropdownMenu key={group.title}>
          <DropdownMenuTrigger
            className={navItemClass(isGroupActive(group), "outline-none")}
          >
            {group.title}
            <ChevronDown aria-hidden className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {group.links.map((l) => (
              <DropdownMenuItem key={l.href} asChild>
                <Link href={l.href}>
                  <l.icon aria-hidden />
                  {l.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );
}
