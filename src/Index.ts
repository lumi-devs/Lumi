import { bootstrapTelemetry } from "#src/observability/Index.ts";
import { bootstrapClientApp } from "#src/lib/client/Bootstrap.js";
import { container } from "#src/lib/Services.js";
import { registerRpcHandlers } from "#src/lib/rpc/Registry.js";
import { startRpcHttpServer } from "#src/lib/rpc/HttpServer.js";
import { loadScheduledTasks } from "#src/lib/scheduler/Tasks.js";
import { registerBuiltinTasks } from "#src/lib/scheduler/Oneshot.js";
import { ScheduledTaskRunner } from "#src/lib/scheduler/Runner.js";
import { acquireSchedulerLock } from "#src/lib/scheduler/Lock.js";
import { watchFailedJobs } from "#src/lib/scheduler/QueueEvents.js";
import { watchQueueDepth } from "#src/lib/scheduler/QueueMetrics.js";
import { publishSchedulerHeartbeat } from "#src/lib/scheduler/Heartbeat.js";
import { getConsumerId, getDefaultPrefix } from "#src/lib/Env.js";
import { printBootBanner } from "#src/lib/Branding.js";
import { commandRegistry } from "#src/lib/commands/CommandDef.js";
import { LumiInfo } from "#src/lib/utilities/Version.js";
import type { Client } from "discord.js";

bootstrapTelemetry("bot");

let rpcServer: Awaited<ReturnType<typeof startRpcHttpServer>> = null;

const client = await bootstrapClientApp({
  extraDrainSteps: [
    {
      name: "rpc-http-server",
      run: async () => {
        if (rpcServer) {
          await rpcServer.stop();
          rpcServer = null;
        }
      },
    },
  ],
});

registerRpcHandlers();
rpcServer = await startRpcHttpServer((level, msg, meta) =>
  container.logger[level](meta ?? {}, msg),
);
if (!rpcServer) {
  container.logger.warn("[Bot] RPC HTTP server failed to start - dashboard integration disabled, gateway continues");
}

for (const record of container.moduleStore.loaded()) {
  if (record.state === "loaded") await loadScheduledTasks(record.dir);
}
registerBuiltinTasks();

const tasks = new ScheduledTaskRunner();
container.tasks = tasks;

await acquireSchedulerLock(
  container.valkey,
  () => {
    container.logger.error("[Scheduler] Lost scheduler lock, exiting");
    process.exit(1);
  },
  container.logger,
);
await tasks.createRepeated();
watchFailedJobs(tasks);
watchQueueDepth(tasks);
publishSchedulerHeartbeat(container.valkey, getConsumerId());

container.logger.info("[Bot] Online");

function storageLabel(): string {
  try {
    const url = new URL(process.env["POSTGRES_URL"] ?? "");
    return `${url.hostname}/${url.pathname.replace(/^\//, "") || "lumi"}`;
  } catch {
    return "unknown";
  }
}

printBootBanner(
  {
    guilds: client.guilds.cache.size,
    members: client.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0),
    channels: client.channels.cache.size,
    modules: container.moduleStore.loaded().filter((r) => r.state === "loaded").length,
    commands: commandRegistry.size,
    prefix: getDefaultPrefix(),
    storage: storageLabel(),
    shards: `${client.ws.shards.size}`,
  },
  client.user ? `https://discord.com/oauth2/authorize?client_id=${client.user.id}` : null,
);

void checkForUpdates(client);

function ownerIds(): string[] {
  return (process.env["OWNER_IDS"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

async function checkForUpdates(client: Client): Promise<void> {
  let tag: string | null = null;
  try {
    const res = await fetch(
      "https://api.github.com/lumi-devs/Lumi/releases/latest",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) tag = ((await res.json()) as { tag_name?: string }).tag_name ?? null;
  } catch {
    return;
  }
  if (!tag) return;
  const latest = tag.replace(/^v/, "");
  if (latest === LumiInfo.version) return;
  const msg = `Lumi v${latest} is available (running v${LumiInfo.version}) - docker compose pull && docker compose up -d`;
  container.logger.warn(`[Update] ${msg}`);
  for (const id of ownerIds()) {
    await client.users
      .fetch(id)
      .then((user) => user.send(`🔔 **Lumi update available**\n${msg}`))
      .catch(() => undefined);
  }
}
