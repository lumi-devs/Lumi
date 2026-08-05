"use client";

import { usePathname } from "next/navigation";
import {
  Ban,
  ClipboardList,
  Globe,
  Network,
  Package,
  Power,
  ShieldUser,
} from "lucide-react";
import { NavItem, NavSection } from "./nav-item";

const LINKS = [
  { href: "/system", label: "Global Config", icon: Globe },
  { href: "/system/modules", label: "Module Kill-Switches", icon: Power },
  { href: "/system/addons", label: "Addon Repositories", icon: Package },
  { href: "/system/blocklist", label: "Global Blocklist", icon: Ban },
  { href: "/system/audit", label: "System Audit Log", icon: ClipboardList },
  { href: "/system/users", label: "User Privacy / GDPR", icon: ShieldUser },
  { href: "/system/shards", label: "Sharding Telemetry", icon: Network },
];

export function SystemSidebar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="System panel"
      className="flex w-full shrink-0 flex-col md:sticky md:top-[57px] md:w-56"
    >
      <NavSection title="System Panel">
        {LINKS.map((l) => (
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
