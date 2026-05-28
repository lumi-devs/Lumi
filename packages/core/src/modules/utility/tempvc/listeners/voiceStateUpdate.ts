import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { VoiceState } from "discord.js";
import { logError } from "#utilities/errors.js";
import { isTempVcEnabled, TEMPVC_CREATE_COOLDOWN_MS } from "../index.js";
import { tempVcRegistry } from "../registry.js";
import type TempVcService from "../services/TempVcService.js";

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

    // Left a managed VC that is now empty → debounced cleanup. Checked against
    // the in-memory index (no I/O), and intentionally not gated on the module
    // being enabled so leftover channels still get cleaned up.
    if (
      oldState.channelId &&
      oldState.channel?.members.size === 0 &&
      (await tempVcRegistry.isManagedVc(guildId, oldState.channelId))
    ) {
      await this.service.scheduleCleanup(guildId, oldState.channelId);
    }

    // Joined a generator → create a temp VC. The generator lookup is the
    // in-memory index; the enabled check (a Redis hit) only runs once we know
    // this is actually a generator channel.
    if (newState.channelId && newState.channel) {
      const generator = await tempVcRegistry.getGenerator(
        guildId,
        newState.channelId,
      );
      if (!generator) return;
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

      await this.service
        .createVc(member, newState.channel, generator)
        .catch((err: unknown) => logError("TempVC: create failed", err));
    }
  }
}
