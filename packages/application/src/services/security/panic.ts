import { container } from "@sapphire/framework";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import {
  GuildFeature,
  OverwriteType,
  Routes,
  type APIChannel,
  type APIOverwrite,
} from "discord-api-types/v10";
import { withSerializedWork } from "#lib/utilities/misc.js";
import type { LockedChannelSnapshot } from "#modules/security/data/SecurityRepository.js";
import { fetchGuildChannelsRest, fetchGuildRestUncached } from "#lib/rpc/discord-rest-lookup.js";
import { isRestorePending, restoreFromBackup, clearRestorePending } from "./backup.js";

export interface PanicResult {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
}

export interface PanicRevertResult {
  restoredCount: number;
  restoredStructure: { rolesRestored: number; channelsRestored: number } | null;
}

const PanicChannelCap = 40;
const PanicEditDelayMs = 300;

function panicLockKey(guildId: string): string {
  return `security:panic:${guildId}`;
}

/**
 * REST equivalent of discord.js's `Guild#disableInvites()`: that method reads
 * `this.features` off the gateway-cached `Guild` and PATCHes the full,
 * filtered feature list back (Discord's guild PATCH replaces `features`
 * wholesale, it isn't a partial diff) - reproduced here off a REST guild
 * fetch instead. Deliberately uncached (`fetchGuildRestUncached`), unlike
 * every other REST read in this module: this is a read-then-full-replace
 * PATCH, so a stale 20s-cached feature list could silently clobber a
 * feature change made elsewhere within that window.
 */
async function setGuildInvitesDisabled(guildId: string, disabled: boolean): Promise<void> {
  const guild = await fetchGuildRestUncached(guildId);
  const currentFeatures: GuildFeature[] = guild?.features ?? [];
  const features: GuildFeature[] = currentFeatures.filter(
    (f) => f !== GuildFeature.InvitesDisabled,
  );
  if (disabled) features.push(GuildFeature.InvitesDisabled);
  await container.client.rest.patch(Routes.guild(guildId), { body: { features } });
}

/**
 * REST equivalent of discord.js's `PermissionOverwriteManager#edit(everyone,
 * { SendMessages: value })`: merges the single `SendMessages` flag into the
 * existing allow/deny bitfields (leaving every other permission on the
 * overwrite untouched) and PUTs the full overwrite back, exactly mirroring
 * `PermissionOverwrites.resolveOverwriteOptions`'s three-way `true`/`false`/
 * `null` (allow, deny, unset) semantics.
 */
async function setEveryoneSendMessages(
  channelId: string,
  everyoneId: string,
  existing: APIOverwrite | undefined,
  value: boolean | null,
  reason: string,
): Promise<void> {
  const bit = PermissionFlagsBits.SendMessages;
  let allow = existing ? BigInt(existing.allow) : 0n;
  let deny = existing ? BigInt(existing.deny) : 0n;
  if (value === true) {
    allow |= bit;
    deny &= ~bit;
  } else if (value === false) {
    allow &= ~bit;
    deny |= bit;
  } else {
    allow &= ~bit;
    deny &= ~bit;
  }
  await container.client.rest.put(Routes.channelPermission(channelId, everyoneId), {
    body: {
      id: everyoneId,
      type: OverwriteType.Role,
      allow: allow.toString(),
      deny: deny.toString(),
    },
    reason,
  });
}

function everyoneOverwrite(channel: APIChannel, everyoneId: string): APIOverwrite | undefined {
  if (!("permission_overwrites" in channel)) return undefined;
  return channel.permission_overwrites?.find((ow: APIOverwrite) => ow.id === everyoneId);
}

export async function enterPanic(
  guildId: string,
  actorId: string,
  channelIds: string[],
): Promise<PanicResult> {
  return withSerializedWork(panicLockKey(guildId), async () => {
    const existing = await container.db.security.getPanicState(guildId);
    if (existing) {
      return { invitesPaused: existing.invitesPaused, lockedCount: 0, skippedCount: 0 };
    }

    let invitesPaused = false;
    try {
      await setGuildInvitesDisabled(guildId, true);
      invitesPaused = true;
    } catch (err: unknown) {
      container.logger.warn(
        `[security] Panic: failed to pause invites in ${guildId}: ${String(err)}`,
      );
    }

    const allChannels = (await fetchGuildChannelsRest(guildId)) ?? [];
    const candidates =
      channelIds.length > 0
        ? channelIds
            .map((id) => allChannels.find((c) => c.id === id))
            .filter((c): c is APIChannel => Boolean(c))
        : allChannels.filter(
            (c) =>
              c.type === ChannelType.GuildText ||
              c.type === ChannelType.GuildAnnouncement,
          );

    const targets = candidates.slice(0, PanicChannelCap);
    const snapshot: LockedChannelSnapshot = {};
    let lockedCount = 0;

    for (const channel of targets) {
      try {
        const overwrite = everyoneOverwrite(channel, guildId);
        const bit = PermissionFlagsBits.SendMessages;
        const prior = overwrite
          ? (BigInt(overwrite.allow) & bit) !== 0n
            ? true
            : (BigInt(overwrite.deny) & bit) !== 0n
              ? false
              : null
          : null;
        snapshot[channel.id] = prior;
        await setEveryoneSendMessages(
          channel.id,
          guildId,
          overwrite,
          false,
          `Panic mode activated by ${actorId}`,
        );
        lockedCount++;
      } catch (err: unknown) {
        container.logger.warn(
          `[security] Panic: failed to lock channel ${channel.id} in ${guildId}: ${String(err)}`,
        );
      }
      await Bun.sleep(PanicEditDelayMs);
    }

    await container.db.security.savePanicState({
      guildId,
      actorId,
      invitesPaused,
      lockedChannels: snapshot,
    });

    return {
      invitesPaused,
      lockedCount,
      skippedCount: targets.length - lockedCount,
    };
  });
}

export async function revertPanic(guildId: string): Promise<PanicRevertResult | null> {
  return withSerializedWork(panicLockKey(guildId), async () => {
    const state = await container.db.security.getPanicState(guildId);
    if (!state) return null;

    if (state.invitesPaused) {
      await setGuildInvitesDisabled(guildId, false).catch((err: unknown) => {
        container.logger.warn(
          `[security] Panic: failed to resume invites in ${guildId}: ${String(err)}`,
        );
      });
    }

    const snapshot = (state.lockedChannels ?? {}) as LockedChannelSnapshot;
    let restoredCount = 0;

    const allChannels = (await fetchGuildChannelsRest(guildId)) ?? [];
    for (const [channelId, prior] of Object.entries(snapshot)) {
      const channel = allChannels.find((c) => c.id === channelId);
      if (!channel) continue;
      try {
        const overwrite = everyoneOverwrite(channel, guildId);
        await setEveryoneSendMessages(
          channelId,
          guildId,
          overwrite,
          prior,
          "Panic mode reverted",
        );
        restoredCount++;
      } catch (err: unknown) {
        container.logger.warn(
          `[security] Panic: failed to restore channel ${channelId} in ${guildId}: ${String(err)}`,
        );
      }
      await Bun.sleep(PanicEditDelayMs);
    }

    await container.db.security.clearPanicState(guildId);

    let restoredStructure: PanicRevertResult["restoredStructure"] = null;
    if (await isRestorePending(guildId)) {
      restoredStructure = await restoreFromBackup(guildId).catch(
        (err: unknown) => {
          container.logger.warn(
            `[security] Panic: auto-restore failed in ${guildId}: ${String(err)}`,
          );
          return null;
        },
      );
      await clearRestorePending(guildId);
    }

    return { restoredCount, restoredStructure };
  });
}
