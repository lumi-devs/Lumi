import { Module, EmberModule, FieldType } from "#core/module-system/Module.js";
import type { RequesterType } from "#core/lib/gdpr.js";
import { container } from "@sapphire/framework";
import { GuildVerificationLevel, type Guild } from "discord.js";
import { registerJobHandler } from "#lib/rabbit.js";
import { EmberEmojis } from "#utilities/assets.js";
import {
  recordRaidJoin,
  isGuildRaidLocked,
  lockGuildForRaid,
  unlockGuildFromRaid,
  scheduleRaidUnlock,
} from "./data.js";

declare module "#lib/rabbit.js" {
  interface EmberJobs {
    UNLOCK_GUILD: { guildId: string; originalLevel: GuildVerificationLevel };
  }
}

export interface RaidConfig {
  joinWindowSeconds: number;
  joinThreshold: number;
  lockdownMinutes: number;
}

export async function readRaidConfig(guildId: string): Promise<RaidConfig> {
  const [joinWindowSeconds, joinThreshold, lockdownMinutes] = await Promise.all(
    [
      container.db
        .getModuleConfig(guildId, "raids", "join_window")
        .then((v) => Number(v ?? 10)),
      container.db
        .getModuleConfig(guildId, "raids", "join_threshold")
        .then((v) => Number(v ?? 10)),
      container.db
        .getModuleConfig(guildId, "raids", "lockdown_duration")
        .then((v) => Number(v ?? 60)),
    ],
  );

  return { joinWindowSeconds, joinThreshold, lockdownMinutes };
}

export async function checkRaidJoin(
  guild: Guild,
  config: RaidConfig,
): Promise<boolean> {
  const inWindow = await recordRaidJoin(guild.id, config.joinWindowSeconds);
  if (inWindow < config.joinThreshold) return false;

  if (await isGuildRaidLocked(guild.id)) return false;

  await raidLockdown(guild, config);
  return true;
}

export async function raidLockdown(
  guild: Guild,
  config: RaidConfig,
): Promise<void> {
  const originalLevel = guild.verificationLevel;
  const unlocksAt = new Date(Date.now() + config.lockdownMinutes * 60_000);

  await lockGuildForRaid(guild.id, originalLevel, config.lockdownMinutes);
  await guild.setVerificationLevel(
    GuildVerificationLevel.VeryHigh,
    "Raid detected — auto lockdown",
  );

  scheduleRaidUnlock(guild.id, originalLevel, unlocksAt);
}

export async function raidUnlock(
  guild: Guild,
  originalLevel: GuildVerificationLevel,
): Promise<void> {
  await guild.setVerificationLevel(
    originalLevel,
    "Raid lockdown expired — auto restore",
  );
  await unlockGuildFromRaid(guild.id);
  container.logger.info(
    `[Raids] Lockdown lifted in guild ${guild.name} (${guild.id})`,
  );
}

@EmberModule({
  name: "raids",
  displayName: "Raids",
  emoji: EmberEmojis.RAID,
  version: "1.0.0",
  description:
    "Detect rapid join bursts and automatically lock down the server.",
  configFields: [
    {
      key: "join_window",
      label: "Join Window (seconds)",
      type: FieldType.NUMBER,
      description: "Rolling window to count new joins.",
      default: 10,
    },
    {
      key: "join_threshold",
      label: "Join Threshold",
      type: FieldType.NUMBER,
      description: "Number of joins within the window to trigger lockdown.",
      default: 10,
    },
    {
      key: "lockdown_duration",
      label: "Lockdown Duration (minutes)",
      type: FieldType.NUMBER,
      description: "How long to keep the server in high-verification mode.",
      default: 60,
    },
  ],
})
export class RaidsModule extends Module {
  public registerServices() {}

  public override async deleteUserData(
    _userId: string,
    _requester: RequesterType,
  ): Promise<void> {
    // Raids module doesn't store user-specific data — all data is guild-keyed
  }

  public override onLoad() {
    // 1. Worker job handler (acts as the primary scheduler pickup)
    registerJobHandler("UNLOCK_GUILD", async (data) => {
      // Instead of acting directly, we broadcast a fanout event
      // so that ALL shards receive it. The shard that has the guild
      // in its cache will then perform the actual unlock.
      await this.container.rabbit?.publishEvent("raids:unlock", data);
    });

    // 2. Broadcast listener (cluster-wide sync)
    this.container.rabbit?.onEvent("raids:unlock", async (data: unknown) => {
      const { guildId, originalLevel } = data as {
        guildId: string;
        originalLevel: import("discord.js").GuildVerificationLevel;
      };
      const guild = this.container.client.guilds.cache.get(guildId);
      if (!guild) return; // Guild not on this shard, ignore.

      await raidUnlock(guild, originalLevel);
    });
  }
}
