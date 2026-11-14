import { rpcRouter } from "@contracts/rpc/Index.ts";
import { container } from "@lib/Services.js";
import { accountRpcHandlers } from "@rpc/AccountRpc.js";
import type { RpcBoundHandler, RpcImplementation } from "@rpc/Implement.js";
import { systemRpcHandlers } from "@rpc/SystemRpc.js";
import { afkRpcHandlers } from "@modules/afk/Rpc.js";
import { coreRpcHandlers, downloaderRpcHandlers } from "@modules/core/Rpc.js";
import { dashboardRpcHandlers } from "@rpc/DashboardRpc.js";
import { loggingRpcHandlers } from "@modules/logging/Rpc.js";
import { modRpcHandlers } from "@modules/mod/Rpc.js";
import { reactionrolesRpcHandlers } from "@modules/reactionroles/Rpc.js";
import { securityRpcHandlers } from "@modules/security/Rpc.js";
import { tempvcRpcHandlers } from "@modules/tempvc/Rpc.js";
import { welcomeRpcHandlers } from "@modules/welcome/Rpc.js";
import { economyRpcHandlers } from "@modules/economy/Rpc.js";
import { filterRpcHandlers } from "@modules/filter/Rpc.js";

const staticOwners: ReadonlyArray<readonly [string, RpcImplementation]> = [
  ["account", accountRpcHandlers],
  ["system", systemRpcHandlers],
  ["core", downloaderRpcHandlers],
  ["dashboard", dashboardRpcHandlers],
  ["core", coreRpcHandlers],
  ["mod", modRpcHandlers],
  ["security", securityRpcHandlers],
  ["tempvc", tempvcRpcHandlers],
  ["reactionroles", reactionrolesRpcHandlers],
  ["logging", loggingRpcHandlers],
  ["welcome", welcomeRpcHandlers],
  ["afk", afkRpcHandlers],
  ["economy", economyRpcHandlers],
  ["filter", filterRpcHandlers],
];

const handlers = new Map<string, RpcBoundHandler>();
const owners = new Map<string, RpcImplementation[]>();

function rebuildHandlers(): void {
  handlers.clear();
  for (const implementations of owners.values()) {
    for (const implementation of implementations) {
      for (const [action, handler] of implementation) {
        handlers.set(action, handler);
      }
    }
  }
}

function trackOwner(owner: string, implementation: RpcImplementation): void {
  const existing = owners.get(owner);
  if (existing) {
    if (!existing.includes(implementation)) existing.push(implementation);
  } else {
    owners.set(owner, [implementation]);
  }
}

export function unregisterDynamicRpc(owner: string): void {
  if (!owners.delete(owner)) return;
  rebuildHandlers();
}

export function restoreStaticRpcOwner(owner: string): void {
  let restored = false;
  for (const [name, implementation] of staticOwners) {
    if (name === owner) {
      trackOwner(name, implementation);
      restored = true;
    }
  }
  if (restored) rebuildHandlers();
}

export function verifyRpcCompleteness(): { missing: string[]; extra: string[] } {
  const routerActions = Object.keys(rpcRouter);
  const missing = routerActions.filter((a) => !handlers.has(a));
  const extra = [...handlers.keys()].filter((a) => !(a in rpcRouter));
  return { missing, extra };
}

export function registerRpcHandlers(): void {
  owners.clear();
  for (const [owner, implementation] of staticOwners) {
    trackOwner(owner, implementation);
  }
  rebuildHandlers();
  const { missing, extra } = verifyRpcCompleteness();
  if (missing.length > 0) {
    container.logger?.warn(`[Rpc] Missing implementations for contract actions: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    container.logger?.warn(`[Rpc] Extra implementations not in contract router: ${extra.join(", ")}`);
  }
  container.logger?.debug(`[Rpc] ${handlers.size} actions registered`);
}

export function getRpcHandler(action: string): RpcBoundHandler | undefined {
  return handlers.get(action);
}
