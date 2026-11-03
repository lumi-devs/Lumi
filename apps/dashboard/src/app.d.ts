import type { SessionRecord } from "#lib/server/session.js";
import type { GuildAccess } from "#lib/server/types.js";

declare global {
  namespace App {
    interface Locals {
      sessionId: string | null;
      session: SessionRecord | null;
      guildCache?: Map<string, GuildAccess>;
    }
  }
}
