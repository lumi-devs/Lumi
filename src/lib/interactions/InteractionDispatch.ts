import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Container } from "#src/lib/Services.js";
import type { Interaction } from "discord.js";
import {
  addInteractionDef,
  InteractionAccessDeniedError,
  interactionDefs,
  kindOfInteraction,
  matchesPrefix,
  type InteractionDef,
  type InteractionKind,
} from "#src/lib/interactions/InteractionDef.js";
import { resolveErrorCard, respond } from "#src/lib/utilities/CommandResponse.js";
import { ephemeralCard, makeErrorCard } from "#src/lib/ui/Cards.js";

export async function loadInteractionHandlers(
  moduleDir: string,
): Promise<void> {
  for (const subdir of ["buttons", "selects", "modals"]) {
    const dir = path.join(moduleDir, "interactions", subdir);
    let files: string[];
    try {
      files = (await fs.readdir(dir))
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
        .sort();
    } catch {
      continue;
    }
    for (const file of files) {
      const exported = (await import(
        pathToFileURL(path.join(dir, file)).href
      )) as Record<string, unknown>;
      for (const value of Object.values(exported)) {
        if (typeof value !== "object" || value === null) continue;
        const def = value as {
          prefix?: unknown;
          run?: unknown;
        };
        if (
          (typeof def.prefix !== "string" && !Array.isArray(def.prefix)) ||
          typeof def.run !== "function"
        ) {
          continue;
        }
        addInteractionDef(
          value as Parameters<typeof addInteractionDef>[0],
        );
      }
    }
  }
}

function matchesDef(
  def: InteractionDef,
  customId: string,
  kind: InteractionKind | null,
): boolean {
  if (def.kinds && (kind === null || !def.kinds.includes(kind))) return false;
  if (def.match) return def.match(customId);
  return (Array.isArray(def.prefix) ? def.prefix : [def.prefix]).some(
    (prefix) => prefix !== undefined && matchesPrefix(customId, prefix),
  );
}

async function reportHandlerError(
  services: Container,
  label: string,
  interaction: Interaction,
  error: unknown,
): Promise<void> {
  try {
    if (!interaction.isRepliable()) {
      services.logger.error(`[InteractionDispatch:${label}]`, error);
      return;
    }
    if (error instanceof InteractionAccessDeniedError) {
      await respond(
        interaction,
        ephemeralCard(makeErrorCard("Access Denied", error.message)),
      );
      return;
    }
    const { card } = resolveErrorCard(`InteractionHandler:${label}`, error);
    await respond(interaction, card);
  } catch (reportError) {
    services.logger.error(
      `[InteractionDispatch:${label}] Failed to report interaction error:`,
      reportError,
    );
  }
}

export async function dispatchInteraction(
  services: Container,
  interaction: Interaction,
): Promise<void> {
  if (interaction.isChatInputCommand()) return;
  if (
    !interaction.isButton() &&
    !interaction.isAnySelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }
  const customId =
    "customId" in interaction && typeof interaction.customId === "string"
      ? interaction.customId
      : null;
  if (!customId) return;
  const kind = kindOfInteraction(interaction);
  for (const def of interactionDefs()) {
    if (!matchesDef(def, customId, kind)) continue;
    const prefixes = Array.isArray(def.prefix) ? def.prefix : [def.prefix];
    const label = prefixes[0] ?? "addon";
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (def.module && guildId && !(await services.db.modules.isModuleEnabled(guildId, def.module))) {
      return;
    }
    try {
      await def.run(services, interaction);
    } catch (error) {
      await reportHandlerError(services, label, interaction, error);
    }
    return;
  }
  setTimeout(() => {
    services.logger.warn(
      `[InteractionDispatch] No handler matched component "${customId}" from user ${interaction.user.id} in guild ${interaction.guildId ?? "DM"} (interaction ${interaction.id}).`,
    );
  }, 3_000).unref?.();
}
