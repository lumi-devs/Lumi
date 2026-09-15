"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { GuildUnavailable } from "#/components/guild-unavailable";

// A guild the bot has left is caught by the layout, which renders the
// server-side invite prompt; anything reaching this boundary is an outage.
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

  return <GuildUnavailable guildId={guildId} />;
}
