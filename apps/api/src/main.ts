import "./telemetry.js";
import "@lumi/core/setup-api";
import {
  bootstrapApiApp,
  closeAllSseConnections,
  destroyApiContainerServices,
  registerInfrastructureReadinessProbes,
  registerRpcHandlers,
  registerRpcReadinessProbe,
} from "@lumi/core";
import { container } from "@sapphire/framework";
import { startRpcHttpServer } from "./rpc-http-server.js";

let rpcServer: Awaited<ReturnType<typeof startRpcHttpServer>> = null;

// Stop RPC server before closing database and redis connections.
const services = await bootstrapApiApp({
  extraDrainSteps: [
    {
      // Reject new connections while allowing active requests to finish.
      name: "rpc-http-server",
      run: async () => {
        if (rpcServer) {
          await rpcServer.stop();
          rpcServer = null;
        }
      },
    },
    {
      // Drain SSE connections before Redis connection closes.
      name: "sse-connections",
      run: () => closeAllSseConnections(),
    },
  ],
});

registerInfrastructureReadinessProbes();

registerRpcHandlers();
rpcServer = await startRpcHttpServer((level, msg, meta) =>
  container.logger[level](msg, meta),
);
registerRpcReadinessProbe(() => rpcServer !== null);

if (!rpcServer) {
  // api process only serves RPC; exit immediately on bind failure.
  container.logger.fatal("[Api] Failed to start RPC HTTP server - exiting");
  await destroyApiContainerServices(services);
  process.exit(1);
}

container.logger.info("[Api] Bootstrap successful - serving RPC");
