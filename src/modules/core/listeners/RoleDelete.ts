import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import type { Role } from "discord.js";
import { clearStaleConfigRefs } from "@modules/core/services/ConfigCleanup.js";

export const roleDeleteListener = defineListener({
  name: "roleDeleteListener",
  event: Events.GuildRoleDelete,
  async execute(services: Container, role: Role): Promise<void> {
    try {
      await clearStaleConfigRefs(services, role.guild.id, role.id, "role");
    } catch (err: unknown) {
      services.logger.warn(
        `[ConfigCleanup] Role cleanup for ${role.id} failed:`,
        err,
      );
    }
  },
});
