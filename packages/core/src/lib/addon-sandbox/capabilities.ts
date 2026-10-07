import {
  AddonDiscordCapabilities,
  DefaultAddonCapabilities,
  type AddonCapabilities,
  type AddonDiscordCapability,
  type AddonRpcMethod,
} from "@lumi/contracts";

type Requirement = AddonDiscordCapability | "kv" | "valkey" | "scheduling" | null;

const MethodCapability: Record<AddonRpcMethod, Requirement> = {
  "ctx.option": null,
  "ctx.defer": "reply",
  "ctx.reply": "reply",
  "ctx.showModal": "reply",
  "ctx.editReply": "reply",
  "ctx.checkPermit": null,
  "config.get": null,
  "log": null,
  "kv.get": "kv",
  "kv.set": "kv",
  "kv.delete": "kv",
  "kv.list": "kv",
  "kv.incr": "kv",
  "valkey.sadd": "valkey",
  "valkey.srem": "valkey",
  "valkey.scard": "valkey",
  "valkey.smembers": "valkey",
  "valkey.del": "valkey",
  "schedule.add": "scheduling",
  "discord.channels.send": "sendMessage",
  // A read must not ride on a write capability.
  "discord.messages.fetch": "editMessage",
  "discord.messages.edit": "editMessage",
  "discord.guilds.get": null,
  "discord.guilds.members.fetch": "manageRoles",
};

export function parseCapabilities(raw: unknown): AddonCapabilities {
  if (!raw || typeof raw !== "object") return DefaultAddonCapabilities;
  const block = raw as AddonCapabilities;
  const discord = (block.discord ?? []).filter((c): c is AddonDiscordCapability =>
    (AddonDiscordCapabilities as readonly string[]).includes(c),
  );
  return {
    discord,
    scheduling: block.scheduling === true,
    kv: block.kv !== false,
    valkey: block.valkey === true,
  };
}

export function unknownDiscordCapabilities(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const declared = (raw as { discord?: unknown }).discord;
  if (!Array.isArray(declared)) return [];
  return declared.filter(
    (c) => typeof c !== "string" || !(AddonDiscordCapabilities as readonly string[]).includes(c),
  ) as string[];
}

export function isMethodAllowed(
  method: AddonRpcMethod,
  granted: AddonCapabilities,
): boolean {
  const required = MethodCapability[method];
  if (required === undefined) return false;
  if (required === null) return true;
  if (required === "kv") return granted.kv === true;
  if (required === "valkey") return granted.valkey === true;
  if (required === "scheduling") return granted.scheduling === true;
  return granted.discord?.includes(required) === true;
}
