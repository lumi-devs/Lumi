import Link from "next/link";
import type { Session } from "next-auth";
import { guildIconUrl } from "#/lib/discord";

const COLORS = [
  "#38bdf8", "#10b981", "#f43f5e", "#f59e0b",
  "#ec4899", "#f97316", "#8b5cf6", "#14b8a6",
];

function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

/** Authenticated home view — dashboard.md §11 `GET /` (session branch). */
export function GuildPicker({ session }: { session: Session }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24">
      <div className="mb-6">
        <h1 className="font-brand text-2xl font-bold">Your servers</h1>
        <p className="text-sm text-white/50">
          Pick a server to manage. If Lumi isn&apos;t there yet, you&apos;ll
          be prompted to invite it.
        </p>
      </div>
      {session.guilds.length === 0 ? (
        <p className="text-white/50">
          No servers where you have <strong>Manage Server</strong>.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {session.guilds.map((g) => {
            const icon = guildIconUrl(g.id, g.icon);
            return (
              <Link
                key={g.id}
                href={`/guild/${g.id}`}
                className="glass-card flex items-center gap-3 rounded-xl p-4 transition-transform hover:-translate-y-0.5"
              >
                <span
                  className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
                  style={{ backgroundColor: icon ? undefined : colorFor(g.id) }}
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" className="size-full object-cover" />
                  ) : (
                    g.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="truncate text-sm font-semibold">
                  {g.name}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
