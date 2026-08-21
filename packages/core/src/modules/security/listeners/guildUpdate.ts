import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { AuditLogEvent, type Guild } from "discord.js";
import { isNullish } from "@sapphire/utilities";
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

    const config = await security.loadAntiNukeConfig(newGuild.id);
    if (!config.enabled) return;

    const executorId = await resolveAuditLogExecutor(
      newGuild,
      AuditLogEvent.GuildUpdate,
      undefined,
      "vanity_url_code",
    );
    if (isNullish(executorId)) return;
    if (await security.isExempt(newGuild, executorId, config)) return;

    const count = await security.recordAction(
      newGuild,
      executorId,
      "vanity_change",
      config,
    );
    if (count === null) return;

    this.container.logger.warn(
      `[security] Anti-nuke tripped in ${newGuild.id}: ${executorId} changed the vanity URL ${count} time(s)`,
    );
    await security.respond(newGuild, executorId, "vanity_change", count, config);
  }

}
