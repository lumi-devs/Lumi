import {
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  BrandColors,
  createActionButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  ephemeralCard,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  row,
  settingRow,
  tabRow,
  type CardOptions,
  type CardReply,
  type Tab,
} from "@lumi/ui";
import type { ModuleLoader, ConfigField } from "@lumi/module-runtime";
import type { ModuleManager } from "../services/ModuleManager.js";
import type { ConfigService } from "../services/ConfigService.js";
import { AddonInstaller, type AddonSource } from "@lumi/downloader";
import { PermitPanel } from "./PermitPanel.js";

export type HubView = "home" | "modules" | "settings" | "permits" | "addons";

type HubInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

type MessageModalSubmit = ModalSubmitInteraction & {
  update(reply: CardReply): Promise<unknown>;
};

export interface HubServices {
  prisma: any;
  redis: any;
  moduleManager: ModuleManager;
  moduleLoader: ModuleLoader;
  configService: ConfigService;
  permits: {
    listPermits(guildId: string): Promise<any[]>;
    getPermit(guildId: string, id: number): Promise<any>;
    deletePermit(id: number): Promise<any>;
  };
  addonInstaller: AddonInstaller;
}

const TABS: Tab[] = [
  { id: "home", label: "Overview", emoji: "🏠" },
  { id: "modules", label: "Modules", emoji: "⚙️" },
  { id: "permits", label: "Permissions", emoji: "🛡️" },
  { id: "settings", label: "Settings", emoji: "🏰" },
  { id: "addons", label: "Add-ons", emoji: "📦" },
];

const ModulesPerPage = 4;
const FieldsPerPage = 4;
const MaxOptions = 25;
const DefaultPrefix = ",";

type FieldValue = unknown;

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function valueOf(field: ConfigField, config: Record<string, unknown>): FieldValue {
  const stored = config[field.key];
  return stored === undefined || stored === null || stored === ""
    ? field.default
    : stored;
}

function formatValue(field: ConfigField, value: FieldValue): string {
  if (value === undefined || value === null || value === "") return "*not set*";
  switch (field.type) {
    case "boolean":
      return value ? "Enabled" : "Disabled";
    case "channel":
      return `<#${value}>`;
    case "role":
      return `<@&${value}>`;
    case "multi-channel": {
      const values = Array.isArray(value) ? value : [];
      return values.length ? values.map((id) => `<#${id}>`).join(", ") : "*none*";
    }
    case "multi-role": {
      const values = Array.isArray(value) ? value : [];
      return values.length ? values.map((id) => `<@&${id}>`).join(", ") : "*none*";
    }
    case "number":
      return `\`${value}\``;
    case "json":
      return `\`${cut(JSON.stringify(value), 100)}\``;
    default:
      return `\`${cut(String(value), 120)}\``;
  }
}

function isBoolean(field: ConfigField): boolean {
  return field.type === "boolean";
}

function isSelectField(field: ConfigField): boolean {
  return Array.isArray(field.choices) && field.choices.length > 0;
}

function isPickerField(field: ConfigField): boolean {
  return (
    field.type === "channel" ||
    field.type === "role" ||
    field.type === "multi-channel" ||
    field.type === "multi-role"
  );
}

function isMulti(field: ConfigField): boolean {
  return field.type === "multi-channel" || field.type === "multi-role";
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function fieldPages(fields: ConfigField[]): ConfigField[][] {
  return chunk(fields, FieldsPerPage);
}

function navigationRow(active: HubView): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return tabRow("lumi", TABS, active);
}

function closeButton() {
  return createActionButton({
    customId: "lumi:close",
    label: "Close",
    style: ButtonStyle.Danger,
    emoji: "✖️",
  });
}

function closeCard(): CardReply {
  return makeCard(BrandColors.info, "Lumi", "Control panel closed.", {
    footer: "Run `/lumi` to reopen",
  });
}

function panelOptions(
  interaction: HubInteraction,
  active: HubView,
  breadcrumbs: string[],
  extraRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [],
  footer?: string,
  showTabs = true,
): CardOptions {
  return {
    breadcrumbs,
    thumbnailUrl: interaction.guild?.iconURL({ size: 128 }) ?? undefined,
    footer: footer ?? `Requested by ${interaction.user.tag}`,
    actionRows: [
      ...(showTabs ? [navigationRow(active)] : []),
      ...extraRows,
      row(closeButton()),
    ],
    separatorAboveActionRows: true,
  };
}

function pageRow(prefix: string, page: number, totalPages: number) {
  return row(
    createActionButton({
      customId: `${prefix}:${page - 1}`,
      label: "Previous",
      emoji: "◀️",
      style: ButtonStyle.Secondary,
      disabled: page <= 0,
    }),
    createActionButton({
      customId: `${prefix}:${page + 1}`,
      label: "Next",
      emoji: "▶️",
      style: ButtonStyle.Secondary,
      disabled: page >= totalPages - 1,
    }),
  );
}

async function readModuleConfig(
  services: HubServices,
  guildId: string,
  moduleName: string,
): Promise<Record<string, unknown>> {
  const value = await services.configService.get(guildId, moduleName);
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

async function writeModuleConfig(
  services: HubServices,
  guildId: string,
  moduleName: string,
  config: Record<string, unknown>,
): Promise<void> {
  await services.configService.set(guildId, moduleName, config);
}

function moduleByName(services: HubServices, name: string) {
  return services.moduleLoader.listAll().find((module) => module.manifest.name === name);
}

function findField(services: HubServices, moduleName: string, key: string): ConfigField | undefined {
  return moduleByName(services, moduleName)?.manifest.configFields?.find(
    (field) => field.key === key,
  );
}

function fieldLine(field: ConfigField, value: FieldValue): string[] {
  const required = field.required ? " *(required)*" : "";
  return [
    `**${field.label}**${required} — ${formatValue(field, value)}`,
    ...(field.description ? [`-# ${cut(field.description, 100)}`] : []),
  ];
}

async function renderModules(
  interaction: HubInteraction,
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const modules = services.moduleLoader
    .listAll()
    .map((module) => ({
      name: module.manifest.name,
      displayName: module.manifest.displayName || module.manifest.name,
      emoji: module.manifest.emoji || "⚙️",
      description: module.manifest.description,
      enabled: services.moduleLoader.isEnabled(guildId, module.manifest.name),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  if (modules.length === 0) {
    return makeEmptyCard(
      "Modules",
      "No modules are installed on this bot.",
      "Add a module under `modules/` and restart the bot.",
      panelOptions(interaction, "modules", ["Hub", "Modules"]),
    );
  }

  const totalPages = Math.max(1, Math.ceil(modules.length / ModulesPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = modules.slice(
    safePage * ModulesPerPage,
    safePage * ModulesPerPage + ModulesPerPage,
  );

  const sections = shown.map((module) =>
    settingRow(
      [
        `${module.enabled ? "✅" : "⛔"} ${module.emoji} **${module.displayName}**`,
        `-# ${module.enabled ? "Enabled" : "Disabled"} · ${cut(module.description || "No description", 90)}`,
      ],
      {
        customId: `lumi:modopen:${module.name}`,
        label: "Open",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (totalPages > 1) rows.push(pageRow("lumi:mods", safePage, totalPages));

  const enabledCount = modules.filter((module) => module.enabled).length;
  const footer = [
    `${enabledCount} of ${modules.length} enabled`,
    totalPages > 1 ? `page ${safePage + 1}/${totalPages}` : null,
    "Open a module to configure it.",
  ]
    .filter(Boolean)
    .join(" · ");

  return makeCard(
    BrandColors.primary,
    "⚙️ Feature Modules",
    notice ? `**${notice}**` : [],
    {
      sections,
      ...panelOptions(interaction, "modules", ["Hub", "Modules"], rows, footer),
    },
  );
}

async function renderModuleDetail(
  interaction: HubInteraction,
  services: HubServices,
  moduleName: string,
  section = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const loaded = moduleByName(services, moduleName);
  if (!loaded) {
    return makeErrorCard(
      "Unknown Module",
      `No module named \`${moduleName}\` is loaded.`,
      panelOptions(interaction, "modules", ["Hub", "Modules"]),
    );
  }

  const meta = loaded.manifest;
  const fields = meta.configFields ?? [];
  const pages = fieldPages(fields);
  const total = Math.max(1, pages.length);
  const safeSection = Math.max(0, Math.min(section, total - 1));
  const current = pages[safeSection] ?? [];
  const config = await readModuleConfig(services, guildId, moduleName);
  const enabled = services.moduleLoader.isEnabled(guildId, moduleName);

  const sections = current.map((field) => {
    const value = valueOf(field, config);
    const lines = fieldLine(field, value);
    if (isBoolean(field)) {
      const on = Boolean(value);
      return settingRow(lines, {
        customId: `lumi:modbool:${moduleName}:${field.key}:${safeSection}`,
        label: on ? "On" : "Off",
        style: on ? ButtonStyle.Success : ButtonStyle.Secondary,
      });
    }
    return settingRow(lines, {
      customId: `lumi:modfield:${moduleName}:${field.key}:${safeSection}`,
      label: "Configure",
      emoji: "✏️",
      style: ButtonStyle.Secondary,
    });
  });

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (pages.length > 1) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:modsec:${moduleName}`,
          placeholder: "Jump to a settings page…",
          options: pages.map((pageFields, index) => ({
            label: `Settings ${index + 1}`,
            value: String(index),
            description: `${pageFields.length} setting(s)`,
            default: index === safeSection,
          })),
        }),
      ),
    );
  }

  rows.push(
    row(
      createActionButton({
        customId: `lumi:modtoggle:${moduleName}:${safeSection}`,
        label: enabled ? "Disable" : "Enable",
        emoji: enabled ? "⛔" : "✅",
        style: enabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `lumi:modreset:${moduleName}:${safeSection}`,
        label: "Reset",
        emoji: "↩️",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: "lumi:mods:0",
        label: "Back",
        emoji: "⬅️",
        style: ButtonStyle.Secondary,
      }),
    ),
  );

  const body: string[] = [];
  if (notice) body.push(`**${notice}**`);
  body.push(
    `**Status:** ${enabled ? "✅ Enabled" : "⛔ Disabled"}`,
    meta.description || "No description provided.",
  );
  if (pages.length > 1) body.push(`-# Settings page ${safeSection + 1} of ${total}`);

  return makeCard(
    enabled ? BrandColors.primary : BrandColors.warning,
    `${meta.emoji} ${meta.displayName}`,
    body,
    {
      sections,
      ...panelOptions(
        interaction,
        "modules",
        ["Hub", "Modules", meta.displayName],
        rows,
        fields.length === 0 ? "This module has no configurable settings." : undefined,
        false,
      ),
    },
  );
}

function channelTypesFor(field: ConfigField): ChannelType[] {
  const configured = (field as ConfigField & { channelTypes?: number[] }).channelTypes;
  if (Array.isArray(configured) && configured.length > 0) return configured as ChannelType[];
  return [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
  ];
}

async function renderFieldEditor(
  interaction: HubInteraction,
  services: HubServices,
  moduleName: string,
  fieldKey: string,
  section: number,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const loaded = moduleByName(services, moduleName);
  const field = loaded?.manifest.configFields?.find((item) => item.key === fieldKey);
  if (!loaded || !field) {
    return makeErrorCard(
      "Unknown Setting",
      `That setting no longer exists.`,
      panelOptions(interaction, "modules", ["Hub", "Modules"]),
    );
  }

  const config = await readModuleConfig(services, guildId, moduleName);
  const value = valueOf(field, config);
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (isSelectField(field)) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:modpick:${moduleName}:${fieldKey}:${section}`,
          placeholder: cut(field.label, 100),
          options: (field.choices ?? []).slice(0, MaxOptions).map((choice) => ({
            label: cut(choice, 100),
            value: choice,
            default: choice === value,
          })),
        }),
      ),
    );
  } else if (field.type === "channel" || field.type === "multi-channel") {
    rows.push(
      row(
        createChannelSelectMenu({
          customId: `lumi:modpick:${moduleName}:${fieldKey}:${section}`,
          placeholder: cut(field.label, 100),
          channelTypes: channelTypesFor(field),
          minValues: 0,
          maxValues: isMulti(field) ? MaxOptions : 1,
        }),
      ),
    );
  } else if (field.type === "role" || field.type === "multi-role") {
    rows.push(
      row(
        createRoleSelectMenu({
          customId: `lumi:modpick:${moduleName}:${fieldKey}:${section}`,
          placeholder: cut(field.label, 100),
          minValues: 0,
          maxValues: isMulti(field) ? MaxOptions : 1,
        }),
      ),
    );
  } else {
    rows.push(
      row(
        createActionButton({
          customId: `lumi:modinput:${moduleName}:${fieldKey}:${section}`,
          label: "Enter value…",
          emoji: "⌨️",
          style: ButtonStyle.Primary,
        }),
      ),
    );
  }

  rows.push(
    row(
      createActionButton({
        customId: `lumi:modclear:${moduleName}:${fieldKey}:${section}`,
        label: "Clear",
        emoji: "🧹",
        style: ButtonStyle.Secondary,
        disabled: value === undefined || value === null || value === "",
      }),
      createActionButton({
        customId: `lumi:modopen:${moduleName}:${section}`,
        label: "Back",
        emoji: "⬅️",
        style: ButtonStyle.Secondary,
      }),
    ),
  );

  return makeCard(
    BrandColors.primary,
    `${loaded.manifest.emoji} ${loaded.manifest.displayName} · ${field.label}`,
    [
      ...(field.description ? [`-# ${field.description}`] : []),
      `**Current value:** ${formatValue(field, value)}`,
      `-# Pick a value below, or clear it to reset.`,
    ],
    {
      breadcrumbs: ["Hub", "Modules", loaded.manifest.displayName, field.label],
      ...panelOptions(
        interaction,
        "modules",
        ["Hub", "Modules", loaded.manifest.displayName, field.label],
        rows,
        undefined,
        false,
      ),
    },
  );
}

function parseFieldInput(field: ConfigField, raw: string): FieldValue {
  const value = raw.trim();
  if (field.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("Enter a valid number.");
    return parsed;
  }
  if (field.type === "boolean") return value === "true" || value === "on";
  if (field.type === "multi-channel" || field.type === "multi-role") {
    return value
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (field.type === "json") {
    try {
      const parsed = JSON.parse(value);
      if (parsed === null || typeof parsed !== "object") {
        throw new Error("JSON settings must be an object or array.");
      }
      return parsed;
    } catch (error) {
      throw new Error(
        error instanceof SyntaxError ? "Enter valid JSON." : (error as Error).message,
      );
    }
  }
  return value;
}

function prefixModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("lumi:setprefixmodal")
    .setTitle("Change Command Prefix")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("prefix")
          .setLabel("Prefix")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder(DefaultPrefix),
      ),
    );
}

function fieldModal(moduleName: string, field: ConfigField, section: number, value: FieldValue): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:modinput:${moduleName}:${field.key}:${section}`)
    .setTitle(cut(`Edit ${field.label}`, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel(cut(field.label, 45))
          .setStyle(
            (field.type === "json" ||
              (field.type === "string" && field.description && field.description.length > 60))
              ? TextInputStyle.Paragraph
              : TextInputStyle.Short,
          )
          .setRequired(false)
          .setMaxLength(field.type === "json" ? 4000 : 400)
          .setPlaceholder(cut(field.description ?? "", 100))
          .setValue(
            value === undefined || value === null
              ? ""
              : field.type === "json"
                ? JSON.stringify(value, null, 2).slice(0, 4000)
                : String(value),
          ),
      ),
    );
}

function addonModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("lumi:addoninstallmodal")
    .setTitle("Install Add-on")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("source")
          .setLabel("Source (github / npm / local)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder("github"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("url")
          .setLabel("Repository, package, or path")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("ref")
          .setLabel("Branch, tag, or version (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100),
      ),
    );
}

async function renderHome(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const client = interaction.client;
  const modules = services.moduleLoader.listGlobal();
  const enabled = modules.filter((module) =>
    services.moduleLoader.isEnabled(guildId, module.name),
  ).length;
  const settings = await services.configService.getAll(guildId);
  const prefix =
    typeof settings.prefix === "string" && settings.prefix.length > 0
      ? settings.prefix
      : DefaultPrefix;
  const members =
    interaction.guild?.memberCount ??
    client.guilds.cache.reduce((total, guild) => total + (guild.memberCount ?? 0), 0);

  return makeCard(
    BrandColors.primary,
    `🤖 ${client.user?.username ?? "Lumi"} Control Panel`,
    [
      "Manage this server from one place — modules, permissions, and settings.",
      [
        `⚙️ **${enabled}** of **${modules.length}** modules enabled`,
        `👥 **${members}** members`,
        `💻 Prefix \`${prefix}\``,
      ].join("\n"),
      [
        "**Modules** — enable, disable, and configure features",
        "**Permissions** — permits and access overrides",
        "**Settings** — command prefix and server options",
        "**Add-ons** — extend Lumi with add-on modules",
      ]
        .map((line) => `-# ${line}`)
        .join("\n"),
    ],
    panelOptions(interaction, "home", ["Hub"], [], "Select a tab below to continue."),
  );
}

async function renderSettings(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const settings = await services.configService.getAll(guildId);
  const prefix =
    typeof settings.prefix === "string" && settings.prefix.length > 0
      ? settings.prefix
      : DefaultPrefix;
  const otherKeys = Object.keys(settings).filter((key) => key !== "prefix");

  const sections = [
    settingRow(
      [
        `💻 **Command Prefix** — \`${prefix}\``,
        "-# Prefix commands run alongside slash commands.",
      ],
      {
        customId: "lumi:setprefix",
        label: "Edit",
        emoji: "✏️",
        style: ButtonStyle.Primary,
      },
    ),
  ];

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createActionButton({
        customId: "lumi:setreset",
        label: "Reset Prefix",
        emoji: "↩️",
        style: ButtonStyle.Secondary,
        disabled: prefix === DefaultPrefix,
      }),
    ),
  ];

  return makeCard(
    BrandColors.primary,
    "🏰 Server Settings",
    otherKeys.length
      ? [
          `**Stored settings:** ${otherKeys
            .slice(0, 20)
            .map((key) => `\`${key}\``)
            .join(", ")}`,
        ]
      : [],
    {
      sections,
      ...panelOptions(interaction, "settings", ["Hub", "Settings"], rows, "Guild configuration"),
    },
  );
}

async function renderPermits(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const permits = await services.permits.listPermits(guildId);
  const shown = permits.slice(0, 10);
  const lines = shown.map(
    (permit) =>
      `${permit.polarity === "DENY" ? "⛔" : "✅"} **${permit.name}**${permit.builtin ? " 🔒" : ""} — \`${permit.node}\``,
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createActionButton({
        customId: "lumi:permitpanel",
        label: "Manage Permits",
        emoji: "🛡️",
        style: ButtonStyle.Primary,
      }),
      createActionButton({
        customId: "lumi:permitrefresh",
        label: "Refresh",
        emoji: "🔄",
        style: ButtonStyle.Secondary,
      }),
    ),
  ];

  return makeCard(
    BrandColors.primary,
    "🛡️ Permissions",
    [
      permits.length === 0
        ? "*No permits are configured yet — every command uses its default access.*"
        : lines.join("\n"),
      permits.length > shown.length
        ? `-# ...and ${permits.length - shown.length} more. Open the permit editor to see all.`
        : null,
      "-# Permits grant or deny specific permission nodes per user, role, or channel.",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    {
      ...panelOptions(
        interaction,
        "permits",
        ["Hub", "Permissions"],
        rows,
        `${permits.length} permit(s)`,
      ),
    },
  );
}

async function renderAddons(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const installed = await services.addonInstaller.listInstalled();
  const addonModules = services.moduleLoader
    .listAll()
    .filter((module) => module.path.includes("data/addons"))
    .map((module) => ({
      module,
      enabled: services.moduleLoader.isEnabled(guildId, module.manifest.name),
    }));

  const sections = addonModules.slice(0, 5).map(({ module, enabled }) =>
    settingRow(
      [
        `${enabled ? "✅" : "⛔"} **${module.manifest.displayName || module.manifest.name}** \`${module.manifest.name}\``,
        `-# v${module.manifest.version} · ${cut(module.manifest.description || "No description", 90)}`,
      ],
      {
        customId: `lumi:modopen:${module.manifest.name}`,
        label: "Open",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createActionButton({
        customId: "lumi:addoninstall",
        label: "Install Add-on",
        emoji: "📦",
        style: ButtonStyle.Success,
      }),
      createActionButton({
        customId: "lumi:addonsrefresh",
        label: "Refresh",
        emoji: "🔄",
        style: ButtonStyle.Secondary,
      }),
    ),
  ];

  return makeCard(
    BrandColors.primary,
    "📦 Add-ons",
    [
      `**Tracked add-ons:** ${installed.length}`,
      `**Add-on modules:** ${addonModules.length} (${addonModules.filter((item) => item.enabled).length} enabled)`,
    ],
    {
      sections,
      ...panelOptions(
        interaction,
        "addons",
        ["Hub", "Add-ons"],
        rows,
        addonModules.length === 0
          ? "No add-on modules installed. Use Install Add-on to get started."
          : "Open an add-on module to enable or configure it.",
      ),
    },
  );
}

export class HubPanel {
  static render(
    view: HubView,
    interaction: HubInteraction,
    services: HubServices,
    notice?: string,
  ): Promise<CardReply> {
    switch (view) {
      case "modules":
        return renderModules(interaction, services, 0, notice);
      case "settings":
        return renderSettings(interaction, services);
      case "permits":
        return renderPermits(interaction, services);
      case "addons":
        return renderAddons(interaction, services);
      case "home":
      default:
        return renderHome(interaction, services);
    }
  }

  static async handleInteraction(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
    services: HubServices,
  ): Promise<boolean> {
    if (!interaction.customId.startsWith("lumi:")) return false;

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Lumi", "This panel only works in a server.")),
      );
      return true;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permissions",
            "You need **Manage Server** to use the Lumi control panel.",
          ),
        ),
      );
      return true;
    }

    if (interaction.isModalSubmit()) {
      await this.handleModal(interaction, services, guildId);
      return true;
    }

    const message = interaction.message;
    if (!message) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Lumi", "This panel has expired. Run `/lumi` again.")),
      );
      return true;
    }

    const ownerId =
      message.interactionMetadata?.user.id ?? message.interaction?.user.id;
    if (ownerId && ownerId !== interaction.user.id) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Lumi", "This panel belongs to another user.", {
            footer: "Run `/lumi` to open your own panel",
          }),
        ),
      );
      return true;
    }

    const [, action, target, extra, extra2] = interaction.customId.split(":");

    switch (action) {
      case "close": {
        await interaction.update(closeCard());
        return true;
      }
      case "home":
      case "modules":
      case "settings":
      case "permits":
      case "addons": {
        await interaction.deferUpdate();
        await interaction.editReply(
          await HubPanel.render(action, interaction, services),
        );
        return true;
      }
      case "permitpanel": {
        const panel = new PermitPanel({
          prisma: services.prisma,
          redis: services.redis,
          guildId,
          interaction,
        });
        await panel.render();
        return true;
      }
      case "mods": {
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderModules(interaction, services, Number(target) || 0),
        );
        return true;
      }
      case "modopen": {
        if (interaction.isStringSelectMenu()) return true;
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderModuleDetail(
            interaction,
            services,
            target,
            Number(extra) || 0,
          ),
        );
        return true;
      }
      case "modtoggle": {
        const enabled = services.moduleLoader.isEnabled(guildId, target);
        if (enabled) {
          await services.moduleManager.disable(guildId, target);
        } else {
          await services.moduleManager.enable(guildId, target);
        }
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderModuleDetail(
            interaction,
            services,
            target,
            Number(extra) || 0,
            `Module ${enabled ? "disabled" : "enabled"}.`,
          ),
        );
        return true;
      }
      case "modreset": {
        await writeModuleConfig(services, guildId, target, {});
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderModuleDetail(
            interaction,
            services,
            target,
            Number(extra) || 0,
            "Settings reset to defaults.",
          ),
        );
        return true;
      }
      case "modsec": {
        if (!interaction.isStringSelectMenu()) return true;
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderModuleDetail(
            interaction,
            services,
            target,
            Number(interaction.values[0]) || 0,
          ),
        );
        return true;
      }
      case "modbool": {
        const field = findField(services, target, extra);
        if (!field) return true;
        const config = await readModuleConfig(services, guildId, target);
        config[field.key] = !Boolean(valueOf(field, config));
        await writeModuleConfig(services, guildId, target, config);
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderModuleDetail(
            interaction,
            services,
            target,
            Number(extra2) || 0,
          ),
        );
        return true;
      }
      case "modfield": {
        const field = findField(services, target, extra);
        if (!field) return true;
        const section = Number(extra2) || 0;
        if (isPickerField(field) || isSelectField(field)) {
          await interaction.deferUpdate();
          await interaction.editReply(
            await renderFieldEditor(interaction, services, target, extra, section),
          );
        } else {
          const config = await readModuleConfig(services, guildId, target);
          await interaction.showModal(
            fieldModal(target, field, section, valueOf(field, config)),
          );
        }
        return true;
      }
      case "modinput": {
        const field = findField(services, target, extra);
        if (!field) return true;
        const config = await readModuleConfig(services, guildId, target);
        await interaction.showModal(
          fieldModal(target, field, Number(extra2) || 0, valueOf(field, config)),
        );
        return true;
      }
      case "modpick": {
        if (!interaction.isAnySelectMenu()) return true;
        const field = findField(services, target, extra);
        if (!field) return true;
        const config = await readModuleConfig(services, guildId, target);
        const chosen = interaction.values;
        const fieldValue = isMulti(field) ? chosen : chosen[0];
        if (fieldValue === undefined || (Array.isArray(fieldValue) && fieldValue.length === 0)) {
          delete config[field.key];
        } else {
          config[field.key] = fieldValue;
        }
        await writeModuleConfig(services, guildId, target, config);
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderFieldEditor(
            interaction,
            services,
            target,
            extra,
            Number(extra2) || 0,
          ),
        );
        return true;
      }
      case "modclear": {
        const config = await readModuleConfig(services, guildId, target);
        delete config[extra];
        await writeModuleConfig(services, guildId, target, config);
        await interaction.deferUpdate();
        await interaction.editReply(
          await renderFieldEditor(
            interaction,
            services,
            target,
            extra,
            Number(extra2) || 0,
          ),
        );
        return true;
      }
      case "setprefix": {
        await interaction.showModal(prefixModal());
        return true;
      }
      case "setreset": {
        await services.configService.reset(guildId, "prefix");
        await interaction.deferUpdate();
        await interaction.editReply(await renderSettings(interaction, services));
        return true;
      }
      case "addoninstall": {
        await interaction.showModal(addonModal());
        return true;
      }
      case "addonsrefresh": {
        await interaction.deferUpdate();
        await interaction.editReply(await renderAddons(interaction, services));
        return true;
      }
      case "permitrefresh": {
        await interaction.deferUpdate();
        await interaction.editReply(await renderPermits(interaction, services));
        return true;
      }
      default: {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Lumi", "Unknown panel action.")),
        );
        return true;
      }
    }
  }

  private static async handleModal(
    interaction: ModalSubmitInteraction,
    services: HubServices,
    guildId: string,
  ): Promise<void> {
    const parts = interaction.customId.split(":");
    const action = parts[1];

    if (action === "setprefixmodal") {
      const prefix = interaction.fields.getTextInputValue("prefix").trim();
      if (!prefix || /\s/.test(prefix)) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Invalid Prefix", "The prefix cannot be empty or contain spaces.")),
        );
        return;
      }
      await services.configService.set(guildId, "prefix", prefix);
      const card = await renderSettings(interaction, services);
      if (interaction.isFromMessage()) {
        await (interaction as MessageModalSubmit).update(card);
      } else {
        await interaction.reply(ephemeralCard(card));
      }
      return;
    }

    if (action === "modinput") {
      const [, , moduleName, fieldKey, sectionRaw] = parts;
      const field = findField(services, moduleName, fieldKey);
      if (!field) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Unknown Setting", "That setting no longer exists.")),
        );
        return;
      }
      const raw = interaction.fields.getTextInputValue("value");
      const config = await readModuleConfig(services, guildId, moduleName);
      try {
        if (raw.trim().length === 0) delete config[field.key];
        else config[field.key] = parseFieldInput(field, raw);
      } catch (error) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Invalid Value",
              error instanceof Error ? error.message : "Enter a valid value.",
            ),
          ),
        );
        return;
      }
      await writeModuleConfig(services, guildId, moduleName, config);
      const card = await renderModuleDetail(
        interaction,
        services,
        moduleName,
        Number(sectionRaw) || 0,
        `${field.label} updated.`,
      );
      if (interaction.isFromMessage()) await (interaction as MessageModalSubmit).update(card);
      else await interaction.reply(card);
      return;
    }

    if (action === "addoninstallmodal") {
      const source = interaction.fields.getTextInputValue("source").trim().toLowerCase();
      const url = interaction.fields.getTextInputValue("url").trim();
      const ref = interaction.fields.getTextInputValue("ref").trim() || undefined;
      if (!["github", "npm", "local"].includes(source)) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Invalid Source", "Source must be `github`, `npm`, or `local`."),
          ),
        );
        return;
      }
      const fromMessage = interaction.isFromMessage();
      if (fromMessage) {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ ephemeral: true });
      }
      const result = await services.addonInstaller.install({
        type: source as AddonSource["type"],
        url,
        ref,
      });
      if (!result.success) {
        const failure = makeErrorCard("Install Failed", result.error ?? "Unknown error.");
        if (fromMessage) {
          await interaction.followUp(ephemeralCard(failure));
        } else {
          await interaction.editReply(failure);
        }
        return;
      }
      const card = await renderAddons(interaction, services);
      if (fromMessage) {
        await interaction.editReply(card);
      } else {
        await interaction.editReply(
          makeCard(
            BrandColors.success,
            "Add-on Installed",
            `Installed **${result.name}** v${result.version}.`,
            { footer: result.path },
          ),
        );
      }
      return;
    }
  }
}
