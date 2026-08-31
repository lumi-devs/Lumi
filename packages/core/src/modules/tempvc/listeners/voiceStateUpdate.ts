import { Listener, Events } from "@sapphire/framework";
import { getUtility } from "#lib/module-system/Utility.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { VoiceState } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { TEMPVC_CREATE_COOLDOWN_MS } from "../index.js";
import { tempVcRegistry } from "../registry.js";
import type TempVcUtility from "../utilities/TempVcUtility.js";
import {
  trackVoiceState,
  isVoiceChannelEmpty,
} from "../lib/voice-occupancy.js";

@ApplyOptions<Listener.Options>({
  name: "tempvcVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
})
export default class TempVcVoiceStateListener extends Listener<
  typeof Events.VoiceStateUpdate
> {
  private get service(): TempVcUtility {
    return getUtility("tempvc");
  }

  public async run(oldState: VoiceState, newState: VoiceState) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const guildId = (newState.guild ?? oldState.guild).id;

    const { prevChannelId } = await trackVoiceState(
      member.id,
      newState.channelId,
    );

    if (
      prevChannelId &&
      (await tempVcRegistry.isManagedVc(guildId, prevChannelId))
    ) {
      if (await isVoiceChannelEmpty(prevChannelId)) {
        await this.service.scheduleCleanup(guildId, prevChannelId);
      }
    }

    if (newState.channelId) {
      const generator = await tempVcRegistry.getGenerator(
        guildId,
        newState.channelId,
      );
      if (generator) {
        if (!(await isModuleEnabled(guildId, "tempvc"))) return;

        if (await this.service.onCreateCooldown(guildId, member.id)) {
          await member.voice.disconnect().catch(() => null);
          await member
            .send(
              `⏳ Slow down - wait up to ${Math.round(
                TEMPVC_CREATE_COOLDOWN_MS / 1000,
              )}s before creating another channel.`,
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
          await this.service
            .createVc(member, channel, generator)
            .catch((err: unknown) => logError("TempVC: create failed", err));
        }
      }
    }
  }
}
