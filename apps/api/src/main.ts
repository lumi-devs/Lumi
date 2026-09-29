import "./telemetry.js";
import "@lumi/core/setup-api";
import {
  bootstrapApiApp,
  closeAllSseConnections,
  destroyApiContainerServices,
  registerInfrastructureReadinessProbes,
  registerRpcHandlers,
  registerRpcReadinessProbe,
  startRpcHttpServer,
} from "@lumi/core";
import { container } from "@sapphire/framework";

let rpcServer: Awaited<ReturnType<typeof startRpcHttpServer>> = null;

// `bootstrapApiApp()` already installs the SIGINT/SIGTERM drain sequence
// (RPC HTTP server stop, then db/redis/event-bus teardown, then tracing
// shutdown) - `extraDrainSteps` slots the RPC HTTP server's own stop() into
// that same sequence, ahead of the container-services teardown, so no
// in-flight/draining RPC request can hit a closed redis/db connection (see
// `bootstrapApiApp`'s drain ordering in `api-bootstrap.ts`).
const services = await bootstrapApiApp({
  extraDrainSteps: [
    {
      // Ahead of the HTTP server stop: each SSE connection's own cleanup
      // (stop its event-bus consume loop, destroy its ephemeral consumer
      // group) needs Redis still reachable, and needs to run under our own
      // control rather than racing Bun.serve's own socket teardown.
      name: "sse-connections",
      run: () => closeAllSseConnections(),
    },
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

registerInfrastructureReadinessProbes();

registerRpcHandlers();
rpcServer = await startRpcHttpServer((level, msg, meta) =>
  container.logger[level](msg, meta),
);
registerRpcReadinessProbe(() => rpcServer !== null);

if (!rpcServer) {
  // Unlike the worker (where a failed RPC bind still leaves a useful Discord
  // gateway process running), this process exists solely to serve RPC - a
  // failed bind leaves nothing else keeping the event loop alive, and no
  // reason to stay up half-broken.
  container.logger.fatal("[Api] Failed to start RPC HTTP server - exiting");
  await destroyApiContainerServices(services);
  process.exit(1);
}

container.logger.info("[Api] Bootstrap successful - serving RPC");
