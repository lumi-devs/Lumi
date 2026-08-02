import Link from "next/link";
import { Card } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { env } from "#/lib/env";

/** Shown when `guild.dashboard.get` fails — bot isn't in this guild (or its dashboard module is disabled). */
export function InviteNeeded({ guildId }: { guildId: string }) {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${env.discordClientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`;
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <Link href="/" className="mb-6 self-start text-sm text-white/50 hover:text-white">
        ← All servers
      </Link>
      <Card className="w-full">
        <div className="mb-3 text-3xl text-accent-cyan">✦</div>
        <h2 className="font-brand mb-2 text-lg font-semibold">
          Lumi isn&apos;t in this server yet
        </h2>
        <p className="mb-6 text-sm text-white/50">
          Invite Lumi to your server, or make sure the Dashboard module is
          enabled for <code className="text-white/70">{guildId}</code>.
        </p>
        <a href={inviteUrl} target="_blank" rel="noreferrer">
          <Button className="w-full">Invite Lumi</Button>
        </a>
      </Card>
    </main>
  );
}
