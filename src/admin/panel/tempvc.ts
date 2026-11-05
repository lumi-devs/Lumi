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
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  backButton,
  cut,
  type HubInteraction,
  type MessageModalSubmit,
  type PanelInteraction,
  panelOptions,
  showPanel,
} from "./common.js";
import { readModuleConfig, writeModuleConfig } from "./moduleSettings.js";
import type { BotServices } from "../../core/contracts.js";

export const TempVcModuleName = "utility-tempvc";

const MaxOptions = 25;
const MaxListed = 20;
const SnowflakePattern = /^\d{15,22}$/;

export interface TempVcGenerator {
  channelId: string;
  templateName?: string;
  userLimit?: number;
}

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
  return stringDefault(
    services,
    config,
    "templateName",
    "➕ {user}'s Channel",
  );
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
              names.get(generator.channelId) ??
                `#${generator.channelId}`,
              100,
            ),
            value: generator.channelId,
          })),
        }),
      ),
    );
  }
  rows.push(row(backButton(`lumi:modopen:${TempVcModuleName}:${pageIndex}`)));

  return makeCard(undefined, `${moduleTitle(services)} · Generators`, [
    ...(notice ? [`**${notice}**`] : []),
    ...lines,
    "-# Members who join a generator get their own temporary channel.",
  ], panelOptions(
    interaction,
    "modules",
    ["Hub", "Modules", "Temporary Voice", "Generators"],
    rows,
    undefined,
    false,
  ));
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

  return makeCard(undefined, `${moduleTitle(services)} · Generator`, [
    ...(notice ? [`**${notice}**`] : []),
    `**Channel**\n${name ? `#${name}` : `<#${generatorId}>`}`,
    `**Name template**\n\`${cut(template, 100)}\``,
    `**User limit**\n${limitLabel(limit)}`,
    `-# ${generator.templateName ? "Custom template" : "Using the server template"} · ${generator.userLimit === undefined ? "Using the server limit" : "Custom limit"}`,
  ], panelOptions(
    interaction,
    "modules",
    ["Hub", "Modules", "Temporary Voice", "Generators", name ?? "Generator"],
    [
      row(
        createActionButton({
          customId: `lumi:tempvcgenrename:${generatorId}:${pageIndex}`,
          label: "Rename Template",
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
  ));
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
      await replyModalError(
        interaction,
        "Enter a whole number from 0 to 99.",
      );
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
    action === "tempvcgenrename"
      ? "✏️ Template updated."
      : "🔢 Limit updated.",
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
  guildId: string,
  action: string,
  target: string,
  extra: string,
): Promise<boolean> {
  if (!action.startsWith("tempvc")) return false;

  switch (action) {
    case "tempvcgens": {
      await showPanel(interaction, () =>
        renderTempVcGenerators(
          interaction,
          services,
          pageNumber(target),
        ),
      );
      return true;
    }
    case "tempvcadd": {
      if (!interaction.isChannelSelectMenu()) return true;
      const channelId = interaction.values[0];
      if (!channelId || !SnowflakePattern.test(channelId)) return true;
      const config = configObject(
        await readModuleConfig(
          services,
          guildId,
          TempVcModuleName,
        ),
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
        renderTempVcGenerator(
          interaction,
          services,
          target,
          pageNumber(extra),
        ),
      );
      return true;
    }
    case "tempvcgenback": {
      await showPanel(interaction, () =>
        renderTempVcGenerators(
          interaction,
          services,
          pageNumber(target),
        ),
      );
      return true;
    }
    case "tempvcgenrename":
    case "tempvcgenlimit": {
      if (!interaction.isButton()) return true;
      if (!SnowflakePattern.test(target)) return true;
      const config = configObject(
        await readModuleConfig(
          services,
          guildId,
          TempVcModuleName,
        ),
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
        renderTempVcRemove(
          interaction,
          target,
          pageNumber(extra),
        ),
      );
      return true;
    }
    case "tempvcgenremoveconfirm": {
      if (!SnowflakePattern.test(target)) return true;
      const config = configObject(
        await readModuleConfig(
          services,
          guildId,
          TempVcModuleName,
        ),
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
        renderTempVcGenerator(
          interaction,
          services,
          target,
          pageNumber(extra),
        ),
      );
      return true;
    }
    default:
      return false;
  }
}
