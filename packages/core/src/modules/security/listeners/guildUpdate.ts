import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type Guild } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { resolveAuditLogExecutor } from "../services/audit.js";
import { evaluateNukeEvent } from "../services/anti-nuke.js";

@ApplyOptions<ModuleListener.Options>({
  name: "securityGuildUpdate",
  event: Events.GuildUpdate,
  module: "security",
})
export class SecurityGuildUpdateListener extends ModuleListener<
  typeof Events.GuildUpdate
> {
  protected override resolveGuildId(oldGuild: Guild): string | null {
    return oldGuild.id;
  }

  protected async handle(oldGuild: Guild, newGuild: Guild): Promise<void> {
    if (oldGuild.vanityURLCode === newGuild.vanityURLCode) return;

    await evaluateNukeEvent(newGuild, "vanity_change", () =>
      resolveAuditLogExecutor(
        newGuild,
        AuditLogEvent.GuildUpdate,
        undefined,
        "vanity_url_code",
      ),
    );
  }

}
