import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import { cutText } from "@sapphire/utilities";
import { Emojis } from "#lib/utilities/assets.js";
import { formatDuration } from "#utilities/time.js";
import { clearAllAfkForUser } from "./data/afk.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleAfkDeleteMessageFire } from "./lib/delete-handler.js";

export const NickPrefix = "[AFK] ";
export const AfkMaxReasonLength = 100;

export function sanitizeReason(reason: string): string {
  const f =
    reason
      ?.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(" ")
      .replace(/\s+/g, " ") || "AFK";
  return cutText(f, AfkMaxReasonLength);
}

export const AfkMentionCooldownMs = 5_000;
export const AfkWelcomeCooldownMs = 5_000;
export const AfkRemovalCooldownMs = 2_000;
export const AfkNickEditCooldownMs = 1_000;

export function afkDurationSince(since: Date): string {
  return formatDuration(Date.now() - since.getTime());
}

export async function isAfkNickPrefixEnabled(
  guildId: string,
): Promise<boolean> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "afk",
    "nick_prefix_enabled",
  );
  return value !== false;
}

@DefineModule({
  name: "afk",
  displayName: "AFK",
  emoji: Emojis.AFK,
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
