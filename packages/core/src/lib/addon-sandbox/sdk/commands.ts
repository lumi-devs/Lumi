import type { AddonCommandInvocation, SerialisedMember, SerialisedUser } from "@lumi/contracts";
import { makeErrorCard, makeInfoCard, makeSuccessCard, makeWarningCard, makeEmptyCard, type CardReply } from "#lib/ui/cards.js";
import { call } from "./rpc.js";

export interface CtxOptionSpec {
  required?: boolean;
  /** Strings only: consume the rest of the message on the prefix path. */
  rest?: boolean;
}

export interface CtxReplyOptions {
  /** Slash replies are ephemeral by default; pass `false` to post publicly. */
  ephemeral?: boolean;
}

export class CommandContext {
  readonly isSlash: boolean;
  readonly guildId: string | null;
  readonly channelId: string;
  readonly user: SerialisedUser;
  readonly member: SerialisedMember | null;
  readonly subcommand: string | null;

  constructor(invocation: AddonCommandInvocation) {
    this.isSlash = invocation.isSlash;
    this.guildId = invocation.guildId;
    this.channelId = invocation.channelId;
    this.user = invocation.user;
    this.member = invocation.member;
    this.subcommand = invocation.subcommand;
  }

  getString(name: string, spec: CtxOptionSpec = {}): Promise<string | null> {
    return call("ctx.option", { getter: "getString", name, spec });
  }

  getInteger(name: string, spec: CtxOptionSpec = {}): Promise<number | null> {
    return call("ctx.option", { getter: "getInteger", name, spec });
  }

  getNumber(name: string, spec: CtxOptionSpec = {}): Promise<number | null> {
    return call("ctx.option", { getter: "getNumber", name, spec });
  }

  getBoolean(name: string, spec: CtxOptionSpec = {}): Promise<boolean | null> {
    return call("ctx.option", { getter: "getBoolean", name, spec });
  }

  defer(opts: CtxReplyOptions = {}): Promise<void> {
    return call("ctx.defer", { ephemeral: opts.ephemeral });
  }

  reply(card: CardReply, opts: CtxReplyOptions = {}): Promise<void> {
    return call("ctx.reply", { card, ephemeral: opts.ephemeral });
  }

  replySuccess(title: string, body: string, opts?: CtxReplyOptions): Promise<void> {
    return this.reply(makeSuccessCard(title, body), opts);
  }

  replyError(title: string, body: string, opts?: CtxReplyOptions): Promise<void> {
    return this.reply(makeErrorCard(title, body), opts);
  }

  replyWarning(title: string, body: string, opts?: CtxReplyOptions): Promise<void> {
    return this.reply(makeWarningCard(title, body), opts);
  }

  replyInfo(title: string, body: string, opts?: CtxReplyOptions): Promise<void> {
    return this.reply(makeInfoCard(title, body), opts);
  }

  replyEmpty(
    title: string,
    reason: string,
    suggestion?: string,
    opts?: CtxReplyOptions,
  ): Promise<void> {
    return this.reply(makeEmptyCard(title, reason, suggestion), opts);
  }

  checkPermit(node: string): Promise<void> {
    return call("ctx.checkPermit", { node });
  }
}

export interface CommandOptions {
  name: string;
  description: string;
  requiredPermit?: string;
  cooldownDelay?: number;
  prefixEnabled?: boolean;
}

export interface AddonCommandDefinition {
  name: string;
  description: string;
  build?: () => Record<string, unknown> | null;
  run: (ctx: CommandContext) => unknown | Promise<unknown>;
  handlers?: Record<string, (ctx: CommandContext) => unknown | Promise<unknown>>;
}

export function defineCommand<D extends AddonCommandDefinition>(def: D): D {
  return def;
}
