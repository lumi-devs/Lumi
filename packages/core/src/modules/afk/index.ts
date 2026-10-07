import { defineModule } from "#lib/module-system/Module.js";
import { cfg } from "#lib/module-system/config-schema.js";
import { container, type Container } from "#lib/services.js";
import { Emojis } from "#lib/utilities/assets.js";
import { clearAllAfkForUser } from "./data/afk.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleAfkDeleteMessageFire } from "@lumi/application/services/afk/delete-handler.js";

export const afkModule = defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: Emojis.Afk,
  description:
    "Set yourself AFK; mentions notify others and a prefix is added to your nickname.",
  short: "Set yourself AFK with automated status and mention alerts.",
  endUserDataStatement:
    "Stores user ID, optional AFK reason message, and timestamps to notify others when mentioned. Cleared automatically upon return or on GDPR erasure.",
  category: "Community",
  configSchema: cfg.object({
    nick_prefix_enabled: cfg.boolean({
      label: "Nickname Prefix",
      description: "Prepend [AFK] to nickname while AFK.",
      default: true,
    }),
  }),
  onLoad(_services: Container = container) {
    registerTaskFireHandler(
      "afk-delete-message",
      "unicast",
      handleAfkDeleteMessageFire,
    );
  },

  onUnload(services: Container = container) {
    services.logger.info(
      "[AfkModule] Unloaded AFK module task handlers.",
    );
  },

  async deleteUserData(
    services: Container,
    userId: string,
  ): Promise<void> {
    await clearAllAfkForUser(services, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const entries = await services.db.afk.findAllForUser(userId);
    return entries.length > 0 ? { afkEntries: entries } : null;
  },
});
