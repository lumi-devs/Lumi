process.env["NODE_ENV"] ??= "development";

import "./telemetry.js";
import {
  bootstrapApiApp,
  closeAllSseConnections,
  destroyApiContainerServices,
  registerInfrastructureReadinessProbes,
  registerRpcHandlers,
  registerRpcReadinessProbe,
} from "@lumi/core";
import { createPinoLogger } from "@lumi/observability";
import { startRpcHttpServer } from "./rpc-http-server.js";

const logger = createPinoLogger({ service: "lumi-api" });
let rpcServer: Awaited<ReturnType<typeof startRpcHttpServer>> = null;

// Stop RPC server before closing database and valkey connections.
const services = await bootstrapApiApp({
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
    {
      // Drain SSE connections before Valkey connection closes.
      name: "sse-connections",
      run: () => closeAllSseConnections(),
    },
  ],
});

registerInfrastructureReadinessProbes();

registerRpcHandlers();
rpcServer = await startRpcHttpServer((level, msg, meta) =>
  logger[level](meta ?? {}, msg),
);
registerRpcReadinessProbe(() => rpcServer !== null);

if (!rpcServer) {
  // api process only serves RPC; exit immediately on bind failure.
  logger.fatal("[Api] Failed to start RPC HTTP server - exiting");
  await destroyApiContainerServices(services);
  process.exit(1);
}

logger.info("[Api] Bootstrap successful - serving RPC");
