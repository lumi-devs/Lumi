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

export function registerDynamicRpc(owner: string, implementation: RpcImplementation): void {
  trackOwner(owner, implementation);
  rebuildHandlers();
  const { extra } = verifyRpcCompleteness();
  if (extra.length > 0) {
    container.logger?.warn(`[Rpc] Extra implementations not in contract router: ${extra.join(", ")}`);
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
  container.logger?.info(`[Rpc] Registered ${handlers.size} RPC actions (completeness: ${handlers.size}/${Object.keys(rpcRouter).length})`);
}

export function getRpcHandler(action: string): RpcBoundHandler | undefined {
  return handlers.get(action);
}
