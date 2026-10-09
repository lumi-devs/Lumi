import type { RpcRequest, RpcResponse } from "./rpc/envelope.js";

export const AddonDiscordCapabilities = [
  "reply",
  "sendMessage",
  "editMessage",
  "manageRoles",
  "manageVoice",
  "manageAutomod",
  "manageChannels",
  "manageThreads",
  "manageEmoji",
  "moderateMembers",
  "clientPresence",
] as const;

export type AddonDiscordCapability = (typeof AddonDiscordCapabilities)[number];

export interface AddonCapabilities {
  discord?: AddonDiscordCapability[];
  scheduling?: boolean;
  kv?: boolean;
  valkey?: boolean;
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
  | "kv.incr"
  | "valkey.sadd"
  | "valkey.srem"
  | "valkey.scard"
  | "valkey.smembers"
  | "valkey.del"
  | "valkey.set"
  | "valkey.get"
  | "schedule.add"
  | "discord.channels.send"
  | "discord.channels.create"
  | "discord.channels.remove"
  | "discord.channels.permissions"
  | "discord.channels.members"
  | "discord.messages.fetch"
  | "discord.messages.edit"
  | "discord.guilds.get"
  | "discord.guilds.members.fetch"
  | "discord.members.roles.add"
  | "discord.members.roles.remove"
  | "discord.members.move"
  | "discord.members.timeout"
  | "discord.roles.create"
  | "discord.roles.edit"
  | "discord.roles.remove"
  | "discord.roles.fetch"
  | "discord.emoji.create"
  | "discord.threads.create"
  | "discord.threads.archive"
  | "discord.threads.remove"
  | "discord.client.presence"
  | "discord.messages.delete"
  | "discord.channels.fetch"
  | "modules.enabled"
  | "log";

export type AddonRpcRequest<T = unknown> = RpcRequest<T> & {
  action: AddonRpcMethod;
  invocationId?: string;
};

export type AddonRpcResponse<T = unknown> = RpcResponse<T>;

export type AddonInvocation =
  | AddonCommandInvocation
  | AddonInteractionInvocation
  | AddonTaskFireInvocation
  | AddonEventInvocation;

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

export type AddonEventName =
  | "presenceUpdate"
  | "voiceStateUpdate"
  | "guildMemberUpdate"
  | "messageCreate"
  | "threadCreate"
  | "userUpdate";

export interface AddonEventInvocation extends InvocationBase {
  kind: "event";
  event: AddonEventName;
  data: Record<string, unknown>;
}

export interface SerialisedActivity {
  name: string;
  type: number;
  state: string | null;
}

export interface SerialisedPresence {
  userId: string;
  guildId: string;
  status: string;
  activities: SerialisedActivity[];
  roles: string[];
}

export interface SerialisedVoiceState {
  guildId: string;
  userId: string;
  oldChannelId: string | null;
  newChannelId: string | null;
  roles: string[];
}

export interface SerialisedGuildMemberUpdate {
  guildId: string;
  userId: string;
  oldRoles: string[];
  newRoles: string[];
  nickname: string | null;
  pending: boolean;
}

export interface SerialisedMessage {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorBot: boolean;
  content: string;
}

export interface SerialisedThread {
  guildId: string;
  parentId: string;
  threadId: string;
  name: string;
}

export interface SerialisedUserUpdate {
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
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
  events: AddonEventName[];
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
