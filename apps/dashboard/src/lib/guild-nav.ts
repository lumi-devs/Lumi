import {
  Ban,
  ClipboardList,
  Gavel,
  HeartPulse,
  History,
  IdCard,
  LayoutGrid,
  type LucideIcon,
  Package,
  Scale,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  StickyNote,
  TriangleAlert,
  Volume2,
  Wand2,
  Wrench,
} from "lucide-react";

export interface GuildNavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface GuildNavGroup {
  title: string;
  links: GuildNavLink[];
  /** Renders a chevron toggle and lets the group collapse. Static groups (e.g. `/system`'s) omit this and always render expanded. */
  collapsible?: boolean;
  /** Only meaningful when `collapsible` is true. */
  defaultOpen?: boolean;
  /** Mono count badge next to the title. */
  badge?: number;
  /** Small red dot next to the title, for "something here needs attention". */
  alertDot?: boolean;
}

// Shared by `GuildSideNav` (rendered) and `CommandPalette` (searched); a link
// added here must reach both.
export function guildTopLinks(guildId: string): GuildNavLink[] {
  const base = `/guild/${guildId}`;
  return [
    { href: base, label: "General", icon: Settings },
    { href: `${base}/modules`, label: "Modules", icon: LayoutGrid },
    { href: `${base}/addons`, label: "Addons", icon: Package },
    { href: `${base}/setup`, label: "Guided Setup", icon: Wand2 },
  ];
}

// Consumed by `GuildSideNav` (rendered as rail sections) and
// `CommandPalette` (flattened for search); a link added here must reach both.
export function guildManagementGroups(guildId: string): GuildNavGroup[] {
  const base = `/guild/${guildId}`;
  return [
    {
      title: "Moderation",
      links: [
        { href: `${base}/moderation`, label: "Moderation Cases", icon: Gavel },
        { href: `${base}/warn-thresholds`, label: "Warn Thresholds", icon: TriangleAlert },
        { href: `${base}/blocklist`, label: "Blocklist", icon: Ban },
        { href: `${base}/mod-notes`, label: "Mod Notes", icon: StickyNote },
      ],
    },
    {
      title: "Security",
      links: [
        { href: `${base}/security`, label: "Panic & Verification", icon: ShieldAlert },
        { href: `${base}/overrides`, label: "Overrides", icon: SlidersHorizontal },
        { href: `${base}/health`, label: "Health Check", icon: HeartPulse },
      ],
    },
    {
      title: "Community",
      links: [
        { href: `${base}/permits`, label: "Permits", icon: IdCard },
        { href: `${base}/appeals`, label: "Appeals", icon: Scale },
      ],
    },
    {
      title: "System",
      links: [
        { href: `${base}/tempvc`, label: "Voice Generators", icon: Volume2 },
        { href: `${base}/history`, label: "Settings History", icon: History },
        { href: `${base}/audit`, label: "Audit Log", icon: ClipboardList },
        { href: `${base}/advanced`, label: "Advanced", icon: Wrench },
      ],
    },
  ];
}
