import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { VoiceState } from "discord.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import { makeWarningCard } from "#src/lib/ui/Cards.js";
import { logError } from "#src/lib/utilities/Errors.js";
import type { Container } from "#src/lib/Services.js";
import { TempvcCreateCooldownMs } from "#src/modules/tempvc/Constants.js";
import { tempVcRegistry } from "#src/modules/tempvc/data/Registry.js";
import type { TempVcUtility } from "#src/modules/tempvc/utilities/TempVcUtility.js";
import {
  trackVoiceState,
  isVoiceChannelEmpty,
} from "#src/modules/tempvc/services/VoiceOccupancy.js";

const tempvcVoiceStateUpdate = defineListener({
  name: "tempvcVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
  async execute(services: Container, oldState: VoiceState, newState: VoiceState) {
    const service: TempVcUtility = getUtility("tempvc");
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const guildId = (newState.guild ?? oldState.guild).id;

    const oldManaged = oldState.channelId
      ? await tempVcRegistry.isManagedVc(guildId, oldState.channelId)
      : false;
    const newManaged = newState.channelId
      ? await tempVcRegistry.isManagedVc(guildId, newState.channelId)
      : false;
    const newGenerator =
      newState.channelId && !newManaged
        ? await tempVcRegistry.getGenerator(guildId, newState.channelId)
        : null;
    if (!oldManaged && !newManaged && newGenerator === null) return;

    await trackVoiceState(member.id, newState.channelId);

    if (
      oldManaged &&
      oldState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      const guild = newState.guild ?? oldState.guild;
      const live = guild
        ? await guild.channels.fetch(oldState.channelId).catch(() => null)
        : null;
      const empty = live
        ? !live.isVoiceBased() || live.members.size === 0
        : await isVoiceChannelEmpty(oldState.channelId);
      if (empty) {
        await service.scheduleCleanup(guildId, oldState.channelId);
      }
    }

    if (newState.channelId) {
      const generator = await tempVcRegistry.getGenerator(
        guildId,
        newState.channelId,
      );
      if (generator) {
        if (!(await services.db.modules.isModuleEnabled(guildId, "tempvc"))) return;

        if (await service.onCreateCooldown(services, guildId, member.id)) {
          await member.voice.disconnect().catch(() => null);
          const t = await fetchTyped(newState.guild, services);
          await member
            .send(
              makeWarningCard(
                "⏳ Slow Down",
                t("tempvc:createCooldownDm", {
                  seconds: Math.round(TempvcCreateCooldownMs / 1000),
                }),
              ),
            )
            .catch(() => null);
          return;
        }

        const channel =
          newState.channel ??
          (await newState.guild.channels
            .fetch(newState.channelId)
            .catch(() => null));

        if (channel && channel.isVoiceBased()) {
          await service
            .createVc(services, member, channel, generator)
            .catch((err: unknown) => logError("TempVC: create failed", err));
        }
      }
    }
  },
});

export default tempvcVoiceStateUpdate;
