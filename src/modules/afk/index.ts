import { Module, EmberModule, FieldType } from "#core/module-system/Module.js";
import type { RequesterType } from "#core/lib/gdpr.js";
import { container } from "@sapphire/framework";
import { humanizeDelta } from "#utilities/time.js";
import { EmberEmojis } from "#utilities/assets.js";
import { clearAllAfkForUser } from "./data/afk.js";

export const NICK_PREFIX = "[AFK] ";
export const AFK_MAX_REASON_LENGTH = 100;

export function sanitizeReason(reason: string): string {
  const f =
    reason
      ?.split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
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
  return humanizeDelta(
    Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000)),
  );
}

export async function isAfkEnabled(guildId: string): Promise<boolean> {
  return container.db.isModuleEnabled(guildId, "afk");
}

export async function isAfkNickPrefixEnabled(
  guildId: string,
): Promise<boolean> {
  const value = await container.db.getModuleConfig(
    guildId,
    "afk",
    "nick_prefix_enabled",
  );
  return value ?? true;
}

@EmberModule({
  name: "afk",
  displayName: "AFK",
  emoji: EmberEmojis.AFK,
  version: "1.0.0",
  description:
    "Set yourself AFK; mentions notify others and a prefix is added to your nickname.",
  configFields: [
    {
      key: "nick_prefix_enabled",
      label: "Nickname Prefix",
      type: FieldType.BOOLEAN,
      description: "Prepend [AFK] to nickname while AFK.",
      default: true,
    },
  ],
})
export class AfkModule extends Module {
  public registerServices() {}

  public override async deleteUserData(
    userId: string,
    _requester: RequesterType,
  ): Promise<void> {
    await clearAllAfkForUser(userId);
  }
}
