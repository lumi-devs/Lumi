import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type Guild } from "discord.js";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetService } from "#lib/module-system/Service.js";
import { resolveAuditLogExecutor } from "../lib/audit.js";

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

    const security = tryGetService("security");
    if (!security) return;

    await security.evaluateNukeEvent(newGuild, "vanity_change", () =>
      resolveAuditLogExecutor(
        newGuild,
        AuditLogEvent.GuildUpdate,
        undefined,
        "vanity_url_code",
      ),
    );
  }

}
