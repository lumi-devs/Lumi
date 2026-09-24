import { accountRpc } from "./account";
import { afkRpc } from "./afk";
import { coreRpc } from "./core";
import { dashboardRpc } from "./dashboard";
import type { RpcInputOf, RpcOutputOf } from "./define";
import { downloaderRpc } from "./downloader";
import { loggingRpc } from "./logging";
import { modRpc } from "./mod";
import { reactionrolesRpc } from "./reactionroles";
import { securityRpc } from "./security";
import { systemRpc } from "./system";
import { tempvcRpc } from "./tempvc";
import { welcomeRpc } from "./welcome";

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
