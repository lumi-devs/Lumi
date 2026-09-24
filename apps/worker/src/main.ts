import { fileURLToPath } from "node:url";
import { ShardingManager } from "discord.js";
import { getBotToken, getTotalShards, getShardList } from "@lumi/core/env";

// The manager process itself never opens a Discord connection or does
// application work - only the children it spawns (shard-client.ts) do. No
// telemetry/RPC HTTP surface is bound here, so there's nothing to gate or
// conflict with the primary shard child's port.

const token = getBotToken();
const shardFile = fileURLToPath(new URL("./shard-client.ts", import.meta.url));

const totalShards = getTotalShards();
const shardList = getShardList();

if (shardList !== "auto" && totalShards === "auto") {
  throw new Error(
    "[Manager] TOTAL_SHARDS must be explicitly configured when SHARD_LIST is specified.",
  );
}

const manager = new ShardingManager(shardFile, {
  token,
  totalShards,
  shardList,
  respawn: true,
});

let shuttingDown = false;

manager.on("shardCreate", (shard) => {
  console.info(`[Manager] Launched shard ${shard.id}`);
  shard.on("death", () => {
    if (!shuttingDown && manager.respawn) {
      console.error(`[Manager] Shard ${shard.id} process died; discord.js will respawn it`);
    }
  });
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  manager.respawn = false;
  const shards = [...manager.shards.values()];
  console.info(`[Manager] ${signal} received, forwarding to ${shards.length} shard(s)`);

  // Forward the real OS signal to each child's process so its own
  // registered SIGTERM/SIGINT drain sequence (bootstrapClientApp) runs
  // unchanged - k8s only signals PID 1 (this manager), not the process
  // group, so this has to happen explicitly.
  const exits = shards.map(
    (shard) =>
      new Promise<boolean>((resolve) => {
        const proc = shard.process;
        if (!proc || proc.exitCode !== null || proc.signalCode !== null) {
          resolve(true);
          return;
        }
        proc.once("exit", () => resolve(true));
        proc.kill(signal);
      }),
  );
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 55_000));
  const drained = await Promise.race([
    Promise.all(exits).then(() => true),
    timeout,
  ]);
  process.exit(drained ? 0 : 1);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) =>
  console.error("[Manager] Unhandled promise rejection:", reason),
);
process.on("uncaughtException", (err) => {
  console.error("[Manager] Uncaught exception - initiating shutdown:", err);
  void shutdown("SIGTERM");
});

try {
  await manager.spawn({ timeout: -1 });
  console.info(`[Manager] All ${manager.totalShards} shard(s) spawned`);
} catch (err) {
  console.error("[Manager] Failed to spawn shards:", err);
  await shutdown("SIGTERM");
}
