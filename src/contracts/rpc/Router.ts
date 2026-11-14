import { accountRpc } from "@contracts/rpc/Account.js";
import { afkRpc } from "@contracts/rpc/Afk.js";
import { coreRpc } from "@contracts/rpc/Core.js";
import { dashboardRpc } from "@contracts/rpc/Dashboard.js";
import { economyRpc } from "@contracts/rpc/Economy.js";
import { filterRpc } from "@contracts/rpc/Filter.js";
import type { RpcInputOf, RpcOutputOf } from "@contracts/rpc/Define.js";
import { downloaderRpc } from "@contracts/rpc/Downloader.js";
import { loggingRpc } from "@contracts/rpc/Logging.js";
import { modRpc } from "@contracts/rpc/Mod.js";
import { reactionrolesRpc } from "@contracts/rpc/Reactionroles.js";
import { securityRpc } from "@contracts/rpc/Security.js";
import { systemRpc } from "@contracts/rpc/System.js";
import { tempvcRpc } from "@contracts/rpc/Tempvc.js";
import { welcomeRpc } from "@contracts/rpc/Welcome.js";

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
