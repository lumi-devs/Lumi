import type {
  GuildBasedChannel,
  GuildMember,
  Message,
  Role,
  User,
} from "discord.js";

const UserMentionPattern = /^<@!?(\d+)>$/;
const ChannelMentionPattern = /^<#(\d+)>$/;
const RoleMentionPattern = /^<@&(\d+)>$/;
const SnowflakePattern = /^\d{17,20}$/;

function missingToken(what: string): Error {
  return new Error(`Missing ${what} argument.`);
}

function extractMentionId(token: string, pattern: RegExp, what: string): string {
  const id = pattern.exec(token)?.[1] ?? (SnowflakePattern.test(token) ? token : null);
  if (!id) throw new Error(`Expected ${what}, got "${token}".`);
  return id;
}

export type PrefixPickType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "user"
  | "member"
  | "role"
  | "channel"
  | "guildChannel";

export class PrefixArgs {
  #tokens: string[];
  readonly #message: Message;

  public constructor(message: Message, rest: string) {
    this.#message = message;
    this.#tokens = rest.trim().split(/ +/g).filter((t) => t.length > 0);
  }

  public get remaining(): number {
    return this.#tokens.length;
  }

  public async pick(type: "string"): Promise<string>;
  public async pick(type: "integer"): Promise<number>;
  public async pick(type: "number"): Promise<number>;
  public async pick(type: "boolean"): Promise<boolean>;
  public async pick(type: "user"): Promise<User>;
  public async pick(type: "member"): Promise<GuildMember>;
  public async pick(type: "role"): Promise<Role>;
  public async pick(type: "channel" | "guildChannel"): Promise<GuildBasedChannel>;
  public async pick(type: PrefixPickType): Promise<unknown> {
    const token = this.#tokens.shift();
    if (token === undefined) throw missingToken(type);
    switch (type) {
      case "string":
        return token;
      case "integer": {
        const value = Number.parseInt(token, 10);
        if (Number.isNaN(value)) throw new Error(`Expected an integer, got "${token}".`);
        return value;
      }
      case "number": {
        const value = Number(token);
        if (Number.isNaN(value)) throw new Error(`Expected a number, got "${token}".`);
        return value;
      }
      case "boolean": {
        const lowered = token.toLowerCase();
        if (["yes", "y", "true", "1", "on"].includes(lowered)) return true;
        if (["no", "n", "false", "0", "off"].includes(lowered)) return false;
        throw new Error(`Expected yes/no, got "${token}".`);
      }
      case "user":
        return this.resolveUser(token);
      case "member":
        return this.resolveMember(token);
      case "role":
        return this.resolveRole(token);
      case "channel":
      case "guildChannel":
        return this.resolveChannel(token);
    }
  }

  public rest(_type?: string): Promise<string> {
    const rest = this.#tokens.join(" ");
    this.#tokens = [];
    if (rest.length === 0) return Promise.reject(missingToken("text"));
    return Promise.resolve(rest);
  }

  public async repeatResult(
    type: "member",
    options: { times: number },
  ): Promise<{ isErr(): boolean; unwrap(): GuildMember[] }>;
  public async repeatResult(
    type: "user",
    options: { times: number },
  ): Promise<{ isErr(): boolean; unwrap(): User[] }>;
  public async repeatResult(
    type: "member" | "user",
    options: { times: number },
  ): Promise<{ isErr(): boolean; unwrap(): Array<GuildMember | User> }> {
    const values: Array<GuildMember | User> = [];
    for (let i = 0; i < options.times; i++) {
      try {
        values.push(
          type === "member"
            ? await this.pick("member")
            : await this.pick("user"),
        );
      } catch {
        return {
          isErr: () => true,
          unwrap: () => {
            throw new Error(`Failed to resolve ${type} argument.`);
          },
        };
      }
    }
    return { isErr: () => false, unwrap: () => values };
  }

  protected async resolveUser(token: string): Promise<User> {
    const id = extractMentionId(token, UserMentionPattern, "a user mention or id");
    return this.#message.client.users.fetch(id);
  }

  protected async resolveMember(token: string): Promise<GuildMember> {
    const guild = this.#message.guild;
    if (!guild) throw new Error("Members can only be resolved in a guild.");
    const id = extractMentionId(token, UserMentionPattern, "a user mention or id");
    return guild.members.fetch(id);
  }

  protected async resolveRole(token: string): Promise<Role> {
    const guild = this.#message.guild;
    if (!guild) throw new Error("Roles can only be resolved in a guild.");
    const id = extractMentionId(token, RoleMentionPattern, "a role mention or id");
    const role = guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null));
    if (!role) throw new Error(`Role "${token}" not found.`);
    return role;
  }

  protected async resolveChannel(token: string): Promise<GuildBasedChannel> {
    const guild = this.#message.guild;
    if (!guild) throw new Error("Channels can only be resolved in a guild.");
    const id = extractMentionId(token, ChannelMentionPattern, "a channel mention or id");
    const channel = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
    if (!channel || !("guildId" in channel)) throw new Error(`Channel "${token}" not found.`);
    return channel;
  }
}
