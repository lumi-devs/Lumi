import { Service } from "#lib/module-system/Service.js";
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
  iterateAllAfkEntries,
  clearAfkEntry,
} from "../data/afk.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

/** Member fetches are per-entry Discord API calls, so the sweep is capped rather than unbounded. */
const SWEEP_CONCURRENCY = 10;

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

  public async cleanStaleEntries() {
    let removed = 0;

    const shardCount = this.container.client.shard?.count ?? 1;
    const myShards = this.container.client.shard?.ids ?? [0];

    const tryRemoveEntry = async (guildId: string, userId: string) => {
      if (await clearAfkEntry(guildId, userId)) removed++;
    };

    for await (const page of iterateAllAfkEntries()) {
      const mine = page.filter((entry) =>
        myShards.includes(
          Number((BigInt(entry.guildId) >> 22n) % BigInt(shardCount)),
        ),
      );

      await mapWithConcurrency(mine, SWEEP_CONCURRENCY, async (entry) => {
        const guild = this.container.client.guilds.cache.get(entry.guildId);
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
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    afk: AfkService;
  }
}
