import type { Container } from "@lumi/lib/services.js";
import {
  preconditionChecks,
  type GateCommand,
  type GateDenial,
  type GateSource,
} from "@lumi/lib/permissions/precondition-checks.js";
import { handleDenied } from "@lumi/lib/utilities/command-response.js";
import { UserError } from "@lumi/shared";
import {
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";

/** Direct gates a generated bridge runs before its handler. */
export interface GateRun {
  names: readonly string[];
  command: GateCommand;
}

export async function denyGated(
  services: Container,
  target: ChatInputCommandInteraction | Message,
  source: GateSource,
  gates: GateRun,
): Promise<boolean> {
  let denial: GateDenial | null = null;
  for (const name of gates.names) {
    const check = preconditionChecks[name];
    if (!check) {
      services.logger.error(`[denyGated] Unknown gate "${name}" — denying closed.`);
      denial = {
        identifier: "PermissionDenied",
        message: "This command is misconfigured.",
      };
      break;
    }
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
