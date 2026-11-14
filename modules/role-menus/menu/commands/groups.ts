import type { ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import type { RoleMenusConfig } from "../config.js";
import { deleteRoleMenuMessage } from "../posting.js";
import { formatTempDuration, type RoleMenuMode } from "../selection.js";
import type { GroupRecord } from "../service.js";
import {
  normalizeMax,
  normalizeTemp,
  validationForMax,
  validationForTemp,
} from "./shared.js";

export async function createGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  config: RoleMenusConfig,
): Promise<void> {
  const guildId = interaction.guildId!;
  const name = interaction.options.getString("name", true).trim();
  if (name.length === 0) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Invalid Name", "The name cannot be empty.")),
    );
    return;
  }

  const mode = (interaction.options.getString("mode") ??
    config.defaultMode) as RoleMenuMode;
  const requireOne =
    interaction.options.getBoolean("require_one") ?? config.defaultRequireOne;
  const autoToggle =
    interaction.options.getBoolean("auto_toggle") ?? config.defaultAutoToggle;
  const maxSelections = normalizeMax(
    interaction.options.getInteger("max_selections"),
    config.defaultMaxSelections,
  );
  const tempDurationSeconds = normalizeTemp(
    interaction.options.getInteger("temp_seconds"),
    config.defaultTempDurationSeconds,
  );

  const maxProblem = validationForMax(maxSelections);
  const tempProblem = validationForTemp(tempDurationSeconds);
  if (maxProblem || tempProblem) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Invalid Settings", maxProblem ?? tempProblem!),
      ),
    );
    return;
  }

  const existing = await services.helpers.roleMenus.findGroupNameConflict(
    guildId,
    name,
  );
  if (existing) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Name Taken",
          `A role menu named **${name}** already exists.`,
        ),
      ),
    );
    return;
  }

  let group: { name: string };
  try {
    group = await services.helpers.roleMenus.createGroup({
      guildId,
      name,
      description: interaction.options.getString("description"),
      mode,
      requireOne,
      autoToggle,
      maxSelections,
      tempDurationSeconds,
    });
  } catch (error) {
    services.observability?.logger?.warn?.("role menu create failed", {
      guildId,
      name,
      error,
    });
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Create Failed",
          "I could not create that role menu. The name may already be in use.",
        ),
      ),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${group.name}`, [
        "Role menu group created.",
        `**Mode** ${mode}`,
        `**Max selections** ${maxSelections ?? "unlimited"}`,
        `**Temporary** ${formatTempDuration(tempDurationSeconds)}`,
        "Add roles with `/rolemenu add-option`, then publish with `/rolemenu post`.",
      ]),
    ),
  );
}

export async function editGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
): Promise<void> {
  const data: Record<string, unknown> = {};
  const newName = interaction.options.getString("new_name");
  if (newName !== null) {
    const name = newName.trim();
    if (name.length === 0) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid Name", "The name cannot be empty."),
        ),
      );
      return;
    }
    const existing = await services.helpers.roleMenus.findGroupNameConflict(
      group.guildId,
      name,
      group.id,
    );
    if (existing) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Name Taken",
            `A role menu named **${name}** already exists.`,
          ),
        ),
      );
      return;
    }
    data.name = name;
  }

  const description = interaction.options.getString("description");
  if (description !== null) {
    data.description =
      description.trim().length > 0 ? description.trim() : null;
  }
  const mode = interaction.options.getString("mode");
  if (mode !== null) data.mode = mode;
  const requireOne = interaction.options.getBoolean("require_one");
  if (requireOne !== null) data.requireOne = requireOne;
  const autoToggle = interaction.options.getBoolean("auto_toggle");
  if (autoToggle !== null) data.autoToggle = autoToggle;

  const rawMax = interaction.options.getInteger("max_selections");
  if (rawMax !== null) {
    const maxSelections = rawMax > 0 ? rawMax : null;
    const maxProblem = validationForMax(maxSelections);
    if (maxProblem) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Invalid Settings", maxProblem)),
      );
      return;
    }
    data.maxSelections = maxSelections;
  }

  const rawTemp = interaction.options.getInteger("temp_seconds");
  if (rawTemp !== null) {
    const tempDurationSeconds = rawTemp > 0 ? rawTemp : null;
    const tempProblem = validationForTemp(tempDurationSeconds);
    if (tempProblem) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Invalid Settings", tempProblem)),
      );
      return;
    }
    data.tempDurationSeconds = tempDurationSeconds;
  }

  if (Object.keys(data).length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeWarningCard(
          "No Changes",
          "Provide at least one setting to update.",
        ),
      ),
    );
    return;
  }

  const updated = await services.helpers.roleMenus.updateGroup(group.id, data);
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${updated.name}`, [
        "Role menu settings updated.",
        "Run `/rolemenu refresh` to update posted menus.",
      ]),
    ),
  );
}

export async function deleteGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
): Promise<void> {
  const messages = await services.helpers.roleMenus.listGroupMessageLocations(
    group.id,
  );
  for (const message of messages) {
    await deleteRoleMenuMessage(services, message);
  }
  const roleIds = group.options.map((option) => option.roleId);
  if (roleIds.length > 0) {
    await services.helpers.roleMenus
      .deleteTempRolesForRoleIds(group.guildId, roleIds)
      .catch(() => undefined);
  }
  await services.helpers.roleMenus.deleteGroup(group.id);
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        `🎭 ${group.name}`,
        `Role menu deleted. Removed ${messages.length} posted menu${messages.length === 1 ? "" : "s"}.`,
      ),
    ),
  );
}
