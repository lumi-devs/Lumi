import { accountRpc } from "./account.js";
import { afkRpc } from "./afk.js";
import { coreRpc } from "./core.js";
import { dashboardRpc } from "./dashboard.js";
import type { RpcInputOf, RpcOutputOf } from "./define.js";
import { downloaderRpc } from "./downloader.js";
import { loggingRpc } from "./logging.js";
import { modRpc } from "./mod.js";
import { reactionrolesRpc } from "./reactionroles.js";
import { securityRpc } from "./security.js";
import { systemRpc } from "./system.js";
import { tempvcRpc } from "./tempvc.js";
import { welcomeRpc } from "./welcome.js";

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
};

export type RpcRouter = typeof rpcRouter;

export type RpcActionName = keyof RpcRouter;

export type RpcInput<A extends RpcActionName> = RpcInputOf<RpcRouter[A]>;

export type RpcOutput<A extends RpcActionName> = RpcOutputOf<RpcRouter[A]>;
