import { BrandColors, makeCard, type CardReply } from "@lumi/ui";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { PermitResolver } from "@lumi/permits";

export { ModulePanel } from "./ModulePanel.js";
export { PermitPanel } from "./PermitPanel.js";
export { SettingsPanel } from "./SettingsPanel.js";

export interface PanelServices {
  moduleLoader: ModuleLoader;
  permitResolver: PermitResolver;
  db: any;
}

export async function buildMainPanel(
  services: PanelServices,
  guildId: string,
): Promise<CardReply> {
  const modules = await services.moduleLoader.listGlobal();
  const permits = await services.db.permits.listPermits(guildId);
  const guildModules = await services.db.prisma.guildModule.findMany({
    where: { guildId },
  });
  const enabled = new Set(
    guildModules
      .filter((record: any) => record.enabled)
      .map((record: any) => record.module),
  );
  const builtin = permits.filter((permit: any) => permit.builtin).length;

  return makeCard(
    BrandColors.primary,
    "Admin Overview",
    [
      `**Modules** ${enabled.size} of ${modules.length} enabled`,
      `**Permits** ${permits.length} configured · ${builtin} built-in · ${permits.length - builtin} custom`,
    ],
    {
      breadcrumbs: ["Admin"],
      footer: "Use /module, /permit, and /config to manage this server",
    },
  );
}
