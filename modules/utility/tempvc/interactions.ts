import {
  requireGuildId as guildIdOf,
  isSnowflake,
} from "@lumi/foundation";
import {
  ActionRowBuilder,
  type GuildMember,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { handleAdminInteraction } from "./admin.js";
import { isModuleEnabled } from "./config.js";
import {
  stripPrefix,
  TempVcPrefixes,
} from "./ids.js";
import {
  buildControlPanel,
  controlState,
  deleteTempVoiceChannel,
  findTempChannel,
  type ManagedChannel,
  resolveGuildVoiceChannel,
  updateTempRecord,
} from "./panel.js";
import { replyError, replySuccess, showCard } from "./reply.js";
import { deleteConfirmCard, memberActionCard } from "./ui.js";


async function loadManaged(
  interaction: any,
  services: any,
  channelId: string,
): Promise<ManagedChannel | null> {
  const record = await findTempChannel(services, channelId);
  if (!record || record.guildId !== interaction.guildId) {
    await replyError(
      interaction,
      "Not Managed",
      "That channel is not a managed temporary voice channel.",
    );
    return null;
  }
  const channel = await resolveGuildVoiceChannel(
    services,
    interaction.guildId,
    channelId,
  );
  if (!channel) {
    await replyError(
      interaction,
      "Channel Missing",
      "That voice channel no longer exists.",
    );
    return null;
  }
  return { record, channel };
}

async function assertOwnerOrManage(
  interaction: any,
  managed: ManagedChannel,
): Promise<boolean> {
  if (managed.record.ownerId === interaction.user.id) return true;
  const member = interaction.member as GuildMember | null;
  const permissions = interaction.memberPermissions ?? member?.permissions;
  if (permissions?.has?.(PermissionFlagsBits.ManageChannels)) return true;
  await replyError(
    interaction,
    "Not Allowed",
    "Only the channel owner or a member with **Manage Channels** can do that.",
  );
  return false;
}

async function refreshNotice(
  interaction: any,
  managed: ManagedChannel,
  notice?: string,
): Promise<void> {
  await showCard(
    interaction,
    buildControlPanel(managed.channel, managed.record, notice),
  );
}

async function openRenameModal(
  interaction: any,
  channelId: string,
  current: string,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`tempvc:modal:rename:${channelId}`)
    .setTitle("Rename Channel")
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Channel name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
          .setValue(current.slice(0, 100)),
      ),
    );
  await interaction.showModal(modal).catch(() => undefined);
}

async function openLimitModal(
  interaction: any,
  channelId: string,
  current: number,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`tempvc:modal:limit:${channelId}`)
    .setTitle("Set User Limit")
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("User limit (0 = unlimited)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(String(current)),
      ),
    );
  await interaction.showModal(modal).catch(() => undefined);
}

async function handlePanelAction(
  interaction: any,
  managed: ManagedChannel,
  action: string,
): Promise<void> {
  const { channel } = managed;

  switch (action) {
    case "rename":
      await openRenameModal(interaction, channel.id, channel.name);
      return;
    case "limit":
      await openLimitModal(interaction, channel.id, channel.userLimit ?? 0);
      return;
    case "lock":
    case "unlock": {
      const locked = action === "lock";
      await channel.permissionOverwrites
        .edit(channel.guild.roles.everyone.id, { Connect: !locked })
        .catch(() => undefined);
      await refreshNotice(
        interaction,
        managed,
        locked ? "🔒 Channel locked." : "🔓 Channel unlocked.",
      );
      return;
    }
    case "hide":
    case "unhide": {
      const hidden = action === "hide";
      await channel.permissionOverwrites
        .edit(channel.guild.roles.everyone.id, { ViewChannel: !hidden })
        .catch(() => undefined);
      await refreshNotice(
        interaction,
        managed,
        hidden ? "🙈 Channel hidden." : "👁️ Channel visible.",
      );
      return;
    }
    case "kick":
    case "trust":
    case "untrust":
    case "block":
    case "unblock":
    case "transfer":
      await showCard(
        interaction,
        memberActionCard(action, controlState(channel, managed.record)),
      );
      return;
    case "delete":
      await showCard(
        interaction,
        deleteConfirmCard(controlState(channel, managed.record)),
      );
      return;
    default:
      await refreshNotice(interaction, managed, "That action is not available.");
  }
}

async function handleMemberPick(
  interaction: any,
  services: any,
  action: string,
  channelId: string,
): Promise<void> {
  const managed = await loadManaged(interaction, services, channelId);
  if (!managed) return;
  if (!(await assertOwnerOrManage(interaction, managed))) return;

  const targetId = interaction.values?.[0];
  if (!isSnowflake(targetId)) {
    await replyError(interaction, "Invalid Member", "Choose a valid member.");
    return;
  }

  const { channel, record } = managed;
  if (
    ["kick", "block", "transfer"].includes(action) &&
    targetId === record.ownerId
  ) {
    await replyError(
      interaction,
      "Not Allowed",
      action === "transfer"
        ? "That member already owns the channel."
        : "You cannot use that action on the channel owner.",
    );
    return;
  }

  if (action === "kick") {
    const target =
      channel.members.get(targetId) ??
      (await interaction.guild.members.fetch(targetId).catch(() => null));
    if (!target || target.voice.channelId !== channel.id) {
      await replyError(
        interaction,
        "Not Connected",
        "That member is not connected to this channel.",
      );
      return;
    }
    await target.voice
      .disconnect("Removed by the temporary channel owner")
      .catch(() => undefined);
    await refreshNotice(interaction, managed, `👢 Kicked <@${targetId}>.`);
    return;
  }

  if (action === "transfer") {
    const target =
      channel.members.get(targetId) ??
      (await interaction.guild.members.fetch(targetId).catch(() => null));
    if (!target || target.voice.channelId !== channel.id) {
      await replyError(
        interaction,
        "Not Connected",
        "The new owner must be connected to this channel.",
      );
      return;
    }
    const updated = await updateTempRecord(services, channel.id, {
      ownerId: targetId,
    });
    if (!updated) {
      await replyError(interaction, "Update Failed", "Could not transfer ownership.");
      return;
    }
    const previousOwner = record.ownerId;
    record.ownerId = targetId;
    await grantOwner(channel, targetId);
    await revokeOwner(channel, previousOwner);
    await refreshNotice(
      interaction,
      managed,
      `👑 Ownership transferred to <@${targetId}>.`,
    );
    return;
  }

  if (action === "trust") {
    await channel.permissionOverwrites
      .edit(targetId, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        Stream: true,
        UseVAD: true,
      })
      .catch(() => undefined);
    await refreshNotice(interaction, managed, `✅ Trusted <@${targetId}>.`);
    return;
  }

  if (action === "untrust") {
    await channel.permissionOverwrites
      .edit(targetId, {
        ViewChannel: null,
        Connect: null,
        Speak: null,
        Stream: null,
        UseVAD: null,
      })
      .catch(() => undefined);
    await refreshNotice(interaction, managed, `❌ Untrusted <@${targetId}>.`);
    return;
  }

  if (action === "block") {
    await channel.permissionOverwrites
      .edit(targetId, {
        ViewChannel: false,
        Connect: false,
        Speak: false,
        Stream: false,
      })
      .catch(() => undefined);
    const target = channel.members.get(targetId);
    if (target) {
      await target.voice
        .disconnect("Blocked from the temporary channel")
        .catch(() => undefined);
    }
    await refreshNotice(interaction, managed, `⛔ Blocked <@${targetId}>.`);
    return;
  }

  if (action === "unblock") {
    await channel.permissionOverwrites
      .edit(targetId, {
        ViewChannel: null,
        Connect: null,
        Speak: null,
        Stream: null,
      })
      .catch(() => undefined);
    await refreshNotice(interaction, managed, `♻️ Unblocked <@${targetId}>.`);
    return;
  }

  await refreshNotice(interaction, managed, "That action is not available.");
}

async function grantOwner(channel: any, userId: string): Promise<void> {
  await channel.permissionOverwrites
    .edit(userId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      UseVAD: true,
      ManageChannels: true,
      MoveMembers: true,
      MuteMembers: true,
      DeafenMembers: true,
    })
    .catch(() => undefined);
}

async function revokeOwner(channel: any, userId: string): Promise<void> {
  await channel.permissionOverwrites
    .edit(userId, {
      ManageChannels: false,
      MoveMembers: false,
      MuteMembers: false,
      DeafenMembers: false,
    })
    .catch(() => undefined);
}

async function handlePanelInteraction(
  interaction: any,
  services: any,
  customId: string,
): Promise<void> {
  const claimId = stripPrefix(customId, TempVcPrefixes.claim);
  if (claimId) {
    const managed = await loadManaged(interaction, services, claimId);
    if (!managed) return;
    if (!managed.channel.members.has(interaction.user.id)) {
      await replyError(
        interaction,
        "Join First",
        "You must be connected to the channel to claim it.",
      );
      return;
    }
    if (managed.record.ownerId === interaction.user.id) {
      await replyError(interaction, "Already Owner", "You already own this channel.");
      return;
    }
    const previousOwner = managed.record.ownerId;
    if (managed.channel.members.has(previousOwner)) {
      await replyError(
        interaction,
        "Owner Present",
        "The current owner is still connected. Ownership can only be claimed when they leave.",
      );
      return;
    }
    const updated = await updateTempRecord(services, managed.channel.id, {
      ownerId: interaction.user.id,
    });
    if (!updated) {
      await replyError(interaction, "Claim Failed", "Could not claim ownership.");
      return;
    }
    managed.record.ownerId = interaction.user.id;
    await grantOwner(managed.channel, interaction.user.id);
    await revokeOwner(managed.channel, previousOwner);
    await refreshNotice(interaction, managed, "👑 You now own this channel.");
    return;
  }

  const refreshId = stripPrefix(customId, TempVcPrefixes.refresh);
  if (refreshId) {
    const managed = await loadManaged(interaction, services, refreshId);
    if (!managed) return;
    await refreshNotice(interaction, managed, "");
    return;
  }

  const deleteId = stripPrefix(customId, TempVcPrefixes.delete);
  if (deleteId) {
    const managed = await loadManaged(interaction, services, deleteId);
    if (!managed) return;
    if (!(await assertOwnerOrManage(interaction, managed))) return;
    const name = managed.channel.name;
    const deleted = await deleteTempVoiceChannel(
      services,
      interaction.guildId,
      managed.channel.id,
    );
    if (deleted) {
      await replySuccess(interaction, "Channel Deleted", `Deleted **${name}**.`);
    } else {
      await replyError(interaction, "Delete Failed", "The channel could not be deleted.");
    }
    return;
  }

  const renameId = stripPrefix(customId, TempVcPrefixes.modalRename);
  if (renameId) {
    const managed = await loadManaged(interaction, services, renameId);
    if (!managed) return;
    if (!(await assertOwnerOrManage(interaction, managed))) return;
    const value = String(
      interaction.fields.getTextInputValue("value") ?? "",
    ).trim();
    if (value.length === 0) {
      await replyError(interaction, "Invalid Name", "The channel name cannot be empty.");
      return;
    }
    await managed.channel.setName(value.slice(0, 100)).catch(() => undefined);
    await refreshNotice(
      interaction,
      managed,
      `✏️ Renamed to **${value.slice(0, 100)}**.`,
    );
    return;
  }

  const limitId = stripPrefix(customId, TempVcPrefixes.modalLimit);
  if (limitId) {
    const managed = await loadManaged(interaction, services, limitId);
    if (!managed) return;
    if (!(await assertOwnerOrManage(interaction, managed))) return;
    const raw = String(interaction.fields.getTextInputValue("value") ?? "").trim();
    const limit = Number.parseInt(raw, 10);
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await replyError(interaction, "Invalid Limit", "Enter a number from 0 to 99.");
      return;
    }
    await managed.channel.setUserLimit(limit).catch(() => undefined);
    await refreshNotice(
      interaction,
      managed,
      `🔢 User limit set to ${limit === 0 ? "unlimited" : limit}.`,
    );
    return;
  }

  const pickId = stripPrefix(customId, TempVcPrefixes.pick);
  if (pickId) {
    const separator = pickId.indexOf(":");
    const action = separator >= 0 ? pickId.slice(0, separator) : "";
    const channelId = separator >= 0 ? pickId.slice(separator + 1) : "";
    if (action && channelId) {
      await handleMemberPick(interaction, services, action, channelId);
      return;
    }
  }

  const panelId = stripPrefix(customId, TempVcPrefixes.panel);
  if (panelId) {
    const managed = await loadManaged(interaction, services, panelId);
    if (!managed) return;
    if (!(await assertOwnerOrManage(interaction, managed))) return;
    const action = interaction.values?.[0];
    if (typeof action === "string") {
      await handlePanelAction(interaction, managed, action);
      return;
    }
  }

  await replyError(
    interaction,
    "Control Expired",
    "That control is no longer available. Run `/tempvc` for a fresh panel.",
  );
}

export async function handleTempVcInteraction(
  interaction: any,
  services: any,
): Promise<boolean> {
  const customId = interaction?.customId;
  if (typeof customId !== "string" || !customId.startsWith("tempvc:")) {
    return false;
  }
  if (!guildIdOf(interaction.guildId)) {
    await replyError(
      interaction,
      "Server Only",
      "Temporary voice controls only work inside a server.",
    );
    return true;
  }
  if (!isModuleEnabled(services, interaction.guildId)) {
    await replyError(
      interaction,
      "Module Disabled",
      "The tempvc module is disabled on this server.",
    );
    return true;
  }

  try {
    if (
      customId.startsWith(TempVcPrefixes.admin) ||
      customId.startsWith(TempVcPrefixes.cfg)
    ) {
      await handleAdminInteraction(interaction, services, customId);
      return true;
    }
    await handlePanelInteraction(interaction, services, customId);
    return true;
  } catch (error) {
    services.observability?.logger?.error?.("tempvc interaction failed", {
      error,
      customId,
    });
    await replyError(
      interaction,
      "Something Went Wrong",
      "That action could not be completed. Try again.",
    );
    return true;
  }
}
