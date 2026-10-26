import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
} from "discord.js";
import {
  defineModule,
  type CommandDefinition,
  type ListenerDefinition,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  TempVcConfigSchema,
  buildControlPanelForChannel,
  canUseTempVcAdmin,
  getTempVcConfig,
  handleTempVcInteraction,
  handleVoiceStateChange,
  isModuleEnabled,
  sweepExpiredTempChannels,
} from "./panel.js";
import { adminPanelCard, configPanelCard } from "./ui.js";

let sweepTimer: ReturnType<typeof setInterval> | null = null;

const stopSweep = (): void => {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
};

const tempvcCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("tempvc")
    .setDescription("Temporary voice channel controls and generator management")
    .addSubcommand((sub) =>
      sub.setName("panel").setDescription("Open your temp VC control panel"),
    )
    .addSubcommand((sub) =>
      sub.setName("admin").setDescription("Manage voice generator channels (staff only)"),
    ),
  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Server Only",
            "Temporary voice controls only work inside a server.",
          ),
        ),
      );
      return;
    }

    if (!isModuleEnabled(services, guildId)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "The tempvc module is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "admin") {
      if (!(await canUseTempVcAdmin(interaction, services))) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Staff Only",
              "You need the **tempvc.admin** permit or **Manage Server** to use generator management.",
            ),
          ),
        );
        return;
      }
      const config = await getTempVcConfig(services, guildId);
      const card = adminPanelCard(interaction.guild ?? null, config);
      await interaction.reply(ephemeralCard(card));
      return;
    }

    const member = interaction.member as GuildMember | null;
    const channelId = member?.voice?.channelId;
    if (!channelId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Connected",
            "Join your temporary voice channel first, then run `/tempvc panel` again.",
          ),
        ),
      );
      return;
    }

    const card = await buildControlPanelForChannel(
      services,
      guildId,
      channelId,
    );
    if (!card) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Managed",
            "This voice channel is not a managed temporary channel.",
          ),
        ),
      );
      return;
    }

    await interaction.reply(card);
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(oldState, newState, services: any) {
    await handleVoiceStateChange(oldState, newState, services);
  },
};

const onInteractionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: any, services: any) {
    if (
      !interaction?.isButton?.() &&
      !interaction?.isAnySelectMenu?.() &&
      !interaction?.isModalSubmit?.()
    ) {
      return;
    }
    await handleTempVcInteraction(interaction, services);
  },
};

const tempvcModule: ModuleDefinition = defineModule({
  name: "tempvc",
  displayName: "Temporary Voice",
  emoji: "🔊",
  description: "Join-to-create temporary voice channels with ownership controls",
  version: "2.0.0",
  config: TempVcConfigSchema,
  configFields: [
    {
      key: "categoryId",
      label: "Category",
      type: "channel",
      description: "Category to create channels in",
    },
    {
      key: "templateName",
      label: "Channel Name Template",
      type: "string",
      description: "Use {user} for username",
    },
    {
      key: "defaultBitrate",
      label: "Default Bitrate",
      type: "number",
      description: "Bitrate in bps (8000-384000)",
    },
    {
      key: "defaultUserLimit",
      label: "Default User Limit",
      type: "number",
      description: "0 = unlimited",
    },
    {
      key: "maxChannels",
      label: "Max Channels",
      type: "number",
      description: "Guild-wide limit",
    },
    {
      key: "maxPerUser",
      label: "Max Per User",
      type: "number",
      description: "How many channels one user can own",
    },
    {
      key: "emptyTimeoutMs",
      label: "Empty Timeout (ms)",
      type: "number",
      description: "Delete after empty for this long",
    },
    {
      key: "createCooldownMs",
      label: "Create Cooldown (ms)",
      type: "number",
      description: "Wait before creating another channel (default 10000)",
    },
    {
      key: "ownerLeaveDelete",
      label: "Delete on Owner Leave",
      type: "boolean",
      description: "Delete channel when owner leaves",
    },
  ],
  commands: [tempvcCommand],
  listeners: [onVoiceStateListener, onInteractionListener],
  tasks: [],
  async onLoad(services) {
    stopSweep();
    sweepTimer = setInterval(() => {
      void sweepExpiredTempChannels(services).catch(() => undefined);
    }, 60_000);
    void sweepExpiredTempChannels(services).catch(() => undefined);
    console.log("[tempvc] Module loaded");
    return [stopSweep];
  },
  async onUnload(_services) {
    stopSweep();
    console.log("[tempvc] Module unloaded");
  },
});

export default tempvcModule;
