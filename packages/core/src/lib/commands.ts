import { fetchT, type LumiT } from "#lib/i18n/index.js";
import type { Container } from "#lib/services.js";
import {
  preconditionChecks,
  type GateCommand,
  type GateDenial,
  type GateSource,
} from "#lib/permissions/precondition-checks.js";
import { handleDenied, sendInteractionReply } from "#lib/utilities/command-response.js";
import { ephemeralCard, makeErrorCard, makeInfoCard, makeSuccessCard, makeWarningCard, type CardReply } from "#lib/ui/cards.js";
import { UserError } from "@lumi/shared";
import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type Message,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from "discord.js";

export interface ReplyOptions {
  /** Explicitly opt out of ephemeral. Replies are ephemeral by default. */
  ephemeral?: boolean;
}

/** Interactions the card reply helpers accept - slash and context-menu commands. */
export type CommandReplyTarget =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

/** Sends a structured reply (or follow-up) to a given command interaction. */
export async function sendReply(
  interaction: CommandReplyTarget,
  payload: InteractionReplyOptions,
): Promise<void> {
  await sendInteractionReply(interaction, payload, "followUp");
}

type CardFactory = (title: string, body: string) => CardReply;

function makeReplyHelper(factory: CardFactory) {
  return (
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts: ReplyOptions = {},
  ): Promise<void> =>
    sendReply(
      interaction,
      opts.ephemeral === false
        ? factory(title, body)
        : ephemeralCard(factory(title, body)),
    );
}

export const replySuccess = makeReplyHelper(makeSuccessCard);
export const replyError = makeReplyHelper(makeErrorCard);
export const replyWarning = makeReplyHelper(makeWarningCard);
export const replyInfo = makeReplyHelper(makeInfoCard);

/** Resolves the translator for a target as Lumi's typed {@linkcode LumiT}. */
export function fetchTyped(
  target: Parameters<typeof fetchT>[0],
  services?: Parameters<typeof fetchT>[1],
): Promise<LumiT> {
  return fetchT(target, services);
}

export function mapRequiredPermitToDiscordPermission(
  permit: string | undefined,
): bigint | undefined {
  if (!permit) return undefined;
  if (permit.startsWith("admin")) return PermissionFlagsBits.ManageGuild;
  if (permit.startsWith("mod")) return PermissionFlagsBits.ManageMessages;
  return undefined;
}

/** Direct gates a generated bridge runs before its handler. */
export interface GateRun {
  names: readonly string[];
  command: GateCommand;
}

/**
 * Runs the gates; on the first denial renders the same error card the
 * command-denied listeners use. Returns true when the run must stop.
 */
export async function denyGated(
  services: Container,
  target: ChatInputCommandInteraction | Message,
  source: GateSource,
  gates: GateRun,
): Promise<boolean> {
  let denial: GateDenial | null = null;
  for (const name of gates.names) {
    const check = preconditionChecks[name];
    if (!check) continue;
    denial = await check(source, gates.command);
    if (denial) break;
  }
  if (!denial) return false;
  const error = new UserError({
    identifier: denial.identifier,
    message: denial.message,
    ...(denial.i18nKey
      ? { context: { i18nKey: denial.i18nKey, ...denial.i18nParams } }
      : {}),
  });
  await handleDenied(services, target, error, { context: {} });
  return true;
}
