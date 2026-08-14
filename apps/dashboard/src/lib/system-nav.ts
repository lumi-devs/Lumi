import { Ban, ClipboardList, Globe, Network, Package, Power, ShieldUser } from "lucide-react";
import type { GuildNavGroup } from "#/lib/guild-nav";

export function systemNavGroups(): GuildNavGroup[] {
  return [
    {
      title: "Platform",
      links: [
        { href: "/system", label: "Global Config", icon: Globe },
        { href: "/system/modules", label: "Module Kill-Switches", icon: Power },
        { href: "/system/addons", label: "Addon Repositories", icon: Package },
      ],
    },
    {
      title: "Enforcement",
      links: [
        { href: "/system/blocklist", label: "Global Blocklist", icon: Ban },
        { href: "/system/users", label: "User Privacy / GDPR", icon: ShieldUser },
      ],
    },
    {
      title: "Diagnostics",
      links: [
        { href: "/system/shards", label: "Sharding Telemetry", icon: Network },
        { href: "/system/audit", label: "System Audit Log", icon: ClipboardList },
      ],
    },
  ];
}
