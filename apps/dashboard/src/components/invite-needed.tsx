import Link from "next/link";
import { ArrowLeft, PlugZap } from "lucide-react";
import { Card } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { buttonVariants } from "#/components/ui/button-variants";
import { env } from "#/lib/env";

export function InviteNeeded({ guildId }: { guildId: string }) {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.discordClientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`;
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pt-10 pb-24">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 self-start text-[12px] text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All servers
      </Link>

      <Card>
        <EmptyState
          icon={PlugZap}
          title="Lumi isn't in this server yet"
          description={
            <>
              Invite the bot to continue. If it is already there, check that the
              Dashboard module is enabled for this guild.
            </>
          }
          action={
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Invite Lumi
            </a>
          }
          footnote={guildId}
        />
      </Card>
    </main>
  );
}
