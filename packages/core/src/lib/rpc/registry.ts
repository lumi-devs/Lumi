import { rpcRouter } from "@lumi/contracts/rpc";
import { container } from "#lib/services.js";
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

export function verifyRpcCompleteness(): { missing: string[]; extra: string[] } {
  const routerActions = Object.keys(rpcRouter);
  const missing = routerActions.filter((a) => !handlers.has(a));
  const extra = [...handlers.keys()].filter((a) => !(a in rpcRouter));
  return { missing, extra };
}

export function registerRpcHandlers(): void {
  handlers.clear();
  for (const implementation of implementations) {
    for (const [action, handler] of implementation) {
      handlers.set(action, handler);
    }
  }
  const { missing, extra } = verifyRpcCompleteness();
  if (missing.length > 0) {
    container.logger?.warn(`[Rpc] Missing implementations for contract actions: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    container.logger?.warn(`[Rpc] Extra implementations not in contract router: ${extra.join(", ")}`);
  }
  container.logger?.info(`[Rpc] Registered ${handlers.size} RPC actions (completeness: ${handlers.size}/${Object.keys(rpcRouter).length})`);
}

export function getRpcHandler(action: string): RpcBoundHandler | undefined {
  return handlers.get(action);
}
