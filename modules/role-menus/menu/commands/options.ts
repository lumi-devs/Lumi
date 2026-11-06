import type { ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import type { RoleMenusConfig } from "../config.js";
import type { GroupRecord } from "../service.js";

export async function addOption(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
  config: RoleMenusConfig,
): Promise<void> {
  if (group.options.length >= config.maxOptionsPerGroup) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Option Limit Reached",
          `This server allows at most ${config.maxOptionsPerGroup} options per group.`,
        ),
      ),
    );
    return;
  }

  const role = interaction.options.getRole("role", true);
  if (role.id === interaction.guildId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Role",
          "The @everyone role cannot be a menu option.",
        ),
      ),
    );
    return;
  }
  if (role.managed) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Managed Role",
          "Integration-managed roles cannot be assigned by role menus.",
        ),
      ),
    );
    return;
  }
  const me = interaction.guild?.members.me;
  if (!me) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Unavailable", "I cannot inspect my server member."),
      ),
    );
    return;
  }
  if (role.position >= me.roles.highest.position) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Role Too High",
          "That role is above or equal to my highest role.",
        ),
      ),
    );
    return;
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Missing Permissions",
          "I need the **Manage Roles** permission to assign menu roles.",
        ),
      ),
    );
    return;
  }

  const existing = group.options.find((option) => option.roleId === role.id);
  if (existing) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Already Added",
          `That role is already an option in **${group.name}**.`,
        ),
      ),
    );
    return;
  }

  const label = interaction.options.getString("label")?.trim() || role.name;
  const emoji = interaction.options.getString("emoji")?.trim() || null;
  const description =
    interaction.options.getString("description")?.trim() || null;
  const position =
    group.options.reduce(
      (highest, option) => Math.max(highest, option.position),
      -1,
    ) + 1;

  await services.helpers.roleMenus.createOption({
    groupId: group.id,
    roleId: role.id,
    label: label.slice(0, 80),
    emoji,
    description,
    position,
  });

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${group.name}`, [
        `Added ${role} as **${label}**.`,
        "Run `/rolemenu refresh` to update posted menus.",
      ]),
    ),
  );
}

export async function removeOption(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
): Promise<void> {
  const role = interaction.options.getRole("role", true);
  const option = group.options.find((item) => item.roleId === role.id);
  if (!option) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Not Found",
          `That role is not an option in **${group.name}**.`,
        ),
      ),
    );
    return;
  }

  await services.helpers.roleMenus.deleteOption(option.id);
  await services.helpers.roleMenus
    .deleteTempRolesForRole(group.guildId, option.roleId)
    .catch(() => undefined);

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${group.name}`, [
        `Removed ${role} from the menu.`,
        "Run `/rolemenu refresh` to update posted menus.",
      ]),
    ),
  );
}
