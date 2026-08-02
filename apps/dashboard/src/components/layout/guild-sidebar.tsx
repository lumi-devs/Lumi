"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "./nav-item";
import type { DashboardModuleView } from "#/lib/dashboard-data";

interface NavLink {
  href: string;
  label: string;
  emoji: string;
}

/** Stub pages — dashboard.md §9B rows without a wired-up form yet. See each page.tsx for the Prisma model TODO comment. */
function managementLinks(guildId: string): NavLink[] {
  const base = `/guild/${guildId}`;
  return [
    { href: `${base}/moderation`, label: "Moderation Cases", emoji: "🔨" },
    { href: `${base}/warn-thresholds`, label: "Warn Thresholds", emoji: "⚠️" },
    { href: `${base}/security`, label: "Security", emoji: "🔐" },
    { href: `${base}/tempvc`, label: "Temp Voice Channels", emoji: "🔊" },
    { href: `${base}/permits`, label: "Permits", emoji: "🪪" },
    { href: `${base}/overrides`, label: "Overrides", emoji: "🎛️" },
    { href: `${base}/history`, label: "Settings History", emoji: "🕘" },
    { href: `${base}/audit`, label: "Audit Log", emoji: "📋" },
    { href: `${base}/blocklist`, label: "Blocklist", emoji: "🚫" },
    { href: `${base}/advanced`, label: "Advanced", emoji: "🧰" },
  ];
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
    <nav className="flex w-full shrink-0 flex-col gap-6 md:w-60">
      <div>
        <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-white/40 uppercase">
          Server
        </p>
        <NavItem
          href={`/guild/${guildId}`}
          label="General"
          emoji="⚙️"
          active={isActive(`/guild/${guildId}`)}
        />
        <NavItem
          href={`/guild/${guildId}/modules`}
          label="Modules"
          emoji="🧩"
          active={pathname?.startsWith(`/guild/${guildId}/modules`)}
        />
      </div>

      <div>
        <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-white/40 uppercase">
          Modules
        </p>
        <div className="flex flex-col gap-0.5">
          {modules.map((m) => (
            <NavItem
              key={m.name}
              href={`/guild/${guildId}/modules/${m.name}`}
              label={m.displayName}
              emoji={m.emoji}
              active={pathname === `/guild/${guildId}/modules/${m.name}`}
              enabled={m.enabled || m.name === "core"}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-white/40 uppercase">
          Management
        </p>
        <div className="flex flex-col gap-0.5">
          {managementLinks(guildId).map((l) => (
            <NavItem
              key={l.href}
              href={l.href}
              label={l.label}
              emoji={l.emoji}
              active={pathname === l.href}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
