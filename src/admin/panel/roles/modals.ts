import type { ModalSubmitInteraction } from "discord.js";
import type { BotServices } from "../../../core/contracts.js";
import { handleAutoroleModal } from "../../../../modules/roles/autorole/admin.js";
import { handleVoiceRolesModal } from "../../../../modules/roles/voiceroles/admin.js";
import { handleRoleMenusModal } from "../../../../modules/role-menus/menu/admin.js";

export async function handleRolesModuleModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
  guildId: string,
  parts: string[],
): Promise<boolean> {
  const action = parts[1];
  if (action?.startsWith("ar")) {
    return handleAutoroleModal(interaction, services, guildId, parts);
  }
  if (action?.startsWith("vr")) {
    return handleVoiceRolesModal(interaction, services, guildId, parts);
  }
  if (action?.startsWith("rm")) {
    return handleRoleMenusModal(interaction, services, guildId, parts);
  }
  return false;
}
