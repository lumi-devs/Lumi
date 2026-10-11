import { accountRpc } from "#src/contracts/rpc/Account.js";
import { afkRpc } from "#src/contracts/rpc/Afk.js";
import { coreRpc } from "#src/contracts/rpc/Core.js";
import { dashboardRpc } from "#src/contracts/rpc/Dashboard.js";
import { economyRpc } from "#src/contracts/rpc/Economy.js";
import { filterRpc } from "#src/contracts/rpc/Filter.js";
import type { RpcInputOf, RpcOutputOf } from "#src/contracts/rpc/Define.js";
import { downloaderRpc } from "#src/contracts/rpc/Downloader.js";
import { loggingRpc } from "#src/contracts/rpc/Logging.js";
import { modRpc } from "#src/contracts/rpc/Mod.js";
import { reactionrolesRpc } from "#src/contracts/rpc/Reactionroles.js";
import { securityRpc } from "#src/contracts/rpc/Security.js";
import { systemRpc } from "#src/contracts/rpc/System.js";
import { tempvcRpc } from "#src/contracts/rpc/Tempvc.js";
import { welcomeRpc } from "#src/contracts/rpc/Welcome.js";

export const rpcSlices = [
  accountRpc,
  systemRpc,
  downloaderRpc,
  dashboardRpc,
  coreRpc,
  modRpc,
  securityRpc,
  tempvcRpc,
  reactionrolesRpc,
  loggingRpc,
  welcomeRpc,
  afkRpc,
  economyRpc,
  filterRpc,
] as const;

export const rpcRouter = {
  ...accountRpc,
  ...systemRpc,
  ...downloaderRpc,
  ...dashboardRpc,
  ...coreRpc,
  ...modRpc,
  ...securityRpc,
  ...tempvcRpc,
  ...reactionrolesRpc,
  ...loggingRpc,
  ...welcomeRpc,
  ...afkRpc,
  ...economyRpc,
  ...filterRpc,
};

export type RpcRouter = typeof rpcRouter;

export type RpcActionName = keyof RpcRouter;

export type RpcInput<A extends RpcActionName> = RpcInputOf<RpcRouter[A]>;

export type RpcOutput<A extends RpcActionName> = RpcOutputOf<RpcRouter[A]>;
