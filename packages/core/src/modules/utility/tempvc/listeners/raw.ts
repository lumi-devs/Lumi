// Boot-time seed for the voice-state Redis projection.
//
// On GUILD_CREATE the dispatch carries the full `voice_states` array. We seed
// the projection from it so the cleanup task (which fires 8s after the listener
// thinks a channel emptied) has a correct picture for the channels that were
// already occupied when this worker came up.

import { Listener } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GatewayDispatchPayload, APIGuild } from "discord-api-types/v10";
import { logError } from "#utilities/errors.js";
import {
  seedVoiceStates,
  clearVoiceChannelOccupancy,
} from "../lib/voice-occupancy.js";
import { listVcRecords } from "../data.js";

@ApplyOptions<Listener.Options>({
  name: "tempvcRawGuildCreate",
  event: "raw",
})
export default class TempVcRawListener extends Listener {
  public async run(packet: GatewayDispatchPayload): Promise<void> {
    if (packet.t !== "GUILD_CREATE") return;
    const g = packet.d as APIGuild & {
      voice_states?: ReadonlyArray<{
        user_id: string;
        channel_id: string | null;
      }>;
    };

    // Clear stale Redis occupancy sets for managed VCs on boot
    const records = await listVcRecords(g.id).catch(() => new Map());
    await Promise.all(
      [...records.keys()].map((channelId) =>
        clearVoiceChannelOccupancy(channelId).catch(() => null),
      ),
    );

    if (!g.voice_states?.length) return;
    await seedVoiceStates(g.voice_states).catch((err: unknown) =>
      logError(`TempVC: voice-state seed failed for guild ${g.id}`, err),
    );
  }
}
