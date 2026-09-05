"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import type { GuildSummaryView } from "@lumi/contracts";
import type { OAuthGuild } from "#/lib/discord";
import { ArrowRight, Crown, Layers3, Search, ServerOff } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { PageHeader } from "#/components/ui/page-header";
import { TiltCard } from "#/components/motion/tilt-card";
import { spotlightHandler, useStaggerIn } from "#/lib/animate";
import { guildIconUrl } from "#/lib/discord-format";
import { cn } from "#/lib/utils";

const Colors = [
  "#2953d8", "#12805a", "#c7333f", "#92600a",
  "#a23b8f", "#c1622f", "#6d5bd0", "#0f8a8a",
];

function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return Colors[Math.abs(hash) % Colors.length]!;
}

function GuildTile({
  guild,
  summary,
  hero,
}: {
  guild: OAuthGuild;
  /** Real bot-side data (icon/banner/member count), when the fetch succeeded. */
  summary?: GuildSummaryView;
  /** Larger, 2x2 lead tile - the one server most worth surfacing first. */
  hero?: boolean;
}) {
  const icon = summary?.icon ?? guildIconUrl(guild.id, guild.icon);
  const color = colorFor(guild.id);
  const initial = guild.name.slice(0, 1).toUpperCase();
  const banner = summary?.banner;

  return (
    <TiltCard className={hero ? "sm:col-span-2 sm:row-span-2" : undefined}>
      <Link
        href={`/guild/${guild.id}`}
        onMouseMove={spotlightHandler}
        className={cn(
          "spotlight group relative flex h-full flex-col justify-between overflow-hidden rounded-panel border border-border bg-surface bg-cover bg-center p-4",
          "transition-[transform,box-shadow,border-color] duration-normal ease-[var(--ease-out)]",
          "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-glow-accent",
        )}
        style={{
          backgroundImage: banner
            ? // Scrim + real server banner. The scrim is a fixed black gradient
              // (not a theme token) on purpose - it exists to keep the text on
              // top legible against an arbitrary photo, in either theme, the
              // same way a Spotify/Netflix card overlay would.
              `linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.4)), url(${banner})`
            : `radial-gradient(120% 100% at 100% 0%, color-mix(in srgb, ${color} 12%, transparent), transparent 60%)`,
        }}
      >
        {/* Decorative watermark - only when there's no real banner to show instead. */}
        {banner ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -bottom-5 font-display leading-none font-bold select-none"
            style={{
              color,
              opacity: 0.08,
              fontSize: hero ? "9rem" : "5rem",
            }}
          >
            {initial}
          </span>
        )}

        <div className="relative flex items-start justify-between gap-2">
          <span
            className={cn(
              "flex shrink-0 items-center justify-center overflow-hidden rounded-control font-semibold text-white",
              hero ? "size-14 text-[22px]" : "size-10 text-[15px]",
              banner ? "ring-1 ring-white/25" : "",
            )}
            style={{ backgroundColor: icon ? undefined : color }}
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <Badge
            variant={banner ? undefined : guild.owner ? "accent" : "neutral"}
            className={cn(
              "shrink-0",
              banner ? "border-white/25 bg-black/35 text-white" : "",
            )}
          >
            {guild.owner ? <Crown className="size-3" aria-hidden /> : null}
            {guild.owner ? "Owner" : "Manager"}
          </Badge>
        </div>

        <div className="relative mt-3">
          <p
            className={cn(
              "font-display truncate font-semibold tracking-[0.005em]",
              banner ? "text-white" : "text-fg",
              hero ? "text-[22px]" : "text-[16px]",
            )}
          >
            {guild.name}
          </p>
          {hero && summary?.memberCount ? (
            <p
              className={cn(
                "tabular mt-0.5 text-[14.5px]",
                banner ? "text-white/70" : "text-fg-subtle",
              )}
            >
              {summary.memberCount.toLocaleString()} members
            </p>
          ) : null}
          <p
            className={cn(
              "mt-1 flex items-center gap-1 transition-colors",
              banner
                ? "text-white/75 group-hover:text-white"
                : "text-fg-muted group-hover:text-accent-fg",
              hero ? "text-[15px]" : "text-[14px]",
            )}
          >
            Open dashboard
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-fast group-hover:translate-x-0.5"
            />
          </p>
        </div>
      </Link>
    </TiltCard>
  );
}

export function GuildPicker({
  session,
  summaries = [],
}: {
  session: Session;
  /** Real bot-side icon/banner/member-count data, keyed by guild id when present. */
  summaries?: GuildSummaryView[];
}) {
  const [query, setQuery] = useState("");
  // Tiles are now `TiltCard` divs (the tilt wrapper), not anchors directly.
  const gridRef = useStaggerIn<HTMLDivElement>("> div", { delay: 30 });
  const summaryByGuildId = useMemo(
    () => new Map(summaries.map((s) => [s.guildId, s])),
    [summaries],
  );

  const guilds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return session.guilds;
    return session.guilds.filter((g) => g.name.toLowerCase().includes(q));
  }, [session.guilds, query]);

  // The hero tile only makes sense against a stable, unfiltered list - a
  // search result reordering which tile is "featured" reads as a glitch, not
  // a feature, so filtering drops back to a flat grid.
  const showHero = !query.trim() && guilds.length > 1;
  const heroGuild = showHero
    ? (guilds.find((g) => g.owner) ?? guilds[0])
    : undefined;
  const restGuilds = heroGuild
    ? guilds.filter((g) => g.id !== heroGuild.id)
    : guilds;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-10 pb-24 md:px-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          className="pb-0"
          title="Your servers"
          description="Servers where you have Manage Server. Pick one to configure Lumi."
          icon={Layers3}
        />
        {session.guilds.length > 5 ? (
          <div className="relative w-full max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter servers…"
              aria-label="Filter servers"
              className="h-9 pl-8"
            />
          </div>
        ) : null}
      </div>

      {session.guilds.length === 0 ? (
        <div className="rise rounded-panel border border-border bg-surface">
          <EmptyState
            icon={ServerOff}
            title="No servers where you have Manage Server"
            description="Lumi's dashboard only lists servers where your Discord account holds the Manage Server permission. Ask an admin to grant it, then reload."
          />
        </div>
      ) : guilds.length === 0 ? (
        <p
          className="rise text-[15px] text-fg-muted"
          style={{ "--rise-delay": "70ms" } as React.CSSProperties}
        >
          No servers match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-1 gap-3 sm:auto-rows-[132px] sm:grid-cols-3 lg:grid-cols-4"
          style={{ "--rise-delay": "70ms" } as React.CSSProperties}
        >
          {heroGuild ? (
            <GuildTile
              guild={heroGuild}
              summary={summaryByGuildId.get(heroGuild.id)}
              hero
            />
          ) : null}
          {restGuilds.map((g) => (
            <GuildTile key={g.id} guild={g} summary={summaryByGuildId.get(g.id)} />
          ))}
        </div>
      )}
    </main>
  );
}
