import type { AddonInteractionInvocation, SerialisedMember, SerialisedUser } from "@lumi/contracts";
import type { CardReply } from "#lib/utilities/cards.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "#lib/utilities/cards.js";
import { call } from "./rpc.js";

export class InteractionContext {
  readonly customId: string;
  readonly guildId: string | null;
  readonly channelId: string;
  readonly user: SerialisedUser;
  readonly member: SerialisedMember | null;
  readonly values: string[];
  readonly fields: Record<string, string>;

  constructor(invocation: AddonInteractionInvocation) {
    this.customId = invocation.customId;
    this.guildId = invocation.guildId;
    this.channelId = invocation.channelId;
    this.user = invocation.user;
    this.member = invocation.member;
    this.values = invocation.values;
    this.fields = invocation.fields;
  }

  reply(card: CardReply, opts: { ephemeral?: boolean } = {}): Promise<void> {
    return call("ctx.reply", { card, ephemeral: opts.ephemeral });
  }

  replySuccess(title: string, body: string): Promise<void> {
    return this.reply(makeSuccessCard(title, body));
  }

  replyError(title: string, body: string): Promise<void> {
    return this.reply(makeErrorCard(title, body));
  }

  replyWarning(title: string, body: string): Promise<void> {
    return this.reply(makeWarningCard(title, body));
  }

  replyInfo(title: string, body: string): Promise<void> {
    return this.reply(makeInfoCard(title, body));
  }

  defer(opts: { ephemeral?: boolean } = {}): Promise<void> {
    return call("ctx.defer", { ephemeral: opts.ephemeral });
  }

  /** Must be the first response to the interaction — never defer beforehand. */
  showModal(modal: { toJSON(): unknown }): Promise<void> {
    return call("ctx.showModal", { modal: modal.toJSON() });
  }
}

export abstract class BaseInteractionHandler {
  // Must start with "<your-addon-name>:" — the host ignores anything else.
  abstract readonly prefix: string;

  abstract run(ctx: InteractionContext): unknown | Promise<unknown>;
}

export function deferUpdate(): Promise<void> {
  return call("ctx.defer", { update: true });
}

export function editReply(payload: {
  content?: string;
  components?: unknown[];
}): Promise<void> {
  return call("ctx.editReply", { payload });
}
