import "./telemetry.js";
import { registerReadinessProbe, runDrainSequence } from "@lumi/observability";
import { config } from "./config.js";
import { RpcClient } from "./rpc.js";
import { createServer } from "./server.js";
import { startSessionReaper } from "./sessions.js";

const rpc = new RpcClient(config.rabbitUrl);

registerReadinessProbe("rabbitmq", () => ({
  status: rpc.connected ? "ok" : "fail",
  detail: rpc.connected ? undefined : "not connected",
}));

await rpc.waitForConnect();
const reaper = startSessionReaper();
const server = createServer(rpc);

process.stdout.write(
  `[dashboard] listening on http://${config.host}:${config.port} (RPC → ${config.rabbitUrl.replace(/:[^:@]*@/, ":***@")})\n`,
);

async function shutdown() {
  clearInterval(reaper);
  await runDrainSequence(
    [
      { name: "http", run: async () => void (await server.stop(true)) },
      { name: "rpc", run: () => rpc.close() },
    ],
    {
      log: (level, msg, meta) =>
        console[level](`[dashboard] ${msg}`, meta ?? ""),
      preCloseGraceMs: 0,
      deadlineMs: 10_000,
    },
  );
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
