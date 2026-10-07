import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import type { GatewayDispatchPayload, APIGuild } from "discord-api-types/v10";
import { logError } from "#lib/utilities/errors.js";
import {
  seedVoiceStates,
  clearVoiceChannelOccupancy,
} from "@lumi/application/services/tempvc/voice-occupancy.js";
import { listVcRecords } from "../data/tempvc.js";

const tempvcRawGuildCreate = defineListener({
  name: "tempvcRawGuildCreate",
  event: "raw",
  async execute(services: Container, packet: GatewayDispatchPayload): Promise<void> {
    if (packet.t !== "GUILD_CREATE") return;
    const g = packet.d as APIGuild & {
      voice_states?: ReadonlyArray<{
        user_id: string;
        channel_id: string | null;
      }>;
    };

    const records = await listVcRecords(services, g.id).catch(() => new Map());
    await Promise.all(
      [...records.keys()].map((channelId) =>
        clearVoiceChannelOccupancy(channelId).catch(() => null),
      ),
    );

    if (!g.voice_states?.length) return;
    await seedVoiceStates(g.voice_states).catch((err: unknown) =>
      logError(`TempVC: voice-state seed failed for guild ${g.id}`, err),
    );
  },
});

export default tempvcRawGuildCreate;
