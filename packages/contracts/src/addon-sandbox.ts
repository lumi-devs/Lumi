import type { RpcRequest, RpcResponse } from "./rpc";

export const AddonDiscordCapabilities = [
  "reply",
  "sendMessage",
  "editMessage",
  "manageRoles",
  "manageVoice",
  "manageAutomod",
] as const;

export type AddonDiscordCapability = (typeof AddonDiscordCapabilities)[number];

export interface AddonCapabilities {
  discord?: AddonDiscordCapability[];
  scheduling?: boolean;
  kv?: boolean;
  redis?: boolean;
}

export const DefaultAddonCapabilities: AddonCapabilities = {
  discord: ["reply"],
  kv: true,
};

/** Host-side methods an addon child may call. Anything absent here is denied. */
export type AddonRpcMethod =
  | "ctx.option"
  | "ctx.defer"
  | "ctx.reply"
  | "ctx.showModal"
  | "ctx.editReply"
  | "ctx.checkPermit"
  | "config.get"
  | "kv.get"
  | "kv.set"
  | "kv.delete"
  | "kv.list"
  | "redis.sadd"
  | "redis.srem"
  | "redis.scard"
  | "redis.smembers"
  | "redis.del"
  | "schedule.add"
  | "discord.channels.send"
  | "discord.messages.fetch"
  | "discord.messages.edit"
  | "log";

export type AddonRpcRequest<T = unknown> = RpcRequest<T> & {
  action: AddonRpcMethod;
  invocationId?: string;
};

export type AddonRpcResponse<T = unknown> = RpcResponse<T>;

export type AddonInvocation =
  | AddonCommandInvocation
  | AddonInteractionInvocation
  | AddonTaskFireInvocation;

interface InvocationBase {
  invocationId: string;
  piece: string;
  guildId: string | null;
}

export interface AddonCommandInvocation extends InvocationBase {
  kind: "command";
  channelId: string;
  isSlash: boolean;
  subcommand: string | null;
  user: SerialisedUser;
  member: SerialisedMember | null;
}

export interface AddonInteractionInvocation extends InvocationBase {
  kind: "interaction";
  channelId: string;
  customId: string;
  user: SerialisedUser;
  member: SerialisedMember | null;
  values: string[];
  fields: Record<string, string>;
}

export interface AddonTaskFireInvocation extends InvocationBase {
  kind: "task-fire";
  task: string;
  payload: Record<string, unknown>;
}

export interface SerialisedUser {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
  avatarUrl: string | null;
}

export interface SerialisedMember {
  id: string;
  nickname: string | null;
  roles: string[];
  joinedTimestamp: number | null;
  /** Discord permission bitfield, as a decimal string. */
  permissions: string;
}

export interface AddonReady {
  type: "ready";
  commands: AddonCommandDescriptor[];
  interactionPrefixes: string[];
  tasks: string[];
}

export interface AddonCommandDescriptor {
  name: string;
  description: string;
  /** `RESTPostAPIChatInputApplicationCommandsJSONBody`, kept opaque here. */
  builder: Record<string, unknown> | null;
}

export type HostToChild =
  | { type: "invoke"; invocation: AddonInvocation }
  | { type: "rpc-response"; response: AddonRpcResponse }
  | { type: "shutdown" };

export type ChildToHost =
  | AddonReady
  | { type: "rpc-request"; request: AddonRpcRequest }
  | { type: "invocation-done"; invocationId: string; error?: string }
  | { type: "load-failed"; error: string };
