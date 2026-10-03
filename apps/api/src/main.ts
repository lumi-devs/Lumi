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

// `bootstrapApiApp()` already installs the SIGINT/SIGTERM drain sequence
// (RPC HTTP server stop, then db/redis/event-bus teardown, then tracing
// shutdown) - `extraDrainSteps` slots the RPC HTTP server's own stop() into
// that same sequence, ahead of the container-services teardown, so no
// in-flight/draining RPC request can hit a closed redis/db connection (see
// `bootstrapApiApp`'s drain ordering in `api-bootstrap.ts`).
const services = await bootstrapApiApp({
  extraDrainSteps: [
    {
      // Stop accepting new connections first: `Bun.Server#stop()` without
      // `closeActiveConnections` rejects new sockets immediately but leaves
      // already-open ones (including live SSE streams) alive, so a /events
      // request can no longer slip in between this and the SSE cleanup step
      // below - the race that ran when SSE connections were closed first.
      name: "rpc-http-server",
      run: async () => {
        if (rpcServer) {
          await rpcServer.stop();
          rpcServer = null;
        }
      },
    },
    {
      // After the server has stopped accepting new connections: each SSE
      // connection's own cleanup (stop its event-bus consume loop, destroy
      // its ephemeral consumer group) needs Redis still reachable, and needs
      // to run under our own control rather than racing Bun.serve's own
      // socket teardown of the connections `stop()` above left open.
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
  // Unlike the worker (where a failed RPC bind still leaves a useful Discord
  // gateway process running), this process exists solely to serve RPC - a
  // failed bind leaves nothing else keeping the event loop alive, and no
  // reason to stay up half-broken.
  container.logger.fatal("[Api] Failed to start RPC HTTP server - exiting");
  await destroyApiContainerServices(services);
  process.exit(1);
}

container.logger.info("[Api] Bootstrap successful - serving RPC");
