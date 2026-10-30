import type { SessionRecord } from "$lib/server/session";
import type { GuildAccess } from "$lib/server/types";

declare global {
  namespace App {
    interface Locals {
      sessionId: string | null;
      session: SessionRecord | null;
      guildCache?: Map<string, GuildAccess>;
    }
  }
}
