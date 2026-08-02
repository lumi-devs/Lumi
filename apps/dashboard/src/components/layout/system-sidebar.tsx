"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "./nav-item";

const LINKS = [
  { href: "/system", label: "Global Config", emoji: "🌐" },
  { href: "/system/modules", label: "Module Kill-Switches", emoji: "🔌" },
  { href: "/system/addons", label: "Addon Repositories", emoji: "🧩" },
  { href: "/system/blocklist", label: "Global Blocklist", emoji: "🚫" },
  { href: "/system/audit", label: "System Audit Log", emoji: "📋" },
  { href: "/system/users", label: "User Privacy / GDPR", emoji: "🔒" },
  { href: "/system/shards", label: "Sharding Telemetry", emoji: "📡" },
];

export function SystemSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-full shrink-0 flex-col gap-0.5 md:w-60">
      <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-white/40 uppercase">
        System Panel
      </p>
      {LINKS.map((l) => (
        <NavItem
          key={l.href}
          href={l.href}
          label={l.label}
          emoji={l.emoji}
          active={pathname === l.href}
        />
      ))}
    </nav>
  );
}
