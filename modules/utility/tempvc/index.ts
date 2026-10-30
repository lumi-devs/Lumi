import { requireGuildId as guildIdOf } from "@lumi/foundation";
import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard } from "@lumi/ui";
import {
  type GuildMember,
  type Interaction,
  SlashCommandBuilder,
  type VoiceState,
} from "discord.js";
import { canUseTempVcAdmin } from "./access.js";
import { getTempVcConfig, isModuleEnabled } from "./config.js";
import { handleTempVcInteraction } from "./interactions.js";
import {
  buildControlPanelForChannel,
  sweepExpiredTempChannels,
  TempVcConfigSchema,
} from "./panel.js";
import { replyError } from "./reply.js";
import { adminPanelCard } from "./ui-admin.js";
import { handleVoiceStateChange } from "./voice.js";

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
    const guildId = guildIdOf(interaction.guildId);
    if (!guildId) {
      await replyError(
        interaction,
        "Server Only",
        "Temporary voice controls only work inside a server.",
      );
      return;
    }

    if (!isModuleEnabled(services, guildId)) {
      await replyError(
        interaction,
        "Module Disabled",
        "The tempvc module is disabled on this server.",
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "admin") {
      if (!(await canUseTempVcAdmin(interaction, services))) {
        await replyError(
          interaction,
          "Staff Only",
          "You need the **tempvc.admin** permit or **Manage Server** to use generator management.",
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
      await replyError(
        interaction,
        "Not Connected",
        "Join your temporary voice channel first, then run `/tempvc panel` again.",
      );
      return;
    }

    const card = await buildControlPanelForChannel(
      services,
      guildId,
      channelId,
    );
    if (!card) {
      await replyError(
        interaction,
        "Not Managed",
        "This voice channel is not a managed temporary channel.",
      );
      return;
    }

    await interaction.reply(card);
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(oldState: VoiceState, newState: VoiceState, services: ModuleServices) {
    await handleVoiceStateChange(oldState, newState, services);
  },
};

const onInteractionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (
      !interaction.isButton() &&
      !interaction.isAnySelectMenu() &&
      !interaction.isModalSubmit()
    ) {
      return;
    }
    await handleTempVcInteraction(interaction, services);
  },
};

const tempvcModule: ModuleDefinition = defineModule({
  name: "utility-tempvc",
  displayName: "Temporary Voice",
  emoji: "🔊",
  description: "Join-to-create temporary voice channels with ownership controls",
  version: "2.0.0",
  config: TempVcConfigSchema,
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
