import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "#/components/ui/card";
import { Reveal } from "#/components/reveal";
import { LoadFailure } from "#/components/ui/load-failure";

export function GuildUnavailable({
  guildId,
  error,
}: {
  guildId: string;
  error?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-10 pb-24">
      <Link
        href="/guilds"
        className="group inline-flex items-center gap-1.5 self-start text-[14px] text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft
          className="size-3.5 transition-transform duration-fast group-hover:-translate-x-0.5"
          aria-hidden
        />
        All servers
      </Link>

      <Reveal delay={0.05}>
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <LoadFailure
            what="This server's settings"
            title="Lumi couldn't be reached"
            description="Your settings are safe — the bot just isn't answering right now. Check that it is online and connected to the message broker, then reload."
            error={error}
          />
          <p className="font-mono text-[13px] text-fg-subtle">{guildId}</p>
        </Card>
      </Reveal>
    </main>
  );
}
