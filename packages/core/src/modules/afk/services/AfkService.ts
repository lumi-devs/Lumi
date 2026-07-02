import { Service } from "#core/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import type { GuildMember, User } from "discord.js";
import {
  NICK_PREFIX,
  AFK_REMOVAL_COOLDOWN_MS,
  isAfkNickPrefixEnabled,
} from "../index.js";
import { AfkKeys } from "../keys.js";
import {
  getAfkEntry,
  setAfkEntry,
  setAfkCooldown,
  getAfkEntriesForGuild,
  getAfkStats,
  getAllAfkEntries,
  clearAfkEntry,
} from "../data/afk.js";

@ApplyOptions<Piece.Options>({ name: "afk" })
export default class AfkService extends Service {
  public async setAfk(
    guildId: string,
    member: GuildMember | null,
    user: User,
    reason: string,
  ) {
    const existing = await getAfkEntry(guildId, user.id);

    if (existing?.reason === reason) {
      return { status: "ALREADY_AFK" as const, reason };
    }

    await setAfkEntry(guildId, user.id, reason);

    if (
      !existing &&
      member &&
      member.displayName &&
      !member.displayName.startsWith(NICK_PREFIX)
    ) {
      if (await isAfkNickPrefixEnabled(guildId)) {
        void member
          .setNickname(`${NICK_PREFIX}${member.displayName}`.slice(0, 32))
          .catch(() => null);
      }
    }

    await setAfkCooldown(
      AfkKeys.removalCooldown(guildId, user.id),
      AFK_REMOVAL_COOLDOWN_MS,
    );

    return {
      status: existing ? ("UPDATED_AFK" as const) : ("NEW_AFK" as const),
      reason,
    };
  }

  public async getAfkList(guildId: string) {
    return getAfkEntriesForGuild(guildId);
  }

  public async getAfkStats() {
    return getAfkStats();
  }

  public async cleanStaleEntries() {
    const entries = await getAllAfkEntries();
    let removed = 0;

    const shardCount = this.container.client.shard?.count ?? 1;
    const myShards = this.container.client.shard?.ids ?? [0];

    for (const entry of entries) {
      const shardId = Number(
        (BigInt(entry.guildId) >> 22n) % BigInt(shardCount),
      );
      if (!myShards.includes(shardId)) continue;

      const guild = this.container.client.guilds.cache.get(entry.guildId);
      if (!guild) {
        if (await clearAfkEntry(entry.guildId, entry.userId)) removed++;
        continue;
      }

      const memberExists = await guild.members
        .fetch(entry.userId)
        .then(() => true)
        .catch(() => false);
      if (!memberExists) {
        if (await clearAfkEntry(entry.guildId, entry.userId)) removed++;
      }
    }

    return removed;
  }
}
