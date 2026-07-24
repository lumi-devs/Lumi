import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import type { RequesterType } from "#lib/gdpr.js";
import { container } from "@sapphire/framework";
import { Emojis } from "#lib/utilities/assets.js";
import { clearAllAfkForUser } from "./data/afk.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleAfkDeleteMessageFire } from "./lib/delete-handler.js";

export const NICK_PREFIX = "[AFK] ";
export const AFK_MAX_REASON_LENGTH = 100;

export function sanitizeReason(reason: string): string {
  const f =
    reason
      ?.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(" ")
      .replace(/\s+/g, " ") || "AFK";
  return f.length > AFK_MAX_REASON_LENGTH
    ? `${f.slice(0, AFK_MAX_REASON_LENGTH - 3)}…`
    : f;
}

export const AFK_MENTION_COOLDOWN_MS = 5_000;
export const AFK_WELCOME_COOLDOWN_MS = 5_000;
export const AFK_REMOVAL_COOLDOWN_MS = 2_000;
export const AFK_NICK_EDIT_COOLDOWN_MS = 1_000;

export function afkDurationSince(since: Date): string {
  return container.utilities.time.humanizeDelta(
    Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000)),
  );
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
  version: "1.0.0",
  description:
    "Set yourself AFK; mentions notify others and a prefix is added to your nickname.",
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
    _requester: RequesterType,
  ): Promise<void> {
    await clearAllAfkForUser(userId);
  }
}
