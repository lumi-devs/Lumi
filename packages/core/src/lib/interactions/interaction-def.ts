import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Interaction,
} from "discord.js";
import type { Container } from "#lib/services.js";
import { Emojis } from "#lib/utilities/assets.js";

export type InteractionKind = "button" | "select" | "modal";

export interface InteractionDef<I extends Interaction = Interaction> {
  /** customId prefix (or prefixes); matches `prefix` or `prefix:...`. */
  prefix?: string | string[];
  /** Predicate match for dynamic prefixes (addon routing). Wins over `prefix`. */
  match?: (customId: string) => boolean;
  /** Module whose enabled state gates this handler (checked per event). */
  module?: string;
  /** Component kinds this handler serves. Omit to serve all kinds. Defs sharing
   * one prefix must set disjoint kinds or all but the first are dropped. */
  kinds?: InteractionKind[];
  run: (services: Container, interaction: I) => unknown;
}

export function kindOfInteraction(interaction: Interaction): InteractionKind | null {
  if (interaction.isButton()) return "button";
  if (interaction.isAnySelectMenu()) return "select";
  if (interaction.isModalSubmit()) return "modal";
  return null;
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

function kindsKey(def: InteractionDef<any>): string {
  return def.kinds ? [...def.kinds].sort().join(",") : "*";
}

function sameIdentity(a: InteractionDef<any>, b: InteractionDef<any>): boolean {
  if (kindsKey(a) !== kindsKey(b)) return false;
  const pa = Array.isArray(a.prefix) ? a.prefix : [a.prefix];
  const pb = Array.isArray(b.prefix) ? b.prefix : [b.prefix];
  return pa.some((p) => pb.includes(p));
}

export function addInteractionDef(def: InteractionDef<any>): void {
  if (def.match) {
    if (!registry.includes(def)) {
      registry.push(def);
      registry.sort((a, b) => specificity(b) - specificity(a));
    }
    return;
  }
  if (!registry.some((d) => sameIdentity(d, def))) {
    registry.push(def);
    registry.sort((a, b) => specificity(b) - specificity(a));
  }
}

export function clearInteractionDefsForTest(): void {
  registry.length = 0;
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

  const ackable = interaction as unknown as {
    deferUpdate?: () => Promise<unknown>;
    deferReply?: () => Promise<unknown>;
  };
  try {
    if (ackable.deferUpdate) await ackable.deferUpdate();
    else if (ackable.deferReply) await ackable.deferReply();
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
