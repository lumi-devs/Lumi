import Link from "next/link";
import {
  History,
  LayoutGrid,
  type LucideIcon,
  Package,
  Settings,
  SlidersHorizontal,
  Volume2,
  Wrench,
} from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { Card } from "#/components/ui/card";
import { PageHeader } from "#/components/ui/page-header";

interface ConfigArea {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Only set where a real number backs it — no fabricated counts. */
  meta?: string;
}

export default async function GuildConfigPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);
  const base = `/guild/${guildId}/config`;

  const modules = data.modules.filter((m) => !m.isAddon);
  const addons = data.modules.filter((m) => m.isAddon);
  const enabledModules = modules.filter((m) => m.enabled || m.name === "core");

  const areas: ConfigArea[] = [
    {
      href: `${base}/modules`,
      label: "Modules",
      description:
        "Turn a feature on or off, and open one to edit the fields it exposes.",
      icon: LayoutGrid,
      meta: `${enabledModules.length} of ${modules.length} enabled`,
    },
    {
      href: `${base}/addons`,
      label: "Addons",
      description:
        "Third-party modules loaded from an addon repository, kept separate from the bot's core features.",
      icon: Package,
      meta:
        addons.length > 0
          ? `${addons.filter((m) => m.enabled).length} of ${addons.length} enabled`
          : "none installed",
    },
    {
      href: `${base}/general`,
      label: "General",
      description:
        "Command prefix, mute role, locale, and timezone — the basics every module reads from.",
      icon: Settings,
    },
    {
      href: `${base}/advanced`,
      label: "Advanced",
      description:
        "Ignored channels, AFK records, and the raw rows a module keeps for this server.",
      icon: Wrench,
    },
    {
      href: `${base}/voice`,
      label: "Voice generators",
      description:
        "Join-to-create channels: which channel spawns a temporary room, and what it is named.",
      icon: Volume2,
    },
    {
      href: `${base}/history`,
      label: "Settings history",
      description:
        "Every config change, in order, with the values before and after — and a rollback.",
      icon: History,
    },
    {
      href: `/guild/${guildId}/security/overrides`,
      label: "Permission overrides",
      description:
        "Per-role and per-channel exceptions layered on top of a module's guild-wide config.",
      icon: SlidersHorizontal,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={Settings}
          title="Configuration"
          description="Everything that decides how Lumi behaves in this server, grouped by what it changes."
        />
      </div>

      <div
        className="rise grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        style={{ "--rise-delay": "70ms" } as React.CSSProperties}
      >
        {areas.map((area) => (
          <Link key={area.href} href={area.href} className="group">
            <Card
              interactive
              className="flex h-full flex-col gap-2.5 p-4"
            >
              <span className="flex size-9 items-center justify-center rounded-control border border-border bg-accent-soft text-accent-fg">
                <area.icon aria-hidden className="size-4" />
              </span>
              <span className="font-display text-[15.5px] font-semibold tracking-[0.01em] text-fg group-hover:underline">
                {area.label}
              </span>
              <p className="text-[14px] leading-5 text-fg-muted">
                {area.description}
              </p>
              {area.meta ? (
                <span className="tabular mt-auto font-mono text-[12.5px] text-fg-subtle">
                  {area.meta}
                </span>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
