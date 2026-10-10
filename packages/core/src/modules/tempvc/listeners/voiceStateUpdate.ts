import { Events } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { getUtility } from "@lumi/lib/module-system/utility.js";
import type { VoiceState } from "discord.js";
import { fetchTyped } from "@lumi/lib/i18n/index.js";
import { makeWarningCard } from "@lumi/lib/ui/cards.js";
import { logError } from "@lumi/lib/utilities/errors.js";
import type { Container } from "@lumi/lib/services.js";
import { TempvcCreateCooldownMs } from "../constants.js";
import { tempVcRegistry } from "@lumi/application/services/tempvc/registry.js";
import type { TempVcUtility } from "../utilities/TempVcUtility.js";
import {
  trackVoiceState,
  isVoiceChannelEmpty,
} from "@lumi/application/services/tempvc/voice-occupancy.js";

const tempvcVoiceStateUpdate = defineListener({
  name: "tempvcVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
  async execute(services: Container, oldState: VoiceState, newState: VoiceState) {
    const service: TempVcUtility = getUtility("tempvc");
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const guildId = (newState.guild ?? oldState.guild).id;

    const relevant =
      (oldState.channelId
        ? await tempVcRegistry.isManagedVc(guildId, oldState.channelId)
        : false) ||
      (newState.channelId
        ? (await tempVcRegistry.isManagedVc(guildId, newState.channelId)) ||
          (await tempVcRegistry.getGenerator(guildId, newState.channelId)) !==
            null
        : false);
    if (!relevant) return;

    const { prevChannelId } = await trackVoiceState(
      member.id,
      newState.channelId,
    );

    if (
      prevChannelId &&
      (await tempVcRegistry.isManagedVc(guildId, prevChannelId))
    ) {
      if (await isVoiceChannelEmpty(prevChannelId)) {
        await service.scheduleCleanup(guildId, prevChannelId);
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
