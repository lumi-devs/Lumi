import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import type { ModalSubmitInteraction } from "discord.js";
import {
  getAutoroleConfig,
  saveAutoroleConfig,
} from "../../../../modules/roles/autorole/config.js";
import {
  getVoiceRoleMapping,
  upsertVoiceRoleMapping,
} from "../../../../modules/roles/voiceroles/store.js";
import type { BotServices } from "../../../core/contracts.js";
import { servicesForModule } from "../../../core/modules.js";
import { renderAutoroleFilters, renderAutorolePanel } from "./autorole.js";
import { createRoleMenuGroup, editRoleMenuGroup } from "./roleMenus.js";
import {
  isSnowflake,
  pageNumber,
  replyOrUpdate,
} from "./shared.js";
import { renderVoiceRoleMapping } from "./voiceroles.js";

export async function handleRolesModuleModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
  guildId: string,
  parts: string[],
): Promise<boolean> {
  const action = parts[1];
  if (action === "armodaldelay") {
    const config = await getAutoroleConfig(servicesForModule(services), guildId);
    const raw = interaction.fields.getTextInputValue("seconds").trim();
    const seconds = Number(raw);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 604800) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Delay",
            "Enter a whole number from 0 to 604800 seconds.",
          ),
        ),
      );
      return true;
    }
    config.delaySeconds = seconds;
    await saveAutoroleConfig(servicesForModule(services), guildId, config);
    await replyOrUpdate(
      interaction,
      await renderAutorolePanel(
        interaction,
        services,
        pageNumber(parts[2]),
        `⏱️ Delay set to ${seconds}s.`,
      ),
    );
    return true;
  }

  if (action === "armodalage") {
    const config = await getAutoroleConfig(servicesForModule(services), guildId);
    const raw = interaction.fields.getTextInputValue("hours").trim();
    const hours = Number(raw);
    if (!Number.isInteger(hours) || hours < 0 || hours > 8760) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Account Age",
            "Enter a whole number from 0 to 8760 hours.",
          ),
        ),
      );
      return true;
    }
    config.minAccountAgeHours = hours;
    await saveAutoroleConfig(servicesForModule(services), guildId, config);
    await replyOrUpdate(
      interaction,
      await renderAutoroleFilters(
        interaction,
        services,
        pageNumber(parts[2]),
        `🕒 Minimum account age set to ${hours}h.`,
      ),
    );
    return true;
  }

  if (action === "vrmodalgrace") {
    const raw = interaction.fields.getTextInputValue("seconds").trim();
    const seconds = Number(raw);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Grace",
            "Enter a whole number from 0 to 86400 seconds.",
          ),
        ),
      );
      return true;
    }
    const channelId = parts[2];
    if (!isSnowflake(channelId)) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Mapping Missing", "That mapping no longer exists.")),
      );
      return true;
    }
    const mapping = await getVoiceRoleMapping(
      servicesForModule(services),
      guildId,
      channelId,
    );
    if (!mapping) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Mapping Missing", "That mapping no longer exists.")),
      );
      return true;
    }
    await upsertVoiceRoleMapping(servicesForModule(services), {
      guildId,
      channelId,
      categoryId: mapping.categoryId,
      roleId: mapping.roleId,
      graceSeconds: seconds,
    });
    await replyOrUpdate(
      interaction,
      await renderVoiceRoleMapping(
        interaction,
        services,
        channelId,
        pageNumber(parts[3]),
        `⏱️ Grace set to ${seconds}s.`,
      ),
    );
    return true;
  }

  if (action === "rmmodalcreate") {
    await createRoleMenuGroup(
      interaction,
      services,
      guildId,
      pageNumber(parts[2]),
    );
    return true;
  }

  if (action === "rmmodaledit") {
    const groupId = parts[2];
    const group = await services.helpers.roleMenus.findGroupById(
      guildId,
      groupId,
    );
    if (!group) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Role Menu Missing", "That group no longer exists."),
        ),
      );
      return true;
    }
    await editRoleMenuGroup(
      interaction,
      services,
      guildId,
      group,
      pageNumber(parts[3]),
    );
    return true;
  }

  return false;
}
