import { isSnowflake } from "@lumi/foundation";
import type { ModuleServices } from "@lumi/module-kit";
import {
  type CardReply,
  createActionButton,
  createChannelSelectMenu,
  createStringSelectMenu,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  type Guild,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { BotServices } from "../../../src/core/contracts.js";
import {
  backButton,
  cut,
  type HubInteraction,
  type MessageModalSubmit,
  type ModuleActionParams,
  type PanelInteraction,
  panelOptions,
  showPanel,
} from "../../../src/admin/panel/common.js";
import {
  readModuleConfig,
  writeModuleConfig,
} from "../../../src/admin/panel/moduleSettings.js";
import { canUseTempVcAdmin } from "./access.js";
import { getTempVcConfig, saveTempVcConfig, TempVcModuleName } from "./config.js";
import { stripPrefix, TempVcIds, TempVcPrefixes } from "./ids.js";
import { showTextModal } from "./modals.js";
import {
  type TempVcConfig,
  TempVcConfigSchema,
  type TempVcGenerator,
} from "./panel.js";
import { replyError, showCard } from "./reply.js";
import type { TempVcInteraction } from "./types.js";
import {
  adminPanelCard,
  configPanelCard,
  generatorManageCard,
  generatorRemoveCard,
} from "./ui-admin.js";

export { TempVcModuleName } from "./config.js";
export type { TempVcGenerator } from "./panel.js";

async function showAdminPanel(
  interaction: TempVcInteraction,
  services: ModuleServices,
  notice?: string,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const config = await getTempVcConfig(services, guildId);
  await showCard(
    interaction,
    adminPanelCard(interaction.guild ?? null, config, notice),
  );
}

async function loadGenerator(
  interaction: TempVcInteraction,
  services: ModuleServices,
  generatorId: string,
): Promise<{ config: TempVcConfig; generator: TempVcGenerator } | null> {
  const guildId = interaction.guildId;
  if (!guildId) return null;
  const config = await getTempVcConfig(services, guildId);
  const generator = config.generators.find(
    (item) => item.channelId === generatorId,
  );
  if (!generator) {
    await replyError(
      interaction,
      "Generator Missing",
      "That generator is no longer configured.",
    );
    return null;
  }
  return { config, generator };
}

async function showGeneratorPanel(
  interaction: TempVcInteraction,
  services: ModuleServices,
  generatorId: string,
  notice?: string,
): Promise<void> {
  const loaded = await loadGenerator(interaction, services, generatorId);
  if (!loaded) return;
  await showCard(
    interaction,
    generatorManageCard(
      interaction.guild ?? null,
      loaded.generator,
      loaded.config,
      notice,
    ),
  );
}

async function saveConfigOrReply(
  interaction: TempVcInteraction,
  services: ModuleServices,
  guildId: string,
  config: TempVcConfig,
  failure: string,
): Promise<boolean> {
  const saved = await saveTempVcConfig(services, guildId, config);
  if (!saved) await replyError(interaction, "Save Failed", failure);
  return saved;
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
  interaction: MessageComponentInteraction,
  key: string,
  config: TempVcConfig,
): Promise<void> {
  const meta = configFieldMeta[key];
  if (!meta) {
    await replyError(
      interaction,
      "Unknown Setting",
      "That setting cannot be edited.",
    );
    return;
  }
  const current = (config as Record<string, unknown>)[key];
  await showTextModal(interaction, {
    customId: TempVcIds.cfgModal(key),
    title: meta.title,
    label: meta.label,
    maxLength: meta.maxLength,
    value: String(current ?? ""),
  });
}

async function generatorModal(
  interaction: MessageComponentInteraction,
  config: TempVcConfig,
  generatorId: string,
  kind: "rename" | "limit",
): Promise<void> {
  const generator = config.generators.find(
    (item) => item.channelId === generatorId,
  );
  if (!generator) {
    await replyError(
      interaction,
      "Generator Missing",
      "That generator is no longer configured.",
    );
    return;
  }
  const rename = kind === "rename";
  await showTextModal(interaction, {
    customId: rename
      ? TempVcIds.adminModalRename(generator.channelId)
      : TempVcIds.adminModalLimit(generator.channelId),
    title: rename ? "Rename Generator Template" : "Set Generator User Limit",
    label: rename
      ? "Channel name template ({user} = member)"
      : "User limit (0 = unlimited)",
    maxLength: rename ? 100 : 2,
    value: rename
      ? (generator.templateName ?? config.templateName)
      : String(generator.userLimit ?? config.defaultUserLimit),
  });
}

export async function handleAdminInteraction(
  interaction: TempVcInteraction,
  services: ModuleServices,
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

  const guildId = interaction.guildId;
  if (!guildId) return;

  if (customId === TempVcIds.adminAdd) {
    const channelId = interaction.values?.[0];
    if (!isSnowflake(channelId)) {
      await replyError(
        interaction,
        "Invalid Channel",
        "Choose a voice channel.",
      );
      return;
    }
    const config = await getTempVcConfig(services, guildId);
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
    if (
      !(await saveConfigOrReply(
        interaction,
        services,
        guildId,
        next,
        "Could not save the generator.",
      ))
    ) {
      return;
    }
    await showAdminPanel(
      interaction,
      services,
      `✅ Added <#${channelId}> as a generator.`,
    );
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
    const config = await getTempVcConfig(services, guildId);
    await showCard(interaction, configPanelCard(config));
    return;
  }

  const adminRename = stripPrefix(customId, TempVcPrefixes.adminModalRename);
  if (adminRename) {
    const loaded = await loadGenerator(interaction, services, adminRename);
    if (!loaded) return;
    const { config, generator } = loaded;
    const value = String(
      interaction.fields?.getTextInputValue("value") ?? "",
    ).trim();
    if (value.length === 0) {
      await replyError(
        interaction,
        "Invalid Template",
        "The template cannot be empty.",
      );
      return;
    }
    generator.templateName = value.slice(0, 100);
    if (
      !(await saveConfigOrReply(
        interaction,
        services,
        guildId,
        config,
        "Could not save the template.",
      ))
    ) {
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
    const loaded = await loadGenerator(interaction, services, adminLimit);
    if (!loaded) return;
    const { config, generator } = loaded;
    const raw = String(
      interaction.fields?.getTextInputValue("value") ?? "",
    ).trim();
    const limit = Number.parseInt(raw, 10);
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await replyError(
        interaction,
        "Invalid Limit",
        "Enter a number from 0 to 99.",
      );
      return;
    }
    generator.userLimit = limit;
    if (
      !(await saveConfigOrReply(
        interaction,
        services,
        guildId,
        config,
        "Could not save the limit.",
      ))
    ) {
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
    const config = await getTempVcConfig(services, guildId);
    const next: TempVcConfig = {
      ...config,
      generators: config.generators.filter(
        (item) => item.channelId !== adminRemoveConfirm,
      ),
    };
    if (next.generators.length === config.generators.length) {
      await replyError(
        interaction,
        "Generator Missing",
        "That generator is no longer configured.",
      );
      return;
    }
    if (
      !(await saveConfigOrReply(
        interaction,
        services,
        guildId,
        next,
        "Could not remove the generator.",
      ))
    ) {
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
    const loaded = await loadGenerator(interaction, services, adminRemove);
    if (!loaded) return;
    await showCard(
      interaction,
      generatorRemoveCard(interaction.guild ?? null, loaded.generator),
    );
    return;
  }

  const adminRenameButton = stripPrefix(customId, TempVcPrefixes.adminRename);
  if (adminRenameButton) {
    if (!interaction.isMessageComponent()) return;
    const config = await getTempVcConfig(services, guildId);
    await generatorModal(interaction, config, adminRenameButton, "rename");
    return;
  }

  const adminLimitButton = stripPrefix(customId, TempVcPrefixes.adminLimit);
  if (adminLimitButton) {
    if (!interaction.isMessageComponent()) return;
    const config = await getTempVcConfig(services, guildId);
    await generatorModal(interaction, config, adminLimitButton, "limit");
    return;
  }

  if (customId === TempVcIds.cfgCategory) {
    const channelId = interaction.values?.[0];
    if (!isSnowflake(channelId)) {
      await replyError(interaction, "Invalid Category", "Choose a category.");
      return;
    }
    const config = await getTempVcConfig(services, guildId);
    const next = { ...config, categoryId: channelId };
    if (
      !(await saveConfigOrReply(
        interaction,
        services,
        guildId,
        next,
        "Could not save the category.",
      ))
    ) {
      return;
    }
    await showCard(
      interaction,
      configPanelCard(next, `✅ Category set to <#${channelId}>.`),
    );
    return;
  }

  if (customId === TempVcIds.cfgEdit) {
    const key = interaction.values?.[0];
    if (typeof key !== "string") {
      await replyError(interaction, "Invalid Setting", "Choose a setting.");
      return;
    }
    const config = await getTempVcConfig(services, guildId);
    if (key === "ownerLeaveDelete") {
      const next = { ...config, ownerLeaveDelete: !config.ownerLeaveDelete };
      if (
        !(await saveConfigOrReply(
          interaction,
          services,
          guildId,
          next,
          "Could not save the setting.",
        ))
      ) {
        return;
      }
      await showCard(
        interaction,
        configPanelCard(
          next,
          `🚪 Delete on owner leave ${config.ownerLeaveDelete ? "disabled" : "enabled"}.`,
        ),
      );
      return;
    }
    if (!interaction.isMessageComponent()) return;
    await openConfigModal(interaction, key, config);
    return;
  }

  const cfgModal = stripPrefix(customId, TempVcPrefixes.cfgModal);
  if (cfgModal) {
    const meta = configFieldMeta[cfgModal];
    if (!meta) {
      await replyError(
        interaction,
        "Unknown Setting",
        "That setting cannot be edited.",
      );
      return;
    }
    const raw = String(
      interaction.fields?.getTextInputValue("value") ?? "",
    ).trim();
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
    const config = await getTempVcConfig(services, guildId);
    const next = TempVcConfigSchema.parse({
      ...config,
      [cfgModal]: value,
    });
    if (
      !(await saveConfigOrReply(
        interaction,
        services,
        guildId,
        next,
        "Could not save the setting.",
      ))
    ) {
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

// --- Hub Admin Panel Management ---

const MaxOptions = 25;
const MaxListed = 20;
const SnowflakePattern = /^\d{15,22}$/;

type ModuleConfig = Record<string, unknown>;

function pageNumber(raw: string | undefined): number {
  return Number(raw) || 0;
}

function configObject(value: unknown): ModuleConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : {};
}

export function parseTempVcGenerators(value: unknown): TempVcGenerator[] {
  if (!Array.isArray(value)) return [];
  const generators: TempVcGenerator[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    if (!("channelId" in entry) || typeof entry.channelId !== "string") {
      continue;
    }
    if (!SnowflakePattern.test(entry.channelId)) continue;
    const generator: TempVcGenerator = { channelId: entry.channelId };
    if (
      "templateName" in entry &&
      typeof entry.templateName === "string" &&
      entry.templateName.trim().length > 0
    ) {
      generator.templateName = entry.templateName.trim().slice(0, 100);
    }
    if (
      "userLimit" in entry &&
      typeof entry.userLimit === "number" &&
      Number.isInteger(entry.userLimit) &&
      entry.userLimit >= 0 &&
      entry.userLimit <= 99
    ) {
      generator.userLimit = entry.userLimit;
    }
    generators.push(generator);
  }
  return generators;
}

function moduleField(
  services: BotServices,
  key: string,
): { default?: unknown } | undefined {
  return services.moduleLoader
    .getModule(TempVcModuleName)
    ?.manifest.configFields?.find((field) => field.key === key);
}

function stringDefault(
  services: BotServices,
  config: ModuleConfig,
  key: string,
  fallback: string,
): string {
  const stored = config[key];
  if (typeof stored === "string" && stored.trim().length > 0) return stored;
  const declared = moduleField(services, key)?.default;
  return typeof declared === "string" && declared.length > 0
    ? declared
    : fallback;
}

function numberDefault(
  services: BotServices,
  config: ModuleConfig,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const stored = config[key];
  if (
    typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= min &&
    stored <= max
  ) {
    return stored;
  }
  const declared = moduleField(services, key)?.default;
  return typeof declared === "number" &&
    Number.isInteger(declared) &&
    declared >= min &&
    declared <= max
    ? declared
    : fallback;
}

function serverTemplate(services: BotServices, config: ModuleConfig): string {
  return stringDefault(services, config, "templateName", "➕ {user}'s Channel");
}

function serverUserLimit(services: BotServices, config: ModuleConfig): number {
  return numberDefault(services, config, "defaultUserLimit", 0, 0, 99);
}

function generatorTemplate(
  services: BotServices,
  config: ModuleConfig,
  generator: TempVcGenerator,
): string {
  return generator.templateName ?? serverTemplate(services, config);
}

function generatorLimit(
  services: BotServices,
  config: ModuleConfig,
  generator: TempVcGenerator,
): number {
  return generator.userLimit ?? serverUserLimit(services, config);
}

function limitLabel(limit: number): string {
  return limit === 0 ? "Unlimited" : String(limit);
}

async function channelName(
  guild: Guild | null,
  channelId: string,
): Promise<string | null> {
  if (!guild) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached.name;
  try {
    const channel = await guild.channels.fetch(channelId);
    return channel?.name ?? null;
  } catch {
    return null;
  }
}

async function channelNames(
  guild: Guild | null,
  generators: readonly TempVcGenerator[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    generators.map(async (generator) => {
      const name = await channelName(guild, generator.channelId);
      return [generator.channelId, name] as const;
    }),
  );
  const names = new Map<string, string>();
  for (const [channelId, name] of entries) {
    if (name) names.set(channelId, name);
  }
  return names;
}

function moduleTitle(services: BotServices): string {
  const manifest = services.moduleLoader.getModule(TempVcModuleName)?.manifest;
  return `${manifest?.emoji ?? "🔊"} ${manifest?.displayName ?? "Temporary Voice"}`;
}

export async function renderTempVcGenerators(
  interaction: HubInteraction,
  services: BotServices,
  pageIndex: number,
  notice?: string,
): Promise<CardReply> {
  const config = configObject(
    await readModuleConfig(services, interaction.guildId!, TempVcModuleName),
  );
  const generators = parseTempVcGenerators(config.generators);
  const names = await channelNames(interaction.guild ?? null, generators);
  const lines: string[] = [];
  if (generators.length === 0) {
    lines.push("No generator channels configured yet.");
  } else {
    for (const generator of generators.slice(0, MaxListed)) {
      const name = names.get(generator.channelId);
      lines.push(
        `**${name ? `#${name}` : `<#${generator.channelId}>`}**`,
        `-# Template ${cut(generatorTemplate(services, config, generator), 80)} · Limit ${limitLabel(generatorLimit(services, config, generator))}`,
      );
    }
    if (generators.length > MaxListed) {
      lines.push(`-# +${generators.length - MaxListed} more generator(s)`);
    }
  }

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createChannelSelectMenu({
        customId: `lumi:tempvcadd:${pageIndex}`,
        placeholder: "Add a generator voice channel…",
        channelTypes: [ChannelType.GuildVoice],
        minValues: 1,
        maxValues: 1,
      }),
    ),
  ];
  if (generators.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:tempvcpick:${pageIndex}`,
          placeholder: "Manage a generator…",
          options: generators.slice(0, MaxOptions).map((generator) => ({
            label: cut(
              names.get(generator.channelId) ?? `#${generator.channelId}`,
              100,
            ),
            value: generator.channelId,
          })),
        }),
      ),
    );
  }
  rows.push(row(backButton(`lumi:modopen:${TempVcModuleName}:${pageIndex}`)));

  return makeCard(
    undefined,
    `${moduleTitle(services)} · Generators`,
    [
      ...(notice ? [`**${notice}**`] : []),
      ...lines,
      "-# Members who join a generator get their own temporary channel.",
    ],
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", "Temporary Voice", "Generators"],
      rows,
      undefined,
      false,
    ),
  );
}

export async function renderTempVcGenerator(
  interaction: HubInteraction,
  services: BotServices,
  generatorId: string,
  pageIndex: number,
  notice?: string,
): Promise<CardReply> {
  const config = configObject(
    await readModuleConfig(services, interaction.guildId!, TempVcModuleName),
  );
  const generators = parseTempVcGenerators(config.generators);
  const generator = generators.find((item) => item.channelId === generatorId);
  if (!generator) {
    return makeErrorCard(
      "Generator Missing",
      "That generator is no longer configured.",
      panelOptions(
        interaction,
        "modules",
        ["Hub", "Modules", "Temporary Voice", "Generators"],
        [row(backButton(`lumi:tempvcgens:${pageIndex}`))],
        undefined,
        false,
      ),
    );
  }
  const name = await channelName(interaction.guild ?? null, generatorId);
  const template = generatorTemplate(services, config, generator);
  const limit = generatorLimit(services, config, generator);

  return makeCard(
    undefined,
    `${moduleTitle(services)} · Generator`,
    [
      ...(notice ? [`**${notice}**`] : []),
      `**Channel**\n${name ? `#${name}` : `<#${generatorId}>`}`,
      `**Name template**\n\`${cut(template, 100)}\``,
      `**User limit**\n${limitLabel(limit)}`,
      "-# Settings applied to channels created from this generator.",
    ],
    panelOptions(
      interaction,
      "modules",
      [
        "Hub",
        "Modules",
        "Temporary Voice",
        "Generators",
        name ? `#${name}` : generatorId,
      ],
      [
        row(
          createActionButton({
            customId: `lumi:tempvcgenrename:${generatorId}:${pageIndex}`,
            label: "Rename",
            emoji: "✏️",
            style: ButtonStyle.Secondary,
          }),
          createActionButton({
            customId: `lumi:tempvcgenlimit:${generatorId}:${pageIndex}`,
            label: "Set Limit",
            emoji: "🔢",
            style: ButtonStyle.Secondary,
          }),
          createActionButton({
            customId: `lumi:tempvcgenremove:${generatorId}:${pageIndex}`,
            label: "Remove",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
        ),
        row(backButton(`lumi:tempvcgens:${pageIndex}`)),
      ],
      undefined,
      false,
    ),
  );
}

export async function renderTempVcRemove(
  interaction: HubInteraction,
  generatorId: string,
  pageIndex: number,
): Promise<CardReply> {
  const name = await channelName(interaction.guild ?? null, generatorId);
  return makeWarningCard(
    "Remove Generator",
    [
      `Remove ${name ? `**#${name}**` : `<#${generatorId}>`} from temporary voice generators?`,
      "Existing temporary channels are not deleted.",
    ],
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", "Temporary Voice", "Generators", "Remove"],
      [
        row(
          createActionButton({
            customId: `lumi:tempvcgenremoveconfirm:${generatorId}:${pageIndex}`,
            label: "Remove Generator",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
          backButton(`lumi:tempvcgen:${generatorId}:${pageIndex}`, "Cancel"),
        ),
      ],
      undefined,
      false,
    ),
  );
}

export function tempVcGeneratorModal(
  kind: "rename" | "limit",
  services: BotServices,
  config: ModuleConfig,
  generator: TempVcGenerator,
  pageIndex: number,
): ModalBuilder {
  const rename = kind === "rename";
  return new ModalBuilder()
    .setCustomId(
      `lumi:${rename ? "tempvcgenrename" : "tempvcgenlimit"}:${generator.channelId}:${pageIndex}`,
    )
    .setTitle(rename ? "Rename generator template" : "Set generator limit")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(
            rename
              ? "Channel name template ({user} = member)"
              : "User limit (0 = unlimited)",
          )
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(rename ? 100 : 2)
          .setValue(
            rename
              ? generatorTemplate(services, config, generator)
              : String(generatorLimit(services, config, generator)),
          ),
      ),
    );
}

function isMessageModal(
  interaction: ModalSubmitInteraction,
): interaction is MessageModalSubmit {
  return interaction.isFromMessage();
}

async function replyModalError(
  interaction: ModalSubmitInteraction,
  message: string,
): Promise<void> {
  await interaction.reply(
    ephemeralCard(makeErrorCard("Invalid Generator", message)),
  );
}

export async function handleTempVcGeneratorModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
  guildId: string,
  action: string,
  generatorId: string,
  pageIndex: number,
): Promise<void> {
  const config = configObject(
    await readModuleConfig(services, guildId, TempVcModuleName),
  );
  const generators = parseTempVcGenerators(config.generators);
  const generator = generators.find((item) => item.channelId === generatorId);
  if (!generator) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Generator Missing",
          "That generator is no longer configured.",
        ),
      ),
    );
    return;
  }

  const raw = interaction.fields.getTextInputValue("value").trim();
  if (action === "tempvcgenrename") {
    if (raw.length === 0) {
      await replyModalError(interaction, "The template cannot be empty.");
      return;
    }
    generator.templateName = raw.slice(0, 100);
  } else {
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await replyModalError(interaction, "Enter a whole number from 0 to 99.");
      return;
    }
    generator.userLimit = limit;
  }

  config.generators = generators;
  await writeModuleConfig(services, guildId, TempVcModuleName, config);
  const card = await renderTempVcGenerator(
    interaction,
    services,
    generatorId,
    pageIndex,
    action === "tempvcgenrename" ? "✏️ Template updated." : "🔢 Limit updated.",
  );
  if (isMessageModal(interaction)) {
    await interaction.update(card);
  } else {
    await interaction.reply(ephemeralCard(card));
  }
}

export async function handleTempVcModuleAction(
  interaction: PanelInteraction,
  services: BotServices,
  params: ModuleActionParams,
): Promise<boolean> {
  const { guildId, action, target, extra } = params;
  if (!action.startsWith("tempvc")) return false;

  switch (action) {
    case "tempvcgens": {
      await showPanel(interaction, () =>
        renderTempVcGenerators(interaction, services, pageNumber(target)),
      );
      return true;
    }
    case "tempvcadd": {
      if (!interaction.isChannelSelectMenu()) return true;
      const channelId = interaction.values[0];
      if (!channelId || !SnowflakePattern.test(channelId)) return true;
      const config = configObject(
        await readModuleConfig(services, guildId, TempVcModuleName),
      );
      const generators = parseTempVcGenerators(config.generators);
      if (generators.some((item) => item.channelId === channelId)) {
        await showPanel(interaction, () =>
          renderTempVcGenerators(
            interaction,
            services,
            pageNumber(target),
            "That channel is already a generator.",
          ),
        );
        return true;
      }
      config.generators = [...generators, { channelId }];
      await writeModuleConfig(services, guildId, TempVcModuleName, config);
      await showPanel(interaction, () =>
        renderTempVcGenerators(
          interaction,
          services,
          pageNumber(target),
          `✅ Added <#${channelId}> as a generator.`,
        ),
      );
      return true;
    }
    case "tempvcpick": {
      if (!interaction.isStringSelectMenu()) return true;
      const generatorId = interaction.values[0];
      if (!generatorId) return true;
      await showPanel(interaction, () =>
        renderTempVcGenerator(
          interaction,
          services,
          generatorId,
          pageNumber(target),
        ),
      );
      return true;
    }
    case "tempvcgen": {
      if (!SnowflakePattern.test(target)) return true;
      await showPanel(interaction, () =>
        renderTempVcGenerator(interaction, services, target, pageNumber(extra)),
      );
      return true;
    }
    case "tempvcgenback": {
      await showPanel(interaction, () =>
        renderTempVcGenerators(interaction, services, pageNumber(target)),
      );
      return true;
    }
    case "tempvcgenrename":
    case "tempvcgenlimit": {
      if (!interaction.isButton()) return true;
      if (!SnowflakePattern.test(target)) return true;
      const config = configObject(
        await readModuleConfig(services, guildId, TempVcModuleName),
      );
      const generators = parseTempVcGenerators(config.generators);
      const generator = generators.find((item) => item.channelId === target);
      if (!generator) {
        await showPanel(interaction, () =>
          renderTempVcGenerators(
            interaction,
            services,
            pageNumber(extra),
            "That generator is no longer configured.",
          ),
        );
        return true;
      }
      await interaction.showModal(
        tempVcGeneratorModal(
          action === "tempvcgenrename" ? "rename" : "limit",
          services,
          config,
          generator,
          pageNumber(extra),
        ),
      );
      return true;
    }
    case "tempvcgenremove": {
      if (!SnowflakePattern.test(target)) return true;
      await showPanel(interaction, () =>
        renderTempVcRemove(interaction, target, pageNumber(extra)),
      );
      return true;
    }
    case "tempvcgenremoveconfirm": {
      if (!SnowflakePattern.test(target)) return true;
      const config = configObject(
        await readModuleConfig(services, guildId, TempVcModuleName),
      );
      const generators = parseTempVcGenerators(config.generators);
      config.generators = generators.filter(
        (item) => item.channelId !== target,
      );
      await writeModuleConfig(services, guildId, TempVcModuleName, config);
      await showPanel(interaction, () =>
        renderTempVcGenerators(
          interaction,
          services,
          pageNumber(extra),
          `🗑️ Removed <#${target}> as a generator.`,
        ),
      );
      return true;
    }
    case "tempvcgenremovecancel": {
      await showPanel(interaction, () =>
        renderTempVcGenerator(interaction, services, target, pageNumber(extra)),
      );
      return true;
    }
    default:
      return false;
  }
}
