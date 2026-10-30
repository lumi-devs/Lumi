import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "@lumi/ui";
import { ChannelType, SlashCommandBuilder, type VoiceState } from "discord.js";
import { canManageRolesCommand, roleMentions } from "../shared.js";
import {
  getVoiceRolesConfig,
  VoiceRolesConfigSchema,
  VoiceRolesModuleName,
} from "./config.js";
import { expireVoiceGraceSessions, handleVoiceStateUpdate } from "./voice.js";
import {
  deleteVoiceRoleMapping,
  getVoiceRoleMapping,
  listVoiceRoleMappings,
  setVoiceRoleEnabled,
  upsertVoiceRoleMapping,
} from "./store.js";

const PermitNode = "roles.voiceroles";

const voiceRolesCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("voiceroles")
    .setDescription("Manage voice channel role automation")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Map a voice or stage channel to a role")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Voice or stage channel")
            .addChannelTypes(
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
            )
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role assigned while connected")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("grace")
            .setDescription("Seconds to keep the role after leaving")
            .setMinValue(0)
            .setMaxValue(86400)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Also match every channel in this category")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a channel role mapping")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Mapped voice or stage channel")
            .addChannelTypes(
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List voice role mappings"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Enable or disable a channel role mapping")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Mapped voice or stage channel")
            .addChannelTypes(
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
            )
            .setRequired(true),
        ),
    ),
  requiredPermit: PermitNode,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Voice roles run per server."),
        ),
      );
      return;
    }
    if (!(await canManageRolesCommand(interaction, services, PermitNode))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You need **Manage Server** or the `roles.voiceroles` permit.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const config = await getVoiceRolesConfig(services, guild.id);

    if (subcommand === "add") {
      const channel = interaction.options.getChannel("channel", true);
      const role = interaction.options.getRole("role", true);
      const category = interaction.options.getChannel("category");
      const grace = interaction.options.getInteger("grace");
      await upsertVoiceRoleMapping(services, {
        guildId: guild.id,
        channelId: channel.id,
        categoryId: category?.id ?? null,
        roleId: role.id,
        graceSeconds: grace ?? config.defaultGraceSeconds,
      });
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard("Voice Role Saved", [
            `**Channel**\n<#${channel.id}>`,
            `**Role**\n<@&${role.id}>`,
            `**Category**\n${category ? `<#${category.id}>` : "None"}`,
            `**Grace**\n${grace ?? config.defaultGraceSeconds}s`,
          ]),
        ),
      );
      return;
    }

    if (subcommand === "remove") {
      const channel = interaction.options.getChannel("channel", true);
      const removed = await deleteVoiceRoleMapping(
        services,
        guild.id,
        channel.id,
      );
      await interaction.reply(
        ephemeralCard(
          removed
            ? makeSuccessCard(
                "Voice Role Removed",
                `Removed the mapping for <#${channel.id}>.`,
              )
            : makeErrorCard(
                "Not Mapped",
                `<#${channel.id}> does not have a voice role mapping.`,
              ),
        ),
      );
      return;
    }

    if (subcommand === "toggle") {
      const channel = interaction.options.getChannel("channel", true);
      const existing = await getVoiceRoleMapping(
        services,
        guild.id,
        channel.id,
      );
      if (!existing) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Not Mapped",
              `<#${channel.id}> does not have a voice role mapping.`,
            ),
          ),
        );
        return;
      }
      const updated = await setVoiceRoleEnabled(
        services,
        guild.id,
        channel.id,
        !existing.enabled,
      );
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Voice Role Toggled",
            `Mapping for <#${channel.id}> is now **${updated?.enabled ? "enabled" : "disabled"}**.`,
          ),
        ),
      );
      return;
    }

    const mappings = await listVoiceRoleMappings(services, guild.id);
    if (mappings.length === 0) {
      await interaction.reply(
        ephemeralCard(
          makeInfoCard(
            "🔊 Voice Roles",
            "No voice role mappings are configured. Use `/voiceroles add`.",
          ),
        ),
      );
      return;
    }
    const lines = mappings.slice(0, 20).map((mapping) => {
      const category = mapping.categoryId
        ? ` · category <#${mapping.categoryId}>`
        : "";
      return `<#${mapping.channelId}> → ${roleMentions([mapping.roleId])} · ${mapping.enabled ? "Enabled" : "Disabled"} · grace ${mapping.graceSeconds}s${category}`;
    });
    await interaction.reply(
      ephemeralCard(
        makeInfoCard("🔊 Voice Roles", [
          ...lines,
          ...(mappings.length > lines.length
            ? [`…and ${mappings.length - lines.length} more`]
            : []),
        ]),
      ),
    );
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(
    oldState: VoiceState,
    newState: VoiceState,
    services: ModuleServices,
  ) {
    await handleVoiceStateUpdate(oldState, newState, services);
  },
};

const voiceRolesModule: ModuleDefinition = defineModule({
  name: VoiceRolesModuleName,
  displayName: "Voice Roles",
  emoji: "🔊",
  description:
    "Per voice and stage channel roles with optional category mapping and grace periods",
  version: "2.0.0",
  config: VoiceRolesConfigSchema,
  commands: [voiceRolesCommand],
  listeners: [onVoiceStateListener],
  tasks: [
    {
      name: "grace-expiry",
      cron: "*/1 * * * *",
      async handler(services: ModuleServices) {
        await expireVoiceGraceSessions(services);
      },
    },
  ],
  async onLoad(_services) {
    console.log(`[${VoiceRolesModuleName}] Module loaded`);
    return [];
  },
  async onUnload() {
    console.log(`[${VoiceRolesModuleName}] Module unloaded`);
  },
});

export default voiceRolesModule;
