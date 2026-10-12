import { container } from "#src/lib/Services.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import {
  GuildFeature,
  OverwriteType,
  Routes,
  type APIChannel,
  type APIOverwrite,
} from "discord-api-types/v10";
import { withSerializedWork } from "#src/lib/utilities/SerializedWork.js";
import type { LockedChannelSnapshot } from "#src/modules/security/data/SecurityRepository.js";
import { fetchGuildChannelsRest, fetchGuildRestUncached } from "#src/lib/rpc/DiscordRestLookup.js";
import { isRestorePending, restoreFromBackup, clearRestorePending } from "#src/modules/security/services/Backup.js";

interface PanicResult {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
}

interface PanicRevertResult {
  restoredCount: number;
  restoredStructure: { rolesRestored: number; channelsRestored: number } | null;
}

const PanicChannelCap = 40;
const PanicEditDelayMs = 300;

function panicLockKey(guildId: string): string {
  return `security:panic:${guildId}`;
}

async function setGuildInvitesDisabled(guildId: string, disabled: boolean): Promise<void> {
  const guild = await fetchGuildRestUncached(guildId);
  const currentFeatures: GuildFeature[] = guild?.features ?? [];
  const features: GuildFeature[] = currentFeatures.filter(
    (f) => f !== GuildFeature.InvitesDisabled,
  );
  if (disabled) features.push(GuildFeature.InvitesDisabled);
  await container.client.rest.patch(Routes.guild(guildId), { body: { features } });
}

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
