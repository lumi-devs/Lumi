import { Events } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { AuditLogEvent, type Guild } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { resolveAuditLogExecutor } from "#src/modules/security/services/Audit.js";
import { evaluateNukeEvent } from "#src/modules/security/services/AntiNuke.js";

export const SecurityGuildUpdateListener = defineListener({
  name: "securityGuildUpdate",
  event: Events.GuildUpdate,
  module: "security",
  guildId: (oldGuild: Guild, _newGuild: Guild) => oldGuild.id,
  async execute(_services: Container, oldGuild: Guild, newGuild: Guild): Promise<void> {
    if (oldGuild.vanityURLCode === newGuild.vanityURLCode) return;

    await evaluateNukeEvent(newGuild, "vanity_change", () =>
      resolveAuditLogExecutor(
        newGuild,
        AuditLogEvent.GuildUpdate,
        undefined,
        "vanity_url_code",
      ),
    );
  },
});
