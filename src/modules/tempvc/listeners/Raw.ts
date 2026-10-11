import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import type { GatewayDispatchPayload, APIGuild } from "discord-api-types/v10";
import { logError } from "#src/lib/utilities/Errors.js";
import {
  seedVoiceStates,
  clearVoiceChannelOccupancy,
} from "#src/modules/tempvc/services/VoiceOccupancy.js";
import { listVcRecords } from "#src/modules/tempvc/data/Tempvc.js";

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
