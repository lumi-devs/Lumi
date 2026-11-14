import type { ModuleMeta } from "@module-system/Meta.js";
import { hasRequiredPermit } from "@api/permissions/Index.js";
import type { FeatureListEntry } from "@lib/hub/Modules.js";
import { UserError } from "@shared/Index.ts";
import type { Container } from "@lib/Services.js";
import { OverrideTargetType, type $Enums } from "@prisma/client";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

export function isOverrideTargetType(
  value: string,
): value is $Enums.OverrideTargetType {
  return (Object.values(OverrideTargetType) as string[]).includes(value);
}

export interface FeatureDetail {
  meta: ModuleMeta;
  config: Record<string, unknown>;
  guildEnabled: boolean;
}

export async function loadFeatures(
  services: Container,
  guildId: string,
): Promise<FeatureListEntry[]> {
  return Promise.all(
    services.moduleStore
      .all()
      .filter((record) => record.meta.disableable !== false)
      .map(async (record) => ({
        meta: record.meta,
        guildEnabled: await services.db.modules.isModuleGuildEnabled(
          guildId,
          record.meta.name,
        ),
      })),
  );
}

export async function loadDetail(
  services: Container,
  guildId: string,
  moduleName: string,
): Promise<FeatureDetail | null> {
  const record = services.moduleStore.getRecord(moduleName);
  if (!record) return null;
  const [config, guildEnabled] = await Promise.all([
    services.db.config.getAllModuleConfig(guildId, moduleName),
    services.db.modules.isModuleGuildEnabled(guildId, moduleName),
  ]);
  return { meta: record.meta, config, guildEnabled };
}

export async function hasPanelAccess(
  interaction:
    ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  if (!interaction.guild || !interaction.member) return false;
  return hasRequiredPermit(interaction, "admin.*");
}

export const configAccessDenied = () =>
  new UserError({
    identifier: "AccessDenied",
    message: `❌ You need the Admin permission level to manage configuration.`,
  });
