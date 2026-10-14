import type { Container } from "#src/lib/Services.js";
import { registerCommandDef } from "#src/lib/commands/CommandDef.js";
import { addInteractionDef } from "#src/lib/interactions/InteractionDef.js";
import { registerUtility } from "#src/lib/module-system/Utility.js";
import { registerScheduledTask } from "#src/lib/scheduler/Tasks.js";
import { accessDef } from "#src/admin/commands/Access.js";
import { announceDef } from "#src/admin/commands/Announce.js";
import { downloadDef } from "#src/admin/commands/Download.js";
import { moduleDef } from "#src/admin/commands/Module.js";
import { repoDef } from "#src/admin/commands/Repo.js";
import { serverlockDef } from "#src/admin/commands/Serverlock.js";
import { shutdownDef, restartDef } from "#src/admin/commands/Shutdown.js";
import { svDef } from "#src/admin/commands/Sv.js";
import { configPanelButton } from "#src/admin/interactions/buttons/ConfigPanelButton.js";
import { moduleRestart } from "#src/admin/interactions/buttons/ModuleRestart.js";
import { moduleUpdate } from "#src/admin/interactions/buttons/ModuleUpdate.js";
import { configPanelModal } from "#src/admin/interactions/modals/ConfigPanelModal.js";
import { configPanelSelect } from "#src/admin/interactions/selects/ConfigPanelSelect.js";
import { AddonAutoUpdateTask } from "#src/admin/tasks/AddonAutoUpdate.js";
import { configUtility } from "#src/admin/utilities/ConfigUtility.js";
import { downloaderUtility } from "#src/admin/utilities/DownloaderUtility.js";
import { guildLogUtility } from "#src/admin/utilities/GuildLogUtility.js";
import { guildSettingsUtility } from "#src/admin/utilities/GuildSettingsUtility.js";
import { permissionUtility } from "#src/admin/utilities/PermissionUtility.js";

export async function registerAdmin(_services: Container): Promise<void> {
  for (const def of [
    accessDef,
    announceDef,
    downloadDef,
    moduleDef,
    repoDef,
    serverlockDef,
    shutdownDef,
    restartDef,
    svDef,
  ]) {
    registerCommandDef(def);
  }
  for (const def of [
    configPanelButton,
    configPanelSelect,
    configPanelModal,
    moduleUpdate,
    moduleRestart,
  ]) {
    addInteractionDef(def);
  }
  for (const def of [
    configUtility,
    downloaderUtility,
    guildLogUtility,
    guildSettingsUtility,
    permissionUtility,
  ]) {
    await registerUtility(def);
  }
  registerScheduledTask(new AddonAutoUpdateTask());
}
