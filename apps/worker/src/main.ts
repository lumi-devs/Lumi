import { fileURLToPath } from "node:url";
import { ShardingManager } from "discord.js";
import { getBotToken, getTotalShards, getShardList } from "@lumi/core/env";
import { initializeShardLease, getMyShards, getMyNodeId } from "@lumi/core/cluster";

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
  execArgv: ["--no-warnings"],
});

let shuttingDown = false;

manager.on("shardCreate", (shard) => {
  console.info(`[Manager] Launched shard ${shard.id}`);
  shard.on("death", () => {
    if (!shuttingDown && manager.respawn) {
      console.error(`[Manager] Shard ${shard.id} process died; discord.js will respawn it`);
    }
  });
  shard.on("error", (err) => {
    console.error(`[Manager] Shard ${shard.id} error:`, err);
  });
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  manager.respawn = false;
  const shards = [...manager.shards.values()];
  console.info(`[Manager] ${signal} received, forwarding to ${shards.length} shard(s)`);

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

  await Promise.all(exits);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

await manager.spawn();
console.info(`[Manager] All ${manager.shards.size} shard(s) spawned`);