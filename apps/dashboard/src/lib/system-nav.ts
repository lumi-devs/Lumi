import { Ban, ClipboardList, Globe, Network, Package, Power, ShieldUser } from "lucide-react";
import type { GuildNavLink } from "#/lib/guild-nav";

// Shared by `SystemTopNav` (rendered) and `CommandPalette` (searched); a link
// added here must reach both.
export function systemTopLinks(): GuildNavLink[] {
  return [
    { href: "/system", label: "Global Config", icon: Globe },
    { href: "/system/modules", label: "Module Kill-Switches", icon: Power },
    { href: "/system/addons", label: "Addon Repositories", icon: Package },
    { href: "/system/blocklist", label: "Global Blocklist", icon: Ban },
    { href: "/system/audit", label: "System Audit Log", icon: ClipboardList },
    { href: "/system/users", label: "User Privacy / GDPR", icon: ShieldUser },
    { href: "/system/shards", label: "Sharding Telemetry", icon: Network },
  ];
}
