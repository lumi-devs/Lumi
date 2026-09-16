import { Module, DefineModule } from "#lib/module-system/Module.js";
import { cfg } from "#lib/module-system/config-schema.js";
import { container } from "@sapphire/framework";
import { Emojis } from "#lib/utilities/assets.js";
import { clearAllAfkForUser } from "./data/afk.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleAfkDeleteMessageFire } from "./services/delete-handler.js";

@DefineModule({
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
})
export class AfkModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "afk-delete-message",
      "unicast",
      handleAfkDeleteMessageFire,
    );
    return super.onLoad();
  }

  public override onUnload() {
    this.container.logger.info(
      "[AfkModule] Unloaded AFK module task handlers.",
    );
    return super.onUnload();
  }

  public override async deleteUserData(
    userId: string,
  ): Promise<void> {
    await clearAllAfkForUser(userId);
  }

  public override async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const entries = await container.db.afk.findAllForUser(userId);
    return entries.length > 0 ? { afkEntries: entries } : null;
  }
}
