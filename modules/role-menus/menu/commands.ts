import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import {
  type APIInteractionGuildMember,
  type ChatInputCommandInteraction,
  ChannelType,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getRoleMenusConfig,
  MaxTempDurationSeconds,
  type RoleMenusConfig,
} from "../config.js";
import {
  deleteRoleMenuMessage,
  missingChannelCard,
  postRoleMenu,
  postSuccessCard,
  refreshRoleMenuMessage,
  type SendableChannel,
} from "./posting.js";
import { formatTempDuration, type RoleMenuMode } from "./selection.js";
import { findGroup, type GroupRecord } from "./service.js";
import { groupMode, roleMenuListCard, type RoleMenuStyle } from "./ui.js";

const ModuleName = "role-menus-menu";
const PermitNode = "rolemenu.manage";

function roleIdsOf(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
): string[] {
  if (!member) return [];
  const roles: unknown = member.roles;
  if (Array.isArray(roles)) {
    return roles.filter(
      (roleId): roleId is string => typeof roleId === "string",
    );
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

async function canManage(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleIds: roleIdsOf(interaction.member),
        channelId: interaction.channelId,
        guildOwnerId: interaction.guild?.ownerId,
        permitNode: PermitNode,
      },
      services.client,
    );
    return result?.allowed === true;
  } catch (error) {
    services.observability?.logger?.warn?.("role menu permit check failed", {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error,
    });
    return false;
  }
}

function missingGuildCard() {
  return makeErrorCard("Server Only", "Role menus only work inside a server.");
}

function disabledCard() {
  return makeErrorCard(
    "Module Disabled",
    "The Role Menus module is disabled on this server.",
  );
}

async function resolveGroupOrReply(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  reference: string,
): Promise<GroupRecord | null> {
  const group = await findGroup(services, interaction.guildId!, reference);
  if (!group) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Unknown Role Menu",
          `No role menu named or identified by \`${reference}\` exists.`,
        ),
      ),
    );
    return null;
  }
  return group;
}

function normalizeMax(raw: number | null, fallback: number): number | null {
  const value = raw ?? fallback;
  return value > 0 ? value : null;
}

function normalizeTemp(raw: number | null, fallback: number): number | null {
  const value = raw ?? fallback;
  if (value <= 0) return null;
  return Math.min(value, MaxTempDurationSeconds);
}

function validationForTemp(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    return "Temporary duration must be at least 1 second, or 0 for permanent.";
  }
  if (value > MaxTempDurationSeconds) {
    return "Temporary duration cannot exceed 30 days.";
  }
  return null;
}

function validationForMax(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    return "Maximum selections must be between 1 and 25, or 0 for unlimited.";
  }
  return null;
}

function groupSummary(group: GroupRecord): string {
  const options = group.options.length;
  const temp = formatTempDuration(group.tempDurationSeconds);
  const limit =
    groupMode(group) === "single"
      ? "single"
      : group.maxSelections && group.maxSelections > 0
        ? `up to ${group.maxSelections}`
        : "unlimited";
  return `**${group.name}** — ${groupMode(group)} (${limit}) · ${options} option${options === 1 ? "" : "s"} · ${temp}${group.requireOne ? " · one required" : ""}${group.autoToggle ? " · auto-toggle" : ""}`;
}

export const rolemenuCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("rolemenu")
    .setDescription("Create and publish self-service role menus")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a role menu group")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Unique group name")
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Shown above the role options")
            .setMaxLength(500),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("How many roles a member may hold")
            .addChoices(
              { name: "Single", value: "single" },
              { name: "Multiple", value: "multiple" },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("require_one")
            .setDescription("Members must keep at least one role"),
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_toggle")
            .setDescription("Selecting a held role removes it"),
        )
        .addIntegerOption((option) =>
          option
            .setName("max_selections")
            .setDescription("Maximum roles a member may hold; 0 is unlimited")
            .setMinValue(0)
            .setMaxValue(25),
        )
        .addIntegerOption((option) =>
          option
            .setName("temp_seconds")
            .setDescription(
              "Temporary role duration in seconds; 0 is permanent (max 30 days)",
            )
            .setMinValue(0)
            .setMaxValue(MaxTempDurationSeconds),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit a role menu group's settings")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("new_name")
            .setDescription("New group name")
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("New description; leave empty to clear")
            .setMaxLength(500),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("How many roles a member may hold")
            .addChoices(
              { name: "Single", value: "single" },
              { name: "Multiple", value: "multiple" },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("require_one")
            .setDescription("Members must keep at least one role"),
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_toggle")
            .setDescription("Selecting a held role removes it"),
        )
        .addIntegerOption((option) =>
          option
            .setName("max_selections")
            .setDescription("Maximum roles; 0 is unlimited")
            .setMinValue(0)
            .setMaxValue(25),
        )
        .addIntegerOption((option) =>
          option
            .setName("temp_seconds")
            .setDescription("Temporary duration in seconds; 0 is permanent")
            .setMinValue(0)
            .setMaxValue(MaxTempDurationSeconds),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a role menu group and its posted menus")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-option")
        .setDescription("Add a role to a group")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role members can claim")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("label")
            .setDescription("Button label")
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName("emoji")
            .setDescription("Emoji shown on the option")
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Short option description")
            .setMaxLength(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-option")
        .setDescription("Remove a role from a group")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to remove")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("post")
        .setDescription("Publish a role menu")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("style")
            .setDescription("How members claim roles")
            .addChoices(
              { name: "Buttons", value: "buttons" },
              { name: "Select menu", value: "select" },
              { name: "Reactions", value: "reactions" },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post in")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List role menu groups"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("refresh")
        .setDescription("Refresh a group's posted menus")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  requiredPermit: PermitNode,

  async autocomplete(interaction, services) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "group") {
      await interaction.respond([]);
      return;
    }
    const authorized = await canManage(
      interaction as unknown as ChatInputCommandInteraction,
      services,
    );
    if (!authorized) {
      await interaction.respond([]);
      return;
    }
    const rows = await services.db.prisma.roleMenuGroup
      .findMany({
        where: {
          guildId: interaction.guildId,
          name: { contains: focused.value, mode: "insensitive" },
        },
        orderBy: { name: "asc" },
        take: 25,
        select: { name: true },
      })
      .catch(() => []);
    await interaction.respond(
      rows.map((row: { name: string }) => ({
        name: row.name,
        value: row.name,
      })),
    );
  },

  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) {
      await interaction.reply(ephemeralCard(missingGuildCard()));
      return;
    }
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(ephemeralCard(disabledCard()));
      return;
    }
    if (!(await canManage(interaction, services))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permissions",
            "You need **Manage Server** or the **rolemenu.manage** permit.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const config = await getRoleMenusConfig(services, guildId);

    if (subcommand === "create") {
      await createGroup(interaction, services, config);
      return;
    }
    if (subcommand === "list") {
      await listGroups(interaction, services);
      return;
    }

    const reference = interaction.options.getString("group", true);
    const group = await resolveGroupOrReply(interaction, services, reference);
    if (!group) return;

    switch (subcommand) {
      case "edit":
        await editGroup(interaction, services, group);
        return;
      case "delete":
        await deleteGroup(interaction, services, group);
        return;
      case "add-option":
        await addOption(interaction, services, group, config);
        return;
      case "remove-option":
        await removeOption(interaction, services, group);
        return;
      case "post":
        await postGroup(interaction, services, group, config);
        return;
      case "refresh":
        await refreshGroup(interaction, services, group);
        return;
      default:
        return;
    }
  },
};

async function createGroup(
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

  const existing = await services.db.prisma.roleMenuGroup.findFirst({
    where: { guildId, name },
    select: { id: true },
  });
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
    group = await services.db.prisma.roleMenuGroup.create({
      data: {
        guildId,
        name,
        description: interaction.options.getString("description"),
        mode,
        requireOne,
        autoToggle,
        maxSelections,
        tempDurationSeconds,
      },
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

async function editGroup(
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
    const existing = await services.db.prisma.roleMenuGroup.findFirst({
      where: { guildId: group.guildId, name, id: { not: group.id } },
      select: { id: true },
    });
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

  const updated = await services.db.prisma.roleMenuGroup.update({
    where: { id: group.id },
    data,
  });
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${updated.name}`, [
        "Role menu settings updated.",
        "Run `/rolemenu refresh` to update posted menus.",
      ]),
    ),
  );
}

async function deleteGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
): Promise<void> {
  const messages = await services.db.prisma.roleMenuMessage.findMany({
    where: { groupId: group.id },
    select: { channelId: true, messageId: true },
  });
  for (const message of messages) {
    await deleteRoleMenuMessage(services, message);
  }
  const roleIds = group.options.map((option) => option.roleId);
  if (roleIds.length > 0) {
    await services.db.prisma.roleMenuTempRole
      .deleteMany({
        where: { guildId: group.guildId, roleId: { in: roleIds } },
      })
      .catch(() => undefined);
  }
  await services.db.prisma.roleMenuGroup.delete({ where: { id: group.id } });
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        `🎭 ${group.name}`,
        `Role menu deleted. Removed ${messages.length} posted menu${messages.length === 1 ? "" : "s"}.`,
      ),
    ),
  );
}

async function addOption(
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

  await services.db.prisma.roleMenuOption.create({
    data: {
      groupId: group.id,
      roleId: role.id,
      label: label.slice(0, 80),
      emoji,
      description,
      position,
    },
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

async function removeOption(
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

  await services.db.prisma.roleMenuOption.delete({ where: { id: option.id } });
  await services.db.prisma.roleMenuTempRole
    .deleteMany({
      where: { guildId: group.guildId, roleId: option.roleId },
    })
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

async function postGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
  config: RoleMenusConfig,
): Promise<void> {
  const style = (interaction.options.getString("style") ??
    "buttons") as RoleMenuStyle;
  const requestedChannel = interaction.options.getChannel("channel");
  const channelRef = requestedChannel ?? interaction.channel;
  const channel = channelRef
    ? (interaction.guild!.channels.cache.get(channelRef.id) ??
      (await interaction
        .guild!.channels.fetch(channelRef.id)
        .catch(() => null)))
    : null;
  if (!(channel?.isTextBased() && "send" in channel)) {
    await interaction.reply(ephemeralCard(missingChannelCard()));
    return;
  }
  if (group.options.length > config.maxOptionsPerGroup) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Too Many Options",
          `This group has ${group.options.length} options, above the server limit of ${config.maxOptionsPerGroup}.`,
        ),
      ),
    );
    return;
  }

  const result = await postRoleMenu(
    services,
    interaction.guild!,
    group,
    group.options,
    style,
    channel as unknown as SendableChannel,
  );
  if ("error" in result) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Post Failed", result.error)),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      postSuccessCard(
        group,
        style,
        result.channelId,
        result.messageId,
        group.guildId,
      ),
    ),
  );
}

async function refreshGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
): Promise<void> {
  const messages = await services.db.prisma.roleMenuMessage.findMany({
    where: { groupId: group.id },
  });
  if (messages.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeInfoCard(
          `🎭 ${group.name}`,
          "This group has no posted menus to refresh.",
        ),
      ),
    );
    return;
  }

  let refreshed = 0;
  let deleted = 0;
  let skipped = 0;
  for (const message of messages) {
    const outcome = await refreshRoleMenuMessage(
      services,
      interaction.guild!,
      group,
      group.options,
      message,
    );
    if (outcome === "refreshed") refreshed += 1;
    else if (outcome === "deleted") deleted += 1;
    else skipped += 1;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${group.name}`, [
        `**Refreshed** ${refreshed}`,
        `**Deleted missing** ${deleted}`,
        `**Skipped** ${skipped}`,
      ]),
    ),
  );
}

async function listGroups(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const groups = await services.db.prisma.roleMenuGroup.findMany({
    where: { guildId: interaction.guildId! },
    include: { options: { select: { id: true } } },
    orderBy: { name: "asc" },
  });

  if (groups.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeInfoCard(
          "🎭 Role Menus",
          "No role menus exist yet. Create one with `/rolemenu create`.",
        ),
      ),
    );
    return;
  }

  const lines = groups.map((group: GroupRecord) => groupSummary(group));
  await interaction.reply(ephemeralCard(roleMenuListCard(lines)));
}
