import type { BotServices } from "../../../core/contracts.js";
import type { ModuleActionParams, PanelInteraction } from "../common.js";
import { handleAutoroleAction } from "../../../../modules/roles/autorole/admin.js";
import { handleVoiceRolesAction } from "../../../../modules/roles/voiceroles/admin.js";
import { handleRoleMenusAction } from "../../../../modules/role-menus/menu/admin.js";

export async function handleRolesModuleAction(
  interaction: PanelInteraction,
  services: BotServices,
  params: ModuleActionParams,
): Promise<boolean> {
  const { action } = params;
  if (action === "autorole" || action.startsWith("ar")) {
    return handleAutoroleAction(interaction, services, params);
  }
  if (action === "voiceroles" || action.startsWith("vr")) {
    return handleVoiceRolesAction(interaction, services, params);
  }
  if (action === "rolemenus" || action.startsWith("rm")) {
    return handleRoleMenusAction(interaction, services, params);
  }
  return false;
}
