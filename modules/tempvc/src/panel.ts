import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type GuildMember,
  type ModalActionRowComponentBuilder,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";
import { z } from "zod";
import {
  TempVcIds,
  TempVcPrefixes,
  adminPanelCard,
  configPanelCard,
  controlPanelCard,
  deleteConfirmCard,
  generatorManageCard,
  generatorRemoveCard,
  memberActionCard,
  type ControlPanelState,
  type MemberAction,
} from "./ui.js";

export const TempVcGeneratorSchema = z.object({
  channelId: z.string(),
  templateName: z.string().optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
});

export const TempVcConfigSchema = z.object({
  categoryId: z.string().nullable().optional(),
  templateName: z.string().default("➕ {user}'s Channel"),
  defaultBitrate: z.number().int().min(8000).max(384000).default(64000),
  defaultUserLimit: z.number().int().min(0).max(99).default(0),
  maxChannels: z.number().int().min(1).max(200).default(50),
  maxPerUser: z.number().int().min(1).max(10).default(1),
  emptyTimeoutMs: z.number().int().min(1000).default(300000),
  createCooldownMs: z.number().int().min(0).max(300000).default(10000),
  ownerLeaveDelete: z.boolean().default(true),
  generators: z.array(TempVcGeneratorSchema).default([]),
});

export type TempVcConfig = z.infer<typeof TempVcConfigSchema>;
export type TempVcGenerator = z.infer<typeof TempVcGeneratorSchema>;

interface TempVcRecord {
  guildId: string;
  channelId: string;
  ownerId: string;
  expiresAt?: Date | string | null;
}

interface ManagedChannel {
  record: TempVcRecord;
  channel: VoiceChannel;
}

const stripPrefix = (customId: string, prefix: string): string | null =>
  customId.startsWith(prefix) ? customId.slice(prefix.length) : null;

const isSnowflake = (value: unknown): value is string =>
  typeof value === "string" && /^\d{5,25}$/.test(value);

const isModuleEnabled = (services: any, guildId: string): boolean =>
  services?.modules?.isEnabled?.(guildId, services.__moduleName ?? "tempvc") ??
  true;

const prisma = (services: any): any => services?.db?.prisma;

const localCreateCooldowns = new Map<string, number>();

type CreateCooldown =
  | { acquired: true; key: string }
  | { acquired: false; waitMs: number };

async function acquireCreateCooldown(
  services: any,
  guildId: string,
  userId: string,
  cooldownMs: number,
): Promise<CreateCooldown> {
  if (cooldownMs <= 0) return { acquired: true, key: "" };
  const key = `lumi:tempvc:create:${guildId}:${userId}`;
  const now = Date.now();
  const localUntil = localCreateCooldowns.get(key) ?? 0;
  if (localUntil > now) {
    return { acquired: false, waitMs: localUntil - now };
  }
  if (localCreateCooldowns.size > 1000) {
    for (const [entry, until] of localCreateCooldowns) {
      if (until <= now) localCreateCooldowns.delete(entry);
    }
  }
  localCreateCooldowns.set(key, now + cooldownMs);
  const redis = services?.redis;
  if (!redis || typeof redis.set !== "function") {
    return { acquired: true, key };
  }
  try {
    const result = await redis.set(key, "1", "PX", cooldownMs, "NX");
    if (result !== "OK") {
      localCreateCooldowns.delete(key);
      let waitMs = cooldownMs;
      if (typeof redis.pttl === "function") {
        try {
          const ttl = await redis.pttl(key);
          if (typeof ttl === "number" && ttl > 0) waitMs = ttl;
        } catch {
          waitMs = cooldownMs;
        }
      }
      return { acquired: false, waitMs };
    }
    return { acquired: true, key };
  } catch {
    return { acquired: true, key };
  }
}

async function notifyCreateCooldown(
  member: GuildMember,
  waitMs: number,
): Promise<void> {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  await member.voice
    .disconnect("Temporary channel creation cooldown")
    .catch(() => undefined);
  await member
    .send(makeWarningCard("Slow Down", `Try again in ${seconds}s.`))
    .catch(() => undefined);
}

async function findTempChannel(
  services: any,
  channelId: string,
): Promise<TempVcRecord | null> {
  const model = prisma(services)?.tempVcChannel;
  if (!model) return null;
  try {
    if (typeof model.findUnique === "function") {
      return (await model.findUnique({ where: { channelId } })) ?? null;
    }
    if (typeof model.findFirst === "function") {
      return (await model.findFirst({ where: { channelId } })) ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function listOwnedTempChannels(
  services: any,
  guildId: string,
  ownerId: string,
): Promise<TempVcRecord[]> {
  const model = prisma(services)?.tempVcChannel;
  if (!model) return [];
  try {
    if (typeof model.findMany === "function") {
      const rows = await model.findMany({
        where: { guildId, ownerId },
        orderBy: { createdAt: "desc" },
      });
      return Array.isArray(rows) ? rows : [];
    }
    if (typeof model.findFirst === "function") {
      const row = await model.findFirst({ where: { guildId, ownerId } });
      return row ? [row] : [];
    }
  } catch {
    return [];
  }
  return [];
}

async function createTempRecord(
  services: any,
  data: {
    guildId: string;
    channelId: string;
    ownerId: string;
    expiresAt: Date;
  },
): Promise<boolean> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.create !== "function") return false;
  try {
    await model.create({ data });
    return true;
  } catch {
    return false;
  }
}

async function updateTempRecord(
  services: any,
  channelId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.update !== "function") return false;
  try {
    await model.update({ where: { channelId }, data });
    return true;
  } catch {
    return false;
  }
}

async function deleteTempRecord(
  services: any,
  channelId: string,
): Promise<void> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.delete !== "function") return;
  try {
    await model.delete({ where: { channelId } });
  } catch {
    return;
  }
}

async function countTempChannels(
  services: any,
  where: Record<string, unknown>,
): Promise<number | null> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.count !== "function") return null;
  try {
    const count = await model.count({ where });
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

async function listTempChannels(services: any): Promise<TempVcRecord[]> {
  const model = prisma(services)?.tempVcChannel;
  if (!model || typeof model.findMany !== "function") return [];
  try {
    const rows = await model.findMany({});
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getTempVcConfig(
  services: any,
  guildId: string,
): Promise<TempVcConfig> {
  let raw: unknown = {};
  try {
    raw = (await services?.config?.get?.(guildId, "tempvc")) ?? {};
  } catch {
    raw = {};
  }
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (!Array.isArray(source.generators)) source.generators = [];
  try {
    return TempVcConfigSchema.parse(source);
  } catch {
    return TempVcConfigSchema.parse({});
  }
}

async function saveTempVcConfig(
  services: any,
  guildId: string,
  config: TempVcConfig,
): Promise<boolean> {
  if (typeof services?.config?.set !== "function") return false;
  try {
    await services.config.set(guildId, "tempvc", config);
    return true;
  } catch {
    return false;
  }
}

export async function resolveGuildVoiceChannel(
  services: any,
  guildId: string,
  channelId: string,
): Promise<VoiceChannel | null> {
  const guild: Guild | undefined = services?.client?.guilds?.cache?.get(guildId);
  if (!guild) return null;
  const cached = guild.channels.cache.get(channelId);
  const channel = cached ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel as VoiceChannel;
}

function controlState(
  channel: VoiceChannel,
  record: TempVcRecord,
): ControlPanelState {
  const everyone = channel.guild.roles.everyone;
  const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
  return {
    channelId: channel.id,
    channelName: channel.name,
    ownerId: record.ownerId,
    userLimit: channel.userLimit ?? 0,
    memberCount: channel.members.size,
    locked: overwrite?.deny.has(PermissionFlagsBits.Connect) ?? false,
    hidden: overwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false,
    ownerPresent: channel.members.has(record.ownerId),
  };
}

export function buildControlPanel(
  channel: VoiceChannel,
  record: TempVcRecord,
  notice?: string,
): CardReply {
  return controlPanelCard(controlState(channel, record), notice);
}

export async function buildControlPanelForChannel(
  services: any,
  guildId: string,
  channelId: string,
): Promise<CardReply | null> {
  const record = await findTempChannel(services, channelId);
  if (!record || record.guildId !== guildId) return null;
  const channel = await resolveGuildVoiceChannel(services, guildId, channelId);
  if (!channel) return null;
  return buildControlPanel(channel, record);
}

async function replyError(
  interaction: any,
  title: string,
  body: string,
): Promise<void> {
  const card = ephemeralCard(makeErrorCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card).catch(() => undefined);
    return;
  }
  await interaction.reply(card).catch(() => undefined);
}

async function replySuccess(
  interaction: any,
  title: string,
  body: string,
): Promise<void> {
  const card = ephemeralCard(makeSuccessCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card).catch(() => undefined);
    return;
  }
  await interaction.reply(card).catch(() => undefined);
}

async function showCard(interaction: any, card: CardReply): Promise<void> {
  if (interaction.isModalSubmit?.() && !interaction.isFromMessage?.()) {
    await interaction.reply(card).catch(() => undefined);
    return;
  }
  try {
    await interaction.update(card);
  } catch {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(card).catch(() => undefined);
    } else {
      await interaction.reply(card).catch(() => undefined);
    }
  }
}

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

function nodeMatches(granted: string, required: string): boolean {
  if (!granted || !required) return false;
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*")) {
    const namespace = granted.slice(0, -2);
    return required === namespace || required.startsWith(`${namespace}.`);
  }
  return false;
}

export async function canUseTempVcAdmin(
  interaction: any,
  services: any,
): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  const member = interaction.member as GuildMember | null;
  const permissions = interaction.memberPermissions ?? member?.permissions;
  if (
    permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    permissions?.has?.(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }

  const repo = services?.db?.permits;
  if (!repo || typeof repo.getPermitChain !== "function") return false;

  const roleIds = member?.roles?.cache
    ? [...member.roles.cache.keys()]
    : Array.isArray((member as any)?.roles)
      ? ((member as any).roles as string[])
      : [];

  try {
    const chain = await repo.getPermitChain(
      interaction.guildId,
      interaction.user.id,
      [
        { targetType: "USER", targetId: interaction.user.id },
        ...(interaction.channelId
          ? [{ targetType: "CHANNEL", targetId: interaction.channelId }]
          : []),
        ...roleIds.map((roleId) => ({ targetType: "ROLE", targetId: roleId })),
      ],
    );
    if (chain?.isQuarantined) return false;
    for (const tier of chain?.tiers ?? []) {
      const deny: string[] = tier?.custom?.deny ?? [];
      if (deny.some((node) => nodeMatches(node, "tempvc.admin"))) return false;
      const grant: string[] = tier?.custom?.grant ?? [];
      if (grant.some((node) => nodeMatches(node, "tempvc.admin"))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function createTempVoiceChannel(
  services: any,
  guildId: string,
  member: GuildMember,
  config: TempVcConfig,
  generator?: TempVcGenerator,
): Promise<VoiceChannel | null> {
  const guild: Guild | undefined = services?.client?.guilds?.cache?.get(guildId);
  if (!guild || member.user.bot) return null;

  const ownedChannels = await listOwnedTempChannels(
    services,
    guildId,
    member.id,
  );
  for (const owned of ownedChannels) {
    const existing = await resolveGuildVoiceChannel(
      services,
      guildId,
      owned.channelId,
    );
    if (!existing) {
      await deleteTempRecord(services, owned.channelId);
      continue;
    }
    const moved = await member.voice
      .setChannel(existing)
      .then(() => true)
      .catch(() => false);
    await updateTempRecord(services, owned.channelId, {
      expiresAt: moved
        ? null
        : new Date(Date.now() + config.emptyTimeoutMs),
    });
    return moved ? existing : null;
  }

  const cooldown = await acquireCreateCooldown(
    services,
    guildId,
    member.id,
    config.createCooldownMs,
  );
  if (!cooldown.acquired) {
    await notifyCreateCooldown(member, cooldown.waitMs);
    return null;
  }
  const owned = await countTempChannels(services, {
    guildId,
    ownerId: member.id,
  });
  if (owned !== null && owned >= config.maxPerUser) return null;

  const total = await countTempChannels(services, { guildId });
  if (total !== null && total >= config.maxChannels) return null;

  const categoryId = config.categoryId ?? undefined;
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  const categoryParent =
    category?.type === ChannelType.GuildCategory ? category.id : undefined;
  const template = generator?.templateName ?? config.templateName;
  const name = template
    .replaceAll("{user}", member.displayName)
    .slice(0, 100);

  let channel: VoiceChannel;
  try {
    channel = (await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      ...(categoryParent ? { parent: categoryParent } : {}),
      bitrate: config.defaultBitrate,
      userLimit: generator?.userLimit ?? config.defaultUserLimit,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseVAD,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
          ],
        },
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.Stream,
            PermissionFlagsBits.UseVAD,
          ],
        },
      ],
    })) as VoiceChannel;
  } catch {
    return null;
  }

  const record: TempVcRecord = {
    guildId,
    channelId: channel.id,
    ownerId: member.id,
    expiresAt: new Date(Date.now() + config.emptyTimeoutMs),
  };

  const persisted = await createTempRecord(services, {
    guildId,
    channelId: channel.id,
    ownerId: member.id,
    expiresAt: record.expiresAt as Date,
  });
  if (!persisted) {
    await channel.delete().catch(() => undefined);
    return null;
  }

  const moved = await member.voice
    .setChannel(channel)
    .then(() => true)
    .catch(() => false);
  if (!moved) {
    await channel.delete().catch(() => undefined);
    await deleteTempRecord(services, channel.id);
    return null;
  }

  await channel.send(buildControlPanel(channel, record)).catch(() => undefined);
  return channel;
}

export async function deleteTempVoiceChannel(
  services: any,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const guild: Guild | undefined = services?.client?.guilds?.cache?.get(guildId);
  const channel =
    guild?.channels.cache.get(channelId) ??
    (await guild?.channels.fetch(channelId).catch(() => null));
  if (channel) {
    const deleted = await channel
      .delete()
      .then(() => true)
      .catch(() => false);
    if (!deleted) return false;
  }
  await deleteTempRecord(services, channelId);
  return true;
}

export async function sweepExpiredTempChannels(services: any): Promise<void> {
  const rows = await listTempChannels(services);
  if (rows.length === 0) return;
  const now = Date.now();
  for (const row of rows) {
    if (!row.expiresAt) continue;
    const expiresAt = new Date(row.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt > now) continue;
    const guild: Guild | undefined = services?.client?.guilds?.cache?.get(
      row.guildId,
    );
    const channel = guild?.channels.cache.get(row.channelId);
    if (
      channel &&
      channel.type === ChannelType.GuildVoice &&
      (channel as VoiceChannel).members.size > 0
    ) {
      continue;
    }
    await deleteTempVoiceChannel(services, row.guildId, row.channelId);
  }
}

export async function handleVoiceStateChange(
  oldState: VoiceState,
  newState: VoiceState,
  services: any,
): Promise<void> {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!guildId || !isModuleEnabled(services, guildId)) return;
  const config = await getTempVcConfig(services, guildId);

  if (
    oldState.channelId &&
    oldState.channelId !== newState.channelId
  ) {
    const record = await findTempChannel(services, oldState.channelId);
    if (record && record.guildId === guildId) {
      if (oldState.member?.id === record.ownerId && config.ownerLeaveDelete) {
        const deleted = await deleteTempVoiceChannel(
          services,
          guildId,
          oldState.channelId,
        );
        if (!deleted) {
          await updateTempRecord(services, oldState.channelId, {
            expiresAt: new Date(Date.now() + config.emptyTimeoutMs),
          });
        }
      } else {
        const channel = oldState.guild?.channels.cache.get(oldState.channelId);
        if (
          channel &&
          channel.type === ChannelType.GuildVoice &&
          (channel as VoiceChannel).members.size === 0
        ) {
          await updateTempRecord(services, oldState.channelId, {
            expiresAt: new Date(Date.now() + config.emptyTimeoutMs),
          });
        }
      }
    }
  }

  if (!newState.channelId || oldState.channelId === newState.channelId) return;

  const generator = config.generators.find(
    (item) => item.channelId === newState.channelId,
  );
  if (generator && newState.member) {
    await createTempVoiceChannel(
      services,
      guildId,
      newState.member,
      config,
      generator,
    );
    return;
  }

  const joined = await findTempChannel(services, newState.channelId);
  if (joined && joined.guildId === guildId) {
    await updateTempRecord(services, newState.channelId, { expiresAt: null });
  }
}

async function grantOwner(channel: VoiceChannel, userId: string): Promise<void> {
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

async function revokeOwner(channel: VoiceChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites
    .edit(userId, {
      ManageChannels: false,
      MoveMembers: false,
      MuteMembers: false,
      DeafenMembers: false,
    })
    .catch(() => undefined);
}

function refreshNotice(interaction: any, managed: ManagedChannel, notice: string) {
  return showCard(
    interaction,
    controlPanelCard(controlState(managed.channel, managed.record), notice),
  );
}

async function openRenameModal(
  interaction: any,
  channelId: string,
  current: string,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(TempVcIds.modalRename(channelId))
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
    .setCustomId(TempVcIds.modalLimit(channelId))
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

async function showAdminPanel(
  interaction: any,
  services: any,
  notice?: string,
): Promise<void> {
  const config = await getTempVcConfig(services, interaction.guildId);
  await showCard(
    interaction,
    adminPanelCard(interaction.guild ?? null, config, notice),
  );
}

async function showGeneratorPanel(
  interaction: any,
  services: any,
  generatorId: string,
  notice?: string,
): Promise<void> {
  const config = await getTempVcConfig(services, interaction.guildId);
  const generator = config.generators.find(
    (item) => item.channelId === generatorId,
  );
  if (!generator) {
    await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
    return;
  }
  await showCard(
    interaction,
    generatorManageCard(
      interaction.guild ?? null,
      generator,
      config,
      notice,
    ),
  );
}

const configFieldMeta: Record<
  string,
  {
    title: string;
    label: string;
    maxLength: number;
    min?: number;
    max?: number;
    integer?: boolean;
  }
> = {
  templateName: {
    title: "Name Template",
    label: "Channel name template ({user} = member)",
    maxLength: 100,
  },
  defaultUserLimit: {
    title: "Default User Limit",
    label: "User limit (0 = unlimited)",
    maxLength: 2,
    min: 0,
    max: 99,
    integer: true,
  },
  defaultBitrate: {
    title: "Default Bitrate",
    label: "Bitrate in bps (8000-384000)",
    maxLength: 6,
    min: 8000,
    max: 384000,
    integer: true,
  },
  maxChannels: {
    title: "Max Channels",
    label: "Guild-wide channel limit",
    maxLength: 3,
    min: 1,
    max: 200,
    integer: true,
  },
  maxPerUser: {
    title: "Max Per User",
    label: "Channels one member may own",
    maxLength: 2,
    min: 1,
    max: 10,
    integer: true,
  },
  emptyTimeoutMs: {
    title: "Empty Timeout",
    label: "Milliseconds before empty deletion",
    maxLength: 9,
    min: 1000,
    max: 604800000,
    integer: true,
  },
};

async function openConfigModal(
  interaction: any,
  key: string,
  config: TempVcConfig,
): Promise<void> {
  const meta = configFieldMeta[key];
  if (!meta) {
    await replyError(interaction, "Unknown Setting", "That setting cannot be edited.");
    return;
  }
  const current = (config as Record<string, unknown>)[key];
  const modal = new ModalBuilder()
    .setCustomId(TempVcIds.cfgModal(key))
    .setTitle(meta.title)
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(meta.label)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(meta.maxLength)
          .setRequired(true)
          .setValue(String(current ?? "").slice(0, meta.maxLength)),
      ),
    );
  await interaction.showModal(modal).catch(() => undefined);
}

async function handlePanelAction(
  interaction: any,
  managed: ManagedChannel,
  action: string,
): Promise<void> {
  const { channel, record } = managed;
  const state = controlState(channel, record);

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
      await showCard(interaction, memberActionCard(action, state));
      return;
    case "delete":
      await showCard(interaction, deleteConfirmCard(state));
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
    await target.voice.disconnect("Removed by the temporary channel owner").catch(() => undefined);
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
    if (target) await target.voice.disconnect("Blocked from the temporary channel").catch(() => undefined);
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
    await showCard(
      interaction,
      controlPanelCard(controlState(managed.channel, managed.record)),
    );
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
    await refreshNotice(interaction, managed, `✏️ Renamed to **${value.slice(0, 100)}**.`);
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

async function handleAdminInteraction(
  interaction: any,
  services: any,
  customId: string,
): Promise<void> {
  if (!(await canUseTempVcAdmin(interaction, services))) {
    await replyError(
      interaction,
      "Staff Only",
      "You need the **tempvc.admin** permit or **Manage Server** to use generator management.",
    );
    return;
  }

  if (customId === TempVcIds.adminAdd) {
    const channelId = interaction.values?.[0];
    if (!isSnowflake(channelId)) {
      await replyError(interaction, "Invalid Channel", "Choose a voice channel.");
      return;
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    if (config.generators.some((item) => item.channelId === channelId)) {
      await showAdminPanel(
        interaction,
        services,
        "That channel is already a generator.",
      );
      return;
    }
    const next: TempVcConfig = {
      ...config,
      generators: [
        ...config.generators,
        {
          channelId,
          templateName: config.templateName,
          userLimit: config.defaultUserLimit,
        },
      ],
    };
    const saved = await saveTempVcConfig(services, interaction.guildId, next);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the generator.");
      return;
    }
    await showAdminPanel(interaction, services, `✅ Added <#${channelId}> as a generator.`);
    return;
  }

  if (customId === TempVcIds.adminPick) {
    const generatorId = interaction.values?.[0];
    if (!isSnowflake(generatorId)) {
      await replyError(interaction, "Invalid Generator", "Choose a generator.");
      return;
    }
    await showGeneratorPanel(interaction, services, generatorId);
    return;
  }

  if (customId === TempVcIds.adminBack) {
    await showAdminPanel(interaction, services);
    return;
  }

  if (customId === TempVcIds.adminConfig) {
    const config = await getTempVcConfig(services, interaction.guildId);
    await showCard(interaction, configPanelCard(config));
    return;
  }

  const adminRename = stripPrefix(customId, TempVcPrefixes.adminModalRename);
  if (adminRename) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const generator = config.generators.find(
      (item) => item.channelId === adminRename,
    );
    if (!generator) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    const value = String(
      interaction.fields.getTextInputValue("value") ?? "",
    ).trim();
    if (value.length === 0) {
      await replyError(interaction, "Invalid Template", "The template cannot be empty.");
      return;
    }
    generator.templateName = value.slice(0, 100);
    const saved = await saveTempVcConfig(services, interaction.guildId, config);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the template.");
      return;
    }
    await showGeneratorPanel(
      interaction,
      services,
      adminRename,
      "✏️ Template updated.",
    );
    return;
  }

  const adminLimit = stripPrefix(customId, TempVcPrefixes.adminModalLimit);
  if (adminLimit) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const generator = config.generators.find(
      (item) => item.channelId === adminLimit,
    );
    if (!generator) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    const raw = String(interaction.fields.getTextInputValue("value") ?? "").trim();
    const limit = Number.parseInt(raw, 10);
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await replyError(interaction, "Invalid Limit", "Enter a number from 0 to 99.");
      return;
    }
    generator.userLimit = limit;
    const saved = await saveTempVcConfig(services, interaction.guildId, config);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the limit.");
      return;
    }
    await showGeneratorPanel(
      interaction,
      services,
      adminLimit,
      `🔢 Limit set to ${limit === 0 ? "unlimited" : limit}.`,
    );
    return;
  }

  const adminRemoveConfirm = stripPrefix(
    customId,
    TempVcPrefixes.adminRemoveConfirm,
  );
  if (adminRemoveConfirm) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const next: TempVcConfig = {
      ...config,
      generators: config.generators.filter(
        (item) => item.channelId !== adminRemoveConfirm,
      ),
    };
    if (next.generators.length === config.generators.length) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    const saved = await saveTempVcConfig(services, interaction.guildId, next);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not remove the generator.");
      return;
    }
    await showAdminPanel(
      interaction,
      services,
      `🗑️ Removed <#${adminRemoveConfirm}> as a generator.`,
    );
    return;
  }

  const adminRemoveCancel = stripPrefix(
    customId,
    TempVcPrefixes.adminRemoveCancel,
  );
  if (adminRemoveCancel) {
    await showGeneratorPanel(interaction, services, adminRemoveCancel);
    return;
  }

  const adminRemove = stripPrefix(customId, TempVcPrefixes.adminRemove);
  if (adminRemove) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const generator = config.generators.find(
      (item) => item.channelId === adminRemove,
    );
    if (!generator) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    await showCard(
      interaction,
      generatorRemoveCard(interaction.guild ?? null, generator),
    );
    return;
  }

  const adminRenameButton = stripPrefix(
    customId,
    TempVcPrefixes.adminRename,
  );
  if (adminRenameButton) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const generator = config.generators.find(
      (item) => item.channelId === adminRenameButton,
    );
    if (!generator) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(TempVcIds.adminModalRename(generator.channelId))
      .setTitle("Rename Generator Template")
      .addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel("Channel name template ({user} = member)")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
            .setValue(
              (generator.templateName ?? config.templateName).slice(0, 100),
            ),
        ),
      );
    await interaction.showModal(modal).catch(() => undefined);
    return;
  }

  const adminLimitButton = stripPrefix(
    customId,
    TempVcPrefixes.adminLimit,
  );
  if (adminLimitButton) {
    const config = await getTempVcConfig(services, interaction.guildId);
    const generator = config.generators.find(
      (item) => item.channelId === adminLimitButton,
    );
    if (!generator) {
      await replyError(interaction, "Generator Missing", "That generator is no longer configured.");
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(TempVcIds.adminModalLimit(generator.channelId))
      .setTitle("Set Generator User Limit")
      .addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel("User limit (0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(2)
            .setRequired(true)
            .setValue(
              String(generator.userLimit ?? config.defaultUserLimit),
            ),
        ),
      );
    await interaction.showModal(modal).catch(() => undefined);
    return;
  }

  if (customId === TempVcIds.cfgCategory) {
    const channelId = interaction.values?.[0];
    if (!isSnowflake(channelId)) {
      await replyError(interaction, "Invalid Category", "Choose a category.");
      return;
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    const saved = await saveTempVcConfig(services, interaction.guildId, {
      ...config,
      categoryId: channelId,
    });
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the category.");
      return;
    }
    await showCard(
      interaction,
      configPanelCard(
        { ...config, categoryId: channelId },
        `✅ Category set to <#${channelId}>.`,
      ),
    );
    return;
  }

  if (customId === TempVcIds.cfgEdit) {
    const key = interaction.values?.[0];
    if (typeof key !== "string") {
      await replyError(interaction, "Invalid Setting", "Choose a setting.");
      return;
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    if (key === "ownerLeaveDelete") {
      const saved = await saveTempVcConfig(services, interaction.guildId, {
        ...config,
        ownerLeaveDelete: !config.ownerLeaveDelete,
      });
      if (!saved) {
        await replyError(interaction, "Save Failed", "Could not save the setting.");
        return;
      }
      await showCard(
        interaction,
        configPanelCard(
          { ...config, ownerLeaveDelete: !config.ownerLeaveDelete },
          `🚪 Delete on owner leave ${config.ownerLeaveDelete ? "disabled" : "enabled"}.`,
        ),
      );
      return;
    }
    await openConfigModal(interaction, key, config);
    return;
  }

  const cfgModal = stripPrefix(customId, TempVcPrefixes.cfgModal);
  if (cfgModal) {
    const meta = configFieldMeta[cfgModal];
    if (!meta) {
      await replyError(interaction, "Unknown Setting", "That setting cannot be edited.");
      return;
    }
    const raw = String(interaction.fields.getTextInputValue("value") ?? "").trim();
    let value: string | number;
    if (meta.integer) {
      const parsed = Number.parseInt(raw, 10);
      const min = meta.min ?? Number.MIN_SAFE_INTEGER;
      const max = meta.max ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        await replyError(
          interaction,
          "Invalid Value",
          `Enter a whole number from ${min} to ${max}.`,
        );
        return;
      }
      value = parsed;
    } else {
      if (raw.length === 0) {
        await replyError(interaction, "Invalid Value", "Enter a value.");
        return;
      }
      value = raw.slice(0, meta.maxLength);
    }
    const config = await getTempVcConfig(services, interaction.guildId);
    const next = TempVcConfigSchema.parse({
      ...config,
      [cfgModal]: value,
    });
    const saved = await saveTempVcConfig(services, interaction.guildId, next);
    if (!saved) {
      await replyError(interaction, "Save Failed", "Could not save the setting.");
      return;
    }
    await showCard(
      interaction,
      configPanelCard(next, `✅ **${meta.title}** updated.`),
    );
    return;
  }

  await showAdminPanel(interaction, services);
}

export async function handleTempVcInteraction(
  interaction: any,
  services: any,
): Promise<boolean> {
  const customId = interaction?.customId;
  if (typeof customId !== "string" || !customId.startsWith("tempvc:")) {
    return false;
  }
  if (!interaction.guildId) {
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
    console.error("[tempvc] interaction failed:", error);
    await replyError(
      interaction,
      "Something Went Wrong",
      "That action could not be completed. Try again.",
    );
    return true;
  }
}
