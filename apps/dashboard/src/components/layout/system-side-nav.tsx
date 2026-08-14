"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SideNav, SideNavUser } from "#/components/layout/side-nav";
import { systemNavGroups } from "#/lib/system-nav";

export function SystemSideNav({
  username,
  avatar,
}: {
  username: string;
  avatar: string;
}) {
  return (
    <SideNav
      groups={systemNavGroups()}
      tag="System"
      switcher={
        <Link
          href="/"
          className="flex w-full items-center gap-2.5 rounded-control border border-border bg-surface-hover px-2.5 py-2 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0 text-fg-subtle" />
          Back to servers
        </Link>
      }
      footer={
        <SideNavUser username={username} avatar={avatar} role="bot owner" />
      }
    />
  );
}
