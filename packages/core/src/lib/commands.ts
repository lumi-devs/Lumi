import { fetchT, type LumiT } from "#lib/i18n/index.js";
import type { Container } from "#lib/services.js";
import {
  preconditionChecks,
  type GateCommand,
  type GateDenial,
  type GateSource,
} from "#lib/permissions/precondition-checks.js";
import { handleDenied } from "#lib/utilities/command-response.js";
import { UserError } from "@lumi/shared";
import {
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";

/** Resolves the translator for a target as Lumi's typed {@linkcode LumiT}. */
export function fetchTyped(
  target: Parameters<typeof fetchT>[0],
  services?: Parameters<typeof fetchT>[1],
): Promise<LumiT> {
  return fetchT(target, services);
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
