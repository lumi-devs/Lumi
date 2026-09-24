import "@lumi/core/setup-api";
import {
  bootstrapApiApp,
  destroyApiContainerServices,
  registerRpcHandlers,
  startRpcHttpServer,
} from "@lumi/core";
import { container } from "@sapphire/framework";

let rpcServer: Awaited<ReturnType<typeof startRpcHttpServer>> = null;

// `bootstrapApiApp()` already installs the SIGINT/SIGTERM drain sequence
// (db/redis/event-bus teardown, then tracing shutdown) - `extraDrainSteps`
// slots the RPC HTTP server's own stop() into that same sequence, ahead of
// the container-services teardown it depends on network access to `redis`
// for (see `bootstrapApiApp`'s drain ordering in `api-bootstrap.ts`).
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
  ],
});

registerRpcHandlers();
rpcServer = await startRpcHttpServer((level, msg, meta) =>
  container.logger[level](msg, meta),
);

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
