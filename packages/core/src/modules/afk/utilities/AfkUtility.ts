import { defineUtility } from "#lib/module-system/Utility.js";
import type { Container } from "#lib/services.js";
import type { GuildMember, User } from "discord.js";
import { NickPrefix, AfkRemovalCooldownMs, AfkKeys } from "../constants.js";
import { isAfkNickPrefixEnabled } from "../config.js";
import {
  getAfkEntry,
  setAfkEntry,
  setAfkCooldown,
  iterateAllAfkEntries,
  clearAfkEntry,
} from "../data/afk.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

/** Member fetches are per-entry Discord API calls, so the sweep is capped rather than unbounded. */
const SweepConcurrency = 10;

const afkUtility = defineUtility({
  name: "afk",

  async setAfk(
    services: Container,
    guildId: string,
    member: GuildMember | null,
    user: User,
    reason: string,
  ) {
    const existing = await getAfkEntry(services, guildId, user.id);

    if (existing?.reason === reason) {
      return { status: "ALREADY_AFK" as const, reason };
    }

    await setAfkEntry(services, guildId, user.id, reason);

    if (
      !existing &&
      member &&
      member.displayName &&
      !member.displayName.startsWith(NickPrefix)
    ) {
      if (await isAfkNickPrefixEnabled(services, guildId)) {
        void member
          .setNickname(`${NickPrefix}${member.displayName}`.slice(0, 32))
          .catch(() => null);
      }
    }

    await setAfkCooldown(
      services,
      AfkKeys.removalCooldown(guildId, user.id),
      AfkRemovalCooldownMs,
    );

    return {
      status: existing ? ("UPDATED_AFK" as const) : ("NEW_AFK" as const),
      reason,
    };
  },

  async cleanStaleEntries(services: Container) {
    let removed = 0;

    const shardCount = services.client.shard?.count ?? 1;
    const myShards = services.client.shard?.ids ?? [0];

    const tryRemoveEntry = async (guildId: string, userId: string) => {
      if (await clearAfkEntry(services, guildId, userId)) removed++;
    };

    for await (const page of iterateAllAfkEntries(services)) {
      const mine = page.filter((entry) =>
        myShards.includes(
          Number((BigInt(entry.guildId) >> 22n) % BigInt(shardCount)),
        ),
      );

      await mapWithConcurrency(mine, SweepConcurrency, async (entry) => {
        const guild = services.client.guilds.cache.get(entry.guildId);
        if (!guild) {
          await tryRemoveEntry(entry.guildId, entry.userId);
          return;
        }

        const memberExists = await guild.members
          .fetch(entry.userId)
          .then(() => true)
          .catch(() => false);
        if (!memberExists) {
          await tryRemoveEntry(entry.guildId, entry.userId);
        }
      });
    }

    return removed;
  },
});

export default afkUtility;

export type AfkUtility = typeof afkUtility;

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    afk: typeof afkUtility;
  }
}
