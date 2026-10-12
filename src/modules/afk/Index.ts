import { defineModule } from "#src/lib/module-system/Module.js";
import { cfg } from "#src/lib/module-system/ConfigSchema.js";
import { container, type Container } from "#src/lib/Services.js";
import { clearAllAfkForUser } from "#src/modules/afk/data/Afk.js";
import { registerTaskFireHandler } from "#src/lib/scheduler/Fires.js";
import { handleAfkDeleteMessageFire } from "#src/modules/afk/services/DeleteHandler.js";

export const afkModule = defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: "💤",
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
