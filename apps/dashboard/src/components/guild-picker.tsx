import Link from "next/link";
import type { Session } from "next-auth";
import { ChevronRight, ServerOff } from "lucide-react";
import { Card } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import { guildIconUrl } from "#/lib/discord";

const COLORS = [
  "#5865f2", "#3ba55d", "#ed4245", "#faa81a",
  "#eb459e", "#f47b67", "#7b6ef6", "#00a8a8",
];

function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

export function GuildPicker({ session }: { session: Session }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-8 pb-24">
      <PageHeader
        title="Your servers"
        description="Servers where you have Manage Server. Pick one to configure Lumi for it."
      />

      {session.guilds.length === 0 ? (
        <Card>
          <EmptyState
            icon={ServerOff}
            title="No servers where you have Manage Server"
            description="Lumi's dashboard only lists servers where your Discord account holds the Manage Server permission. Ask an admin to grant it, then reload."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {session.guilds.map((g) => {
              const icon = guildIconUrl(g.id, g.icon);
              return (
                <li key={g.id}>
                  <Link
                    href={`/guild/${g.id}`}
                    className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-control text-[12px] font-semibold text-white"
                      style={{ backgroundColor: icon ? undefined : colorFor(g.id) }}
                    >
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={icon} alt="" className="size-full object-cover" />
                      ) : (
                        g.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-display block truncate text-[13px] font-semibold tracking-[0.01em] text-fg">
                        {g.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-fg-subtle">
                        {g.id}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-fg-subtle transition-colors group-hover:text-fg"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </main>
  );
}
