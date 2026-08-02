"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "#/lib/utils";

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
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            pathname === l.href
              ? "bg-accent-cyan/15 text-accent-cyan"
              : "text-white/60 hover:bg-white/5 hover:text-white",
          )}
        >
          <span className="text-base leading-none">{l.emoji}</span>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
