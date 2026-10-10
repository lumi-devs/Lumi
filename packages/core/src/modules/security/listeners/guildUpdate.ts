import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import { AuditLogEvent, type Guild } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { resolveAuditLogExecutor } from "@lumi/application/services/security/audit.js";
import { evaluateNukeEvent } from "@lumi/application/services/security/anti-nuke.js";

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
