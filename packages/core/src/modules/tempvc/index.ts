import { container } from "@sapphire/framework";
import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { ModuleName } from "./keys.js";
import { tempVcRegistry } from "./registry.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleTempVcCleanupFire } from "./lib/cleanup-handler.js";

export const TempvcCreateCooldownMs = 30_000;
export const TempvcCleanupDelayMs = 8_000;
export const TempvcMaxGenerators = 25;

export async function getCreateCooldownMs(guildId: string): Promise<number> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "create_cooldown_seconds",
  );
  return typeof value === "number" ? value * 1_000 : TempvcCreateCooldownMs;
}

export async function getMaxGenerators(guildId: string): Promise<number> {
  const value = await container.db.config.getModuleConfig(
    guildId,
    "tempvc",
    "max_generators",
  );
  return typeof value === "number" ? value : TempvcMaxGenerators;
}

@DefineModule({
  name: ModuleName,
  displayName: "Temp Voice Channels",
  emoji: "🔊",
  description:
    "On-demand temporary voice channels that delete themselves once empty, with an owner control panel.",
  short: "On-demand temporary voice channels that clean up when empty.",
  endUserDataStatement:
    "Stores owner user ID on active temporary voice channel records. Deleted automatically when channel is empty or upon GDPR erasure.",
  category: "System",
  configSchema: cfg.object({
    create_cooldown_seconds: cfg.number({
      label: "Creation Cooldown (seconds)",
      description: "How long a member must wait between creating temp channels.",
      default: 30,
      min: 0,
      max: 300,
    }),
    max_generators: cfg.number({
      label: "Max Generator Channels",
      description: "How many trigger channels can exist in this server at once.",
      default: 25,
      min: 1,
      max: 25,
    }),
    default_name_template: cfg.string({
      label: "Default Channel Name Pattern",
      description:
        "Used to pre-fill new generators. Supports {username}, {name}, {number}, {position} — see the Voice Generators page for details.",
      default: "{username}'s Channel",
    }),
  }),
})
export class TempVcModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "tempvc-cleanup",
      "unicast",
      handleTempVcCleanupFire,
    );
    return super.onLoad();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    const owned = await this.container.db.tempvc.findRecordsForOwner(userId);
    if (owned.length === 0) return;
    await this.container.db.tempvc.deleteRecordsForOwner(userId);
    for (const guildId of new Set(owned.map((r) => r.guildId))) {
      await tempVcRegistry.reloadVcs(guildId);
    }
  }

  public override async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const owned = await this.container.db.tempvc.findRecordsForOwner(userId);
    return owned.length > 0 ? { ownedChannels: owned } : null;
  }
}
