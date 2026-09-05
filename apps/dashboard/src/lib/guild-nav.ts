import {
  Ban,
  ClipboardList,
  Gavel,
  HeartPulse,
  History,
  IdCard,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  Package,
  Scale,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  StickyNote,
  TrendingUp,
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
    { href: base, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/config`, label: "Configuration", icon: Settings },
    { href: `${base}/setup`, label: "Guided Setup", icon: Wand2 },
  ];
}

// Consumed by `GuildSideNav` (rendered as rail sections) and
// `CommandPalette` (flattened for search); a link added here must reach both.
export function guildManagementGroups(guildId: string): GuildNavGroup[] {
  const base = `/guild/${guildId}`;
  return [
    {
      title: "Discipline & Appeals",
      links: [
        { href: `${base}/moderation`, label: "Moderation Cases", icon: Gavel },
        { href: `${base}/moderation/thresholds`, label: "Warn Thresholds", icon: TriangleAlert },
        { href: `${base}/moderation/blocklist`, label: "Blocklist", icon: Ban },
        { href: `${base}/moderation/notes`, label: "Mod Notes", icon: StickyNote },
        { href: `${base}/appeals`, label: "Appeals", icon: Scale },
      ],
    },
    {
      title: "Safety & Security",
      links: [
        { href: `${base}/security`, label: "Panic & Verification", icon: ShieldAlert },
        { href: `${base}/security/overrides`, label: "Overrides", icon: SlidersHorizontal },
      ],
    },
    {
      title: "Community & Engagement",
      links: [
        { href: `${base}/permits`, label: "Permits", icon: IdCard },
      ],
    },
    {
      title: "Monitoring & Diagnostics",
      links: [
        { href: `${base}/health`, label: "Health Dashboard", icon: HeartPulse },
        { href: `${base}/monitoring/activity`, label: "Activity & Trends", icon: TrendingUp },
        { href: `${base}/monitoring/audit`, label: "Audit Log", icon: ClipboardList },
      ],
    },
    {
      title: "Configuration",
      links: [
        { href: `${base}/config/modules`, label: "Modules", icon: LayoutGrid },
        { href: `${base}/config/addons`, label: "Addons", icon: Package },
        { href: `${base}/config/general`, label: "General", icon: Settings },
        { href: `${base}/config/advanced`, label: "Advanced", icon: Wrench },
        { href: `${base}/config/voice`, label: "Voice Generators", icon: Volume2 },
        { href: `${base}/config/history`, label: "Settings History", icon: History },
      ],
    },
  ];
}
