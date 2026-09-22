import { container } from "@sapphire/framework";
import { accountRpcHandlers } from "#lib/rpc/account-rpc.js";
import type { RpcBoundHandler, RpcImplementation } from "#lib/rpc/implement.js";
import { systemRpcHandlers } from "#lib/rpc/system-rpc.js";
import { afkRpcHandlers } from "#modules/afk/rpc.js";
import { coreRpcHandlers, downloaderRpcHandlers } from "#modules/core/rpc.js";
import { dashboardRpcHandlers } from "#modules/dashboard/rpc.js";
import { loggingRpcHandlers } from "#modules/logging/rpc.js";
import { modRpcHandlers } from "#modules/mod/rpc.js";
import { reactionrolesRpcHandlers } from "#modules/reactionroles/rpc.js";
import { securityRpcHandlers } from "#modules/security/rpc.js";
import { tempvcRpcHandlers } from "#modules/tempvc/rpc.js";
import { welcomeRpcHandlers } from "#modules/welcome/rpc.js";

// Imported statically instead of registered by module pieces, so a module
// that is disabled or unloaded keeps answering its dashboard reads.
const implementations: readonly RpcImplementation[] = [
  accountRpcHandlers,
  systemRpcHandlers,
  downloaderRpcHandlers,
  dashboardRpcHandlers,
  coreRpcHandlers,
  modRpcHandlers,
  securityRpcHandlers,
  tempvcRpcHandlers,
  reactionrolesRpcHandlers,
  loggingRpcHandlers,
  welcomeRpcHandlers,
  afkRpcHandlers,
];

const handlers = new Map<string, RpcBoundHandler>();

export function registerRpcHandlers(): void {
  handlers.clear();
  for (const implementation of implementations) {
    for (const [action, handler] of implementation) {
      handlers.set(action, handler);
    }
  }
  container.logger.info(`[Rpc] Registered ${handlers.size} RPC actions`);
}

export function getRpcHandler(action: string): RpcBoundHandler | undefined {
  return handlers.get(action);
}
