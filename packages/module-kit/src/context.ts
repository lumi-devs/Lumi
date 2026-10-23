import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Message,
  TextBasedChannel,
  User,
} from "discord.js";
import type { CardReply } from "@lumi/ui";
import type { CommandDef } from "./command.ts";
import type { LumiServices } from "./services.ts";

export interface CommandContext {
  readonly services: LumiServices;
  readonly command: CommandDef;
  readonly source: ChatInputCommandInteraction | Message;
  readonly guildId: string | null;
  readonly guild: Guild | null;
  readonly channel: TextBasedChannel | null;
  readonly member: GuildMember | null;
  readonly user: User;
  readonly isSlash: boolean;
  getSubcommand(): string | null;
  getString(name: string, options?: { rest?: boolean }): Promise<string | null>;
  getInteger(name: string): Promise<number | null>;
  getBoolean(name: string): Promise<boolean | null>;
  getUser(name: string): Promise<User | null>;
  getMember(name: string): Promise<GuildMember | null>;
  reply(card: CardReply): Promise<unknown>;
  replySuccess(title: string, body: string | string[]): Promise<unknown>;
  replyError(title: string, body: string | string[]): Promise<unknown>;
  replyInfo(title: string, body: string | string[]): Promise<unknown>;
  defer(): Promise<void>;
}
