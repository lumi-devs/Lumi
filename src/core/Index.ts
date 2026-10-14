import type { Client } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { attachDefs } from "#src/lib/listeners/ListenerLoader.js";
import { registerScheduledTask } from "#src/lib/scheduler/Tasks.js";
import { readyListener } from "#src/core/listeners/Ready.js";
import { guildCreateListener } from "#src/core/listeners/GuildCreate.js";
import { guildDeleteEventBusListener } from "#src/core/listeners/bus/GuildDelete.js";
import { roleDeleteListener } from "#src/core/listeners/RoleDelete.js";
import { channelDeleteListener } from "#src/core/listeners/ChannelDelete.js";
import { clientErrorListener } from "#src/core/listeners/errors/ClientError.js";
import { telemetryStatsListener } from "#src/core/listeners/TelemetryStats.js";
import { shardTelemetryListener } from "#src/core/listeners/ShardTelemetry.js";
import { shardReadyListener } from "#src/core/listeners/shard/ShardReady.js";
import { shardResumeListener } from "#src/core/listeners/shard/ShardResume.js";
import { shardReconnectingListener } from "#src/core/listeners/shard/ShardReconnecting.js";
import { shardDisconnectListener } from "#src/core/listeners/shard/ShardDisconnect.js";
import { shardErrorListener } from "#src/core/listeners/shard/ShardError.js";
import { guildUserMessageRouterListener } from "#src/core/listeners/routing/GuildUserMessage.js";
import { guildUserMessageEditRouterListener } from "#src/core/listeners/routing/GuildUserMessageEdit.js";
import { SendMessageTask } from "#src/core/tasks/SendMessage.js";
import { DataRetentionSweepTask } from "#src/core/tasks/DataRetention.js";
import { GdprExportTask } from "#src/core/tasks/GdprExport.js";
import { GdprExportCleanupTask } from "#src/core/tasks/GdprExportCleanup.js";

export async function registerCore(services: Container, client: Client): Promise<void> {
  attachDefs(services, client, [
    readyListener,
    guildCreateListener,
    guildDeleteEventBusListener,
    roleDeleteListener,
    channelDeleteListener,
    clientErrorListener,
    telemetryStatsListener,
    shardTelemetryListener,
    shardReadyListener,
    shardResumeListener,
    shardReconnectingListener,
    shardDisconnectListener,
    shardErrorListener,
    guildUserMessageRouterListener,
    guildUserMessageEditRouterListener,
  ]);
  registerScheduledTask(new SendMessageTask());
  registerScheduledTask(new DataRetentionSweepTask());
  registerScheduledTask(new GdprExportTask());
  registerScheduledTask(new GdprExportCleanupTask());
}
