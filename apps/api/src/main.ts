import "@lumi/core/setup-api";
import { bootstrapApiApp, destroyApiContainerServices } from "@lumi/core";

const services = await bootstrapApiApp();

// Phase C wires the actual RPC HTTP server (`lib/rpc/http-server.ts`) into
// this process and this entrypoint stops exiting on its own. Until then,
// this proves `installApiContainerServices()` boots cleanly - db/redis/
// event-bus/module-store all wired, REST-authenticated `container.client`,
// no Discord gateway connection ever opened - and shuts back down.
console.info("[Api] Bootstrap successful");
await destroyApiContainerServices(services);
process.exit(0);
