import type { Container } from "#src/lib/Services.js";
import {
  preconditionChecks,
  type GateCommand,
  type GateDenial,
  type GateSource,
} from "#src/lib/api/permissions/PreconditionChecks.js";
import { handleDenied } from "#src/lib/utilities/CommandResponse.js";
import { UserError } from "#src/shared/Index.ts";
import {
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";

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
      services.logger.error(`[denyGated] Unknown gate "${name}" - denying closed.`);
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
