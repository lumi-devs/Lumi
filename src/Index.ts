import { bootstrapTelemetry } from "#src/observability/Index.ts";
import { bootstrapClientApp } from "#src/lib/client/Bootstrap.js";
import { container } from "#src/lib/Services.js";
import { registerRpcHandlers } from "#src/lib/rpc/Registry.js";
import { startRpcHttpServer } from "#src/lib/rpc/HttpServer.js";
import { loadScheduledTasks } from "#src/lib/scheduler/Tasks.js";
import { registerBuiltinTasks } from "#src/lib/scheduler/Oneshot.js";
import { ScheduledTaskRunner } from "#src/lib/scheduler/Runner.js";
import { getDefaultPrefix } from "#src/lib/Env.js";
import { printBootBanner } from "#src/lib/Branding.js";
import { commandRegistry } from "#src/lib/commands/CommandDef.js";

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

for (const record of container.moduleStore.loaded()) {
  if (record.state === "loaded") await loadScheduledTasks(record.dir);
}
registerBuiltinTasks();

const tasks = new ScheduledTaskRunner();
container.tasks = tasks;
await tasks.createRepeated();

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
