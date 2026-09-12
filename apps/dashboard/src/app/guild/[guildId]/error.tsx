"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PlugZap } from "lucide-react";
import { RpcFailureCodes } from "@lumi/contracts";
import { Card } from "#/components/ui/card";
import { buttonVariants } from "#/components/ui/button-variants";
import { Reveal } from "#/components/reveal";
import { PulseIcon } from "#/components/pulse-icon";
import { InviteLink } from "#/components/invite-link";
import { inviteReturnToFrom } from "#/lib/invite";
import { GuildUnavailable } from "#/components/guild-unavailable";

function isGuildMissingClient(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; message?: string };
  return (
    anyErr.code === RpcFailureCodes.GuildNotFound ||
    Boolean(anyErr.message?.includes(RpcFailureCodes.GuildNotFound))
  );
}

function InviteNeeded({ guildId }: { guildId: string }) {
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
          <PulseIcon icon={<PlugZap className="size-5" aria-hidden />} />
          <div className="max-w-sm">
            <p className="font-display text-[17px] font-semibold tracking-[0.01em] text-fg">
              Lumi isn&rsquo;t in this server yet
            </p>
            <p className="mt-1.5 text-[15px] leading-5 text-fg-muted">
              Invite the bot to continue. If it&rsquo;s already there, check
              that the Dashboard module is enabled for this guild.
            </p>
          </div>
          <InviteLink
            clientId={process.env["NEXT_PUBLIC_DISCORD_CLIENT_ID"] ?? ""}
            guildId={guildId}
            returnTo={inviteReturnToFrom(process.env["NEXT_PUBLIC_DASHBOARD_URL"] ?? "")}
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Invite Lumi
          </InviteLink>
          <p className="font-mono text-[13px] text-fg-subtle">{guildId}</p>
        </Card>
      </Reveal>
    </main>
  );
}

export default function GuildError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const guildId = (params?.guildId as string) ?? "";

  useEffect(() => {
    console.error("Guild boundary error:", error);
  }, [error]);

  if (isGuildMissingClient(error)) {
    return <InviteNeeded guildId={guildId} />;
  }

  return <GuildUnavailable guildId={guildId} />;
}
