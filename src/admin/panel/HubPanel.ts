import {
  ButtonStyle,
  ChannelType,
  ActionRowBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type AnySelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  AccentColors,
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
  type CardReply,
} from "@lumi/ui";
import type { ModuleLoader, ConfigField } from "@lumi/module-runtime";
import type { ModuleManager } from "../services/ModuleManager.js";
import type { ConfigService } from "../services/ConfigService.js";
import type { AddonManager } from "@lumi/downloader";
import type { PermitRepository } from "@lumi/permits";
import { hasAdminAccess, roleIdsFrom } from "../access.js";
import { formatPermitNodes } from "../permits/nodes.js";
import { PermitPanel } from "./PermitPanel.js";
import { handleAddonInteraction, renderAddonPanel } from "./addons.js";
import {
  ModulesPerPage,
  moduleListRowId,
  parseSubmoduleTogglePages,
  submoduleItems,
  submodulePagePrefix,
  submoduleToggleId,
  supermoduleItems,
} from "./modules.js";
import { paginate } from "./pages.js";
import { fieldPages } from "./configFields.js";
import {
  cut,
  navigationRow,
  pageRow,
  panelOptions,
  type HubInteraction,
  type HubView,
  type MessageModalSubmit,
} from "./common.js";

export type { HubView } from "./common.js";

export interface HubServices {
  prisma: any;
  redis: any;
  moduleManager: ModuleManager;
  moduleLoader: ModuleLoader;
  configService: ConfigService;
  permits: PermitRepository;
  addons: AddonManager;
}

const FieldsPerPage = 4;
const SubmodulesPerPage = 3;
const MaxOptions = 25;
const DefaultPrefix = ",";

type FieldValue = unknown;

function fieldValue(field: ConfigField, config: Record<string, unknown>): FieldValue {
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

function configKeyFor(services: HubServices, moduleName: string): string {
  return moduleByName(services, moduleName)?.manifest.configKey ?? moduleName;
}

async function readModuleConfig(
  services: HubServices,
  guildId: string,
  moduleName: string,
): Promise<Record<string, unknown>> {
  const value = await services.configService.get(guildId, configKeyFor(services, moduleName));
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
  await services.configService.set(guildId, configKeyFor(services, moduleName), config);
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
  const pages = fieldPages(fields, FieldsPerPage);
  const total = Math.max(1, pages.length);
  const safeSection = Math.max(0, Math.min(section, total - 1));
  const page = pages[safeSection] ?? { label: "General", fields: [] };
  const current = page.fields;
  const config = await readModuleConfig(services, guildId, moduleName);
  const enabled = services.moduleLoader.isEnabled(guildId, moduleName);

  const sections = current.map((field) => {
    const value = fieldValue(field, config);
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
          placeholder: "Jump to a settings category…",
          options: pages.map((page, index) => ({
            label: page.label,
            value: String(index),
            description: `${page.fields.length} setting(s)`,
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
  if (pages.length > 1) body.push(`-# ${page.label}`);

  return makeCard(
    enabled ? undefined : AccentColors.warning,
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
  const value = fieldValue(field, config);
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
    undefined,
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

async function renderModules(
  interaction: HubInteraction,
  services: HubServices,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const modules = supermoduleItems(
    services.moduleLoader.listGlobal(),
    (name) => services.moduleLoader.isEnabled(guildId, name),
  );

  if (modules.length === 0) {
    return makeEmptyCard(
      "Modules",
      "No modules are installed on this bot.",
      "Add a module under `modules/` and restart the bot.",
      panelOptions(interaction, "modules", ["Hub", "Modules"]),
    );
  }

  const { items: shown, page: currentPage, totalPages } = paginate(
    modules,
    page,
    ModulesPerPage,
  );

  const sections = shown.map((module) =>
    settingRow(
      [
        `${module.emoji} **${module.displayName}**`,
        `-# ${module.enabled ? "Enabled" : "Disabled"} · ${module.submoduleCount} submodules · ${cut(module.description || "No description", 80)}`,
      ],
      {
        customId: moduleListRowId(module.name, currentPage),
        label: "Submodules",
        style: ButtonStyle.Primary,
      },
    ),
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (totalPages > 1) rows.push(pageRow("lumi:mods", currentPage, totalPages));

  const enabledCount = modules.filter((module) => module.enabled).length;
  const footer = [
    `${enabledCount} of ${modules.length} enabled`,
    totalPages > 1 ? `page ${currentPage + 1}/${totalPages}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return makeCard(
    undefined,
    "⚙️ Feature Modules",
    notice ? `**${notice}**` : [],
    {
      sections,
      ...panelOptions(interaction, "modules", ["Hub", "Modules"], rows, footer),
    },
  );
}

async function renderSubmodules(
  interaction: HubInteraction,
  services: HubServices,
  supermoduleName: string,
  originPage = 0,
  page = 0,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const modules = services.moduleLoader.listGlobal();
  const parent = modules.find(
    (module) => module.name === supermoduleName && !module.isSubmodule,
  );
  const backButton = createActionButton({
    customId: `lumi:mods:${originPage}`,
    label: "Back",
    style: ButtonStyle.Secondary,
  });
  const backRow = row(backButton);

  if (!parent) {
    return makeErrorCard(
      "Unknown Module",
      `No supermodule named \`${supermoduleName}\` is loaded.`,
      panelOptions(interaction, "modules", ["Hub", "Modules"], [backRow]),
    );
  }

  const breadcrumbs = ["Hub", "Modules", parent.displayName];
  const children = submoduleItems(
    modules,
    supermoduleName,
    (name) => services.moduleLoader.isEnabled(guildId, name),
  );
  const { items: shown, page: currentPage, totalPages } = paginate(
    children,
    page,
    SubmodulesPerPage,
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (const module of shown) {
    rows.push(
      row(
        createActionButton({
          customId: `lumi:modopen:${module.name}:0`,
          label: `Open ${module.displayName}`,
          style: ButtonStyle.Primary,
        }),
        createActionButton({
          customId: submoduleToggleId(
            module.name,
            originPage,
            currentPage,
          ),
          label: `${module.enabled ? "Disable" : "Enable"} ${module.displayName}`,
          style: module.enabled
            ? ButtonStyle.Danger
            : ButtonStyle.Success,
        }),
      ),
    );
  }
  if (totalPages > 1) {
    rows.push(
      pageRow(submodulePagePrefix(supermoduleName, originPage), currentPage, totalPages),
    );
  }
  rows.push(
    row(
      ...(parent.configFields.length > 0
        ? [
            createActionButton({
              customId: `lumi:modopen:${supermoduleName}:0`,
              label: "Module Settings",
              style: ButtonStyle.Primary,
            }),
          ]
        : []),
      backButton,
    ),
  );

  if (children.length === 0) {
    return makeEmptyCard(
      "No submodules",
      `**${parent.displayName}** has no submodules.`,
      undefined,
      panelOptions(interaction, "modules", breadcrumbs, rows),
    );
  }

  const enabledCount = children.filter((module) => module.enabled).length;
  const modulesList = shown.map(
    (module) =>
      `${module.emoji} **${module.displayName}** — ${module.enabled ? "Enabled" : "Disabled"} · ${cut(module.description || "No description", 90)}`,
  );

  const body = [
    parent.description || "No description provided.",
    `**Submodules:** ${children.length} · ${enabledCount} enabled`,
    ...modulesList,
  ];
  if (notice) body.unshift(`**${notice}**`);

  return makeCard(
    undefined,
    `${parent.emoji} ${parent.displayName}`,
    body,
    {
      ...panelOptions(
        interaction,
        "modules",
        breadcrumbs,
        rows,
        totalPages > 1 ? `page ${currentPage + 1}/${totalPages}` : undefined,
      ),
    },
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
    undefined,
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
    undefined,
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
      `${permit.polarity === "Deny" ? "⛔" : "✅"} **#${permit.number} ${permit.name}**${permit.builtin ? " 🔒" : ""} — ${formatPermitNodes(permit.nodes, 2)}`,
  );

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    row(
      createActionButton({
        customId: "lumi:permitpanel",
        label: "Manage Permits",
        emoji: "🛡️",
        style: ButtonStyle.Primary,
      }),
    ),
    navigationRow("permits"),
  ];

  return makeCard(
    undefined,
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
        false,
      ),
    },
  );
}

export function renderHubPanel(
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
      return renderAddonPanel(interaction, services, { kind: "home" });
    default:
      return renderHome(interaction, services);
  }
}

export async function handleHubInteraction(
  interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction,
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

  if (interaction.customId.startsWith("lumi:addon:")) {
    await handleAddonInteraction(interaction, services);
    return true;
  }

  const allowed = await hasAdminAccess({
    guildId,
    userId: interaction.user.id,
    roleIds: roleIdsFrom(interaction.member, guildId),
    guildOwnerId: interaction.guild?.ownerId,
    memberPermissions: interaction.memberPermissions,
    client: interaction.client,
    permits: services.permits,
  });
  if (!allowed) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Missing Permissions",
          "You need **Manage Server** or an admin permit to use the Lumi control panel.",
        ),
      ),
    );
    return true;
  }

  if (interaction.isModalSubmit()) {
    await handleHubModal(interaction, services, guildId);
    return true;
  }

  const message = interaction.message;
  if (!message) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Lumi", "This panel has expired. Run `/lumi` again.")),
    );
    return true;
  }

  const ownerId = message.interactionMetadata?.user.id;
  if (ownerId !== undefined && ownerId !== interaction.user.id) {
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
    case "home":
    case "modules":
    case "settings":
    case "permits":
    case "addons": {
      await interaction.deferUpdate();
      await interaction.editReply(
        await renderHubPanel(action, interaction, services),
      );
      return true;
    }
    case "permitpanel": {
      const panel = new PermitPanel({
        prisma: services.prisma,
        redis: services.redis,
        guildId,
        interaction,
        moduleLoader: services.moduleLoader,
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
    case "modsubs": {
      await interaction.deferUpdate();
      await interaction.editReply(
        await renderSubmodules(
          interaction,
          services,
          target,
          Number(extra) || 0,
          Number(extra2) || 0,
        ),
      );
      return true;
    }
    case "modsubtoggle": {
      await interaction.deferUpdate();
      const loaded = services.moduleLoader.getModule(target);
      if (!loaded?.supermodule) return true;

      const { originPage, childPage } = parseSubmoduleTogglePages(extra ?? "");
      const enabled = services.moduleLoader.isEnabled(guildId, target);
      if (enabled) {
        await services.moduleManager.disable(guildId, target);
      } else {
        await services.moduleManager.enable(guildId, target);
      }
      await interaction.editReply(
        await renderSubmodules(
          interaction,
          services,
          loaded.supermodule,
          originPage,
          childPage,
          `${loaded.manifest.displayName} ${enabled ? "disabled" : "enabled"}.`,
        ),
      );
      return true;
    }
    case "modtoggle": {
      await interaction.deferUpdate();
      const enabled = services.moduleLoader.isEnabled(guildId, target);
      if (enabled) {
        await services.moduleManager.disable(guildId, target);
      } else {
        await services.moduleManager.enable(guildId, target);
      }
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
      config[field.key] = !fieldValue(field, config);
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
          fieldModal(target, field, section, fieldValue(field, config)),
        );
      }
      return true;
    }
    case "modinput": {
      const field = findField(services, target, extra);
      if (!field) return true;
      const config = await readModuleConfig(services, guildId, target);
      await interaction.showModal(
        fieldModal(target, field, Number(extra2) || 0, fieldValue(field, config)),
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
    default: {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Lumi", "Unknown panel action.")),
      );
      return true;
    }
  }
}

async function handleHubModal(
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

}
