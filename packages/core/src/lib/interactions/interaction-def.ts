import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Interaction,
} from "discord.js";
import type { Container } from "#lib/services.js";
import { Emojis } from "#lib/utilities/assets.js";

export interface InteractionDef<I extends Interaction = Interaction> {
  /** customId prefix (or prefixes); matches `prefix` or `prefix:...`. */
  prefix?: string | string[];
  /** Predicate match for dynamic prefixes (addon routing). Wins over `prefix`. */
  match?: (customId: string) => boolean;
  /** Module whose enabled state gates this handler (checked per event). */
  module?: string;
  run: (services: Container, interaction: I) => unknown;
}

export function defineInteraction<I extends Interaction>(
  def: InteractionDef<I>,
): InteractionDef<any> {
  return def as InteractionDef<any>;
}

const registry: InteractionDef<any>[] = [];

function specificity(def: InteractionDef<any>): number {
  if (def.match) return Number.POSITIVE_INFINITY;
  const prefixes = Array.isArray(def.prefix) ? def.prefix : [def.prefix];
  return Math.max(...prefixes.map((p) => p?.length ?? -1));
}

export function addInteractionDef(def: InteractionDef<any>): void {
  if (def.match) {
    if (!registry.includes(def)) {
      registry.push(def);
      registry.sort((a, b) => specificity(b) - specificity(a));
    }
    return;
  }
  const prefixes = Array.isArray(def.prefix) ? def.prefix : [def.prefix];
  if (
    !registry.some((d) => {
      const ps = Array.isArray(d.prefix) ? d.prefix : [d.prefix];
      return ps.some((p) => prefixes.includes(p));
    })
  ) {
    registry.push(def);
    registry.sort((a, b) => specificity(b) - specificity(a));
  }
}

export function interactionDefs(): readonly InteractionDef[] {
  return registry;
}

export function matchesPrefix(customId: string, prefix: string): boolean {
  return customId === prefix || customId.startsWith(`${prefix}:`);
}

export function checkSecurity(interaction: Interaction, ownerId: string): void {
  if ("user" in interaction && interaction.user.id !== ownerId) {
    throw new InteractionAccessDeniedError(
      `${Emojis.Cross} Only the original invoker can use these components.`,
    );
  }
}

export class InteractionAccessDeniedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InteractionAccessDeniedError";
  }
}

export async function acknowledge(interaction: Interaction): Promise<void> {
  const isComponent =
    "isMessageComponent" in interaction && interaction.isMessageComponent();
  const isModal = "isModalSubmit" in interaction && interaction.isModalSubmit();

  if (!isComponent && !isModal) return;
  if ("replied" in interaction && interaction.replied) return;
  if ("deferred" in interaction && interaction.deferred) return;

  try {
    if ("deferUpdate" in interaction) {
      await interaction.deferUpdate();
    }
  } catch (err: unknown) {
    if (
      err instanceof DiscordAPIError &&
      err.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged
    ) {
      return;
    }
    throw err;
  }
}
