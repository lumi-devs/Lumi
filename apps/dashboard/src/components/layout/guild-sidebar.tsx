"use client";

import { usePathname } from "next/navigation";
import {
  Ban,
  ClipboardList,
  Gavel,
  History,
  IdCard,
  LayoutGrid,
  type LucideIcon,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  TriangleAlert,
  Volume2,
  Wand2,
  Wrench,
} from "lucide-react";
import { NavItem, NavSection } from "./nav-item";
import { Glyph } from "#/components/ui/glyph";
import type { DashboardModuleView } from "#/lib/dashboard-data";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Management routes. Icons come from lucide so the whole nav column shares
// one stroke weight and optical size — the previous emoji set (🔨 ⚠️ 🔐 🔊 🪪
// 🎛️ 🕘 📋 🚫 🧰) rendered at different widths per platform and is the single
// loudest "scaffolded UI" tell in the app.
function managementLinks(guildId: string): NavLink[] {
  const base = `/guild/${guildId}`;
  return [
    { href: `${base}/moderation`, label: "Moderation Cases", icon: Gavel },
    { href: `${base}/warn-thresholds`, label: "Warn Thresholds", icon: TriangleAlert },
    { href: `${base}/security`, label: "Security", icon: ShieldAlert },
    { href: `${base}/tempvc`, label: "Temp Voice Channels", icon: Volume2 },
    { href: `${base}/permits`, label: "Permits", icon: IdCard },
    { href: `${base}/overrides`, label: "Overrides", icon: SlidersHorizontal },
    { href: `${base}/history`, label: "Settings History", icon: History },
    { href: `${base}/audit`, label: "Audit Log", icon: ClipboardList },
    { href: `${base}/blocklist`, label: "Blocklist", icon: Ban },
    { href: `${base}/advanced`, label: "Advanced", icon: Wrench },
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
    <nav
      aria-label="Server settings"
      className="flex w-full shrink-0 flex-col gap-5 md:sticky md:top-[57px] md:max-h-[calc(100vh-57px)] md:w-56 md:overflow-y-auto md:pb-6"
    >
      <NavSection title="Server">
        <NavItem
          href={`/guild/${guildId}`}
          label="General"
          icon={Settings}
          active={isActive(`/guild/${guildId}`)}
        />
        <NavItem
          href={`/guild/${guildId}/modules`}
          label="Modules"
          icon={LayoutGrid}
          active={pathname?.startsWith(`/guild/${guildId}/modules`)}
        />
        <NavItem
          href={`/guild/${guildId}/setup`}
          label="Guided Setup"
          icon={Wand2}
          active={pathname === `/guild/${guildId}/setup`}
        />
      </NavSection>

      <NavSection title={`Modules · ${modules.length}`}>
        {modules.map((m) => (
          <NavItem
            key={m.name}
            href={`/guild/${guildId}/modules/${m.name}`}
            label={m.displayName}
            leading={<Glyph emoji={m.emoji} size="sm" />}
            active={pathname === `/guild/${guildId}/modules/${m.name}`}
            enabled={m.enabled || m.name === "core"}
          />
        ))}
      </NavSection>

      <NavSection title="Management">
        {managementLinks(guildId).map((l) => (
          <NavItem
            key={l.href}
            href={l.href}
            label={l.label}
            icon={l.icon}
            active={pathname === l.href}
          />
        ))}
      </NavSection>
    </nav>
  );
}
