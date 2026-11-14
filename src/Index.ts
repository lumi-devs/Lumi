import { bootstrapTelemetry } from "@observability/Index.ts";
import { bootstrapClientApp } from "@lib/client/Bootstrap.js";
import { container } from "@lib/Services.js";
import { registerRpcHandlers } from "@rpc/Registry.js";
import { startRpcHttpServer } from "@rpc/HttpServer.js";
import { loadScheduledTasks } from "@scheduler/Tasks.js";
import { registerBuiltinTasks } from "@scheduler/Oneshot.js";
import { ScheduledTaskRunner } from "@scheduler/Runner.js";
import { acquireSchedulerLock } from "@scheduler/Lock.js";
import { watchFailedJobs } from "@scheduler/QueueEvents.js";
import { watchQueueDepth } from "@scheduler/QueueMetrics.js";
import { publishSchedulerHeartbeat } from "@scheduler/Heartbeat.js";
import { getConsumerId, getDefaultPrefix } from "@lib/Env.js";
import { printBootBanner } from "@lib/Branding.js";
import { commandRegistry } from "@commands/CommandDef.js";
import { LumiInfo } from "@utilities/Version.js";
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
  container.redis,
  () => {
    container.logger.error("[Scheduler] Lost scheduler lock, exiting");
    process.exit(1);
  },
  container.logger,
);
await tasks.createRepeated();
watchFailedJobs(tasks);
watchQueueDepth(tasks);
publishSchedulerHeartbeat(container.redis, getConsumerId());

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
