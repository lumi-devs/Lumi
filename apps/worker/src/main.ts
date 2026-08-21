import { fileURLToPath } from "node:url";
import { ShardingManager } from "discord.js";

// The manager process itself never opens a Discord connection or does
// application work - only the children it spawns (shard-client.ts) do. No
// telemetry/RPC HTTP surface is bound here, so there's nothing to gate or
// conflict with the primary shard child's port.

function envInt(key: string): number | undefined {
  const raw = process.env[key];
  if (!raw || raw === "auto") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`[Manager] ${key}=${raw} is not a positive integer (or "auto").`);
  }
  return n;
}

function envShardList(): number[] | undefined {
  const raw = process.env["SHARD_LIST"];
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`[Manager] SHARD_LIST contains non-integer "${s}".`);
      }
      return n;
    });
  return ids.length > 0 ? ids : undefined;
}

const token = process.env["BOT_TOKEN"];
if (!token) throw new Error("[ENV] Missing: BOT_TOKEN");

const shardFile = fileURLToPath(new URL("./shard-client.ts", import.meta.url));

const manager = new ShardingManager(shardFile, {
  token,
  totalShards: envInt("TOTAL_SHARDS") ?? "auto",
  shardList: envShardList() ?? "auto",
  respawn: true,
});

manager.on("shardCreate", (shard) => {
  console.info(`[Manager] Launched shard ${shard.id}`);
  shard.on("death", () => {
    console.error(`[Manager] Shard ${shard.id} process died; discord.js will respawn it`);
  });
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const shards = [...manager.shards.values()];
  console.info(`[Manager] ${signal} received, forwarding to ${shards.length} shard(s)`);

  // Forward the real OS signal to each child's process so its own
  // registered SIGTERM/SIGINT drain sequence (bootstrapClientApp) runs
  // unchanged - k8s only signals PID 1 (this manager), not the process
  // group, so this has to happen explicitly.
  const exits = shards.map(
    (shard) =>
      new Promise<void>((resolve) => {
        if (!shard.process) {
          resolve();
          return;
        }
        shard.process.once("exit", () => resolve());
        shard.process.kill(signal);
      }),
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 55_000));
  await Promise.race([Promise.all(exits), timeout]);
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await manager.spawn({ amount: "auto", timeout: -1 });
console.info(`[Manager] All ${manager.totalShards} shard(s) spawned`);
