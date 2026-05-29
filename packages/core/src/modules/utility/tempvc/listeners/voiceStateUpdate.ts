import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { VoiceState } from "discord.js";
import { logError } from "#utilities/errors.js";
import { isTempVcEnabled, TEMPVC_CREATE_COOLDOWN_MS } from "../index.js";
import { tempVcRegistry } from "../registry.js";
import type TempVcService from "../services/TempVcService.js";
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
  private get service(): TempVcService {
    return this.container.stores.get("services").get("tempvc") as TempVcService;
  }

  public async run(oldState: VoiceState, newState: VoiceState) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    if (oldState.channelId === newState.channelId) return;

    const guildId = (newState.guild ?? oldState.guild).id;

    // Track the voice state transition in Redis
    const { prevChannelId } = await trackVoiceState(
      member.id,
      newState.channelId,
    );

    // Left a managed VC that is now empty → debounced cleanup. Checked against
    // the in-memory index (no I/O), and intentionally not gated on the module
    // being enabled so leftover channels still get cleaned up.
    if (
      prevChannelId &&
      (await tempVcRegistry.isManagedVc(guildId, prevChannelId))
    ) {
      if (await isVoiceChannelEmpty(prevChannelId)) {
        await this.service.scheduleCleanup(guildId, prevChannelId);
      }
    }

    // Joined a generator → create a temp VC. The generator lookup is the
    // in-memory index; the enabled check (a Redis hit) only runs once we know
    // this is actually a generator channel.
    if (newState.channelId) {
      const generator = await tempVcRegistry.getGenerator(
        guildId,
        newState.channelId,
      );
      if (generator) {
        if (!(await isTempVcEnabled(guildId))) return;

        if (await this.service.onCreateCooldown(guildId, member.id)) {
          await member.voice.disconnect().catch(() => null);
          await member
            .send(
              `⏳ Slow down — wait up to ${Math.round(
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
