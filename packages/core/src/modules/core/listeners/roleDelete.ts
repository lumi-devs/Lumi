import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Role } from "discord.js";
import { clearStaleConfigRefs } from "../lib/config-cleanup.js";

@ApplyOptions<Listener.Options>({ event: Events.GuildRoleDelete })
export class RoleDeleteListener extends Listener<
  typeof Events.GuildRoleDelete
> {
  public async run(role: Role): Promise<void> {
    try {
      await clearStaleConfigRefs(role.guild.id, role.id, "role");
    } catch (err: unknown) {
      this.container.logger.warn(
        `[ConfigCleanup] Role cleanup for ${role.id} failed:`,
        err,
      );
    }
  }
}
