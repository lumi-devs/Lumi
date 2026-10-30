import type { ConfigField } from "@lumi/module-runtime";
import {
  AccentColors,
  type CardReply,
  createActionButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  makeCard,
  makeErrorCard,
  row,
  settingRow,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  type MessageActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { backButton, cut, type HubInteraction, panelOptions } from "./common.js";
import { fieldPages } from "./configFields.js";
import type { HubServices } from "./services.js";

const FieldsPerPage = 4;
const MaxOptions = 25;
const DefaultPrefix = ",";

type FieldValue = unknown;

export function fieldValue(field: ConfigField, config: Record<string, unknown>): FieldValue {
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

export function isSelectField(field: ConfigField): boolean {
  return Array.isArray(field.choices) && field.choices.length > 0;
}

export function isPickerField(field: ConfigField): boolean {
  return (
    field.type === "channel" ||
    field.type === "role" ||
    field.type === "multi-channel" ||
    field.type === "multi-role"
  );
}

export function isMulti(field: ConfigField): boolean {
  return field.type === "multi-channel" || field.type === "multi-role";
}

function configKeyFor(services: HubServices, moduleName: string): string {
  return moduleByName(services, moduleName)?.manifest.configKey ?? moduleName;
}

export async function readModuleConfig(
  services: HubServices,
  guildId: string,
  moduleName: string,
): Promise<Record<string, unknown>> {
  const value = await services.configService.get(guildId, configKeyFor(services, moduleName));
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export async function writeModuleConfig(
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

export function findField(services: HubServices, moduleName: string, key: string): ConfigField | undefined {
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

export async function renderModuleDetail(
  interaction: HubInteraction,
  services: HubServices,
  moduleName: string,
  pageIndex = 0,
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
  const safePage = Math.max(0, Math.min(pageIndex, total - 1));
  const page = pages[safePage] ?? { label: "General", fields: [] };
  const current = page.fields;
  const config = await readModuleConfig(services, guildId, moduleName);
  const enabled = services.moduleLoader.isEnabled(guildId, moduleName);

  const sections = current.map((field) => {
    const value = fieldValue(field, config);
    const lines = fieldLine(field, value);
    if (field.type === "boolean") {
      const isEnabled = Boolean(value);
      return settingRow(lines, {
        customId: `lumi:modbool:${moduleName}:${field.key}:${safePage}`,
        label: isEnabled ? "On" : "Off",
        style: isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary,
      });
    }
    return settingRow(lines, {
      customId: `lumi:modfield:${moduleName}:${field.key}:${safePage}`,
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
            default: index === safePage,
          })),
        }),
      ),
    );
  }

  rows.push(
    row(
      createActionButton({
        customId: `lumi:modtoggle:${moduleName}:${safePage}`,
        label: enabled ? "Disable" : "Enable",
        emoji: enabled ? "⛔" : "✅",
        style: enabled ? ButtonStyle.Danger : ButtonStyle.Success,
      }),
      createActionButton({
        customId: `lumi:modreset:${moduleName}:${safePage}`,
        label: "Reset",
        emoji: "↩️",
        style: ButtonStyle.Secondary,
      }),
      backButton("lumi:mods:0"),
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
  const configured = field.channelTypes;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured as ChannelType[];
  }
  return [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
  ];
}

export async function renderFieldEditor(
  interaction: HubInteraction,
  services: HubServices,
  moduleName: string,
  fieldKey: string,
  pageIndex: number,
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
          customId: `lumi:modpick:${moduleName}:${fieldKey}:${pageIndex}`,
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
          customId: `lumi:modpick:${moduleName}:${fieldKey}:${pageIndex}`,
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
          customId: `lumi:modpick:${moduleName}:${fieldKey}:${pageIndex}`,
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
          customId: `lumi:modinput:${moduleName}:${fieldKey}:${pageIndex}`,
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
        customId: `lumi:modclear:${moduleName}:${fieldKey}:${pageIndex}`,
        label: "Clear",
        emoji: "🧹",
        style: ButtonStyle.Secondary,
        disabled: value === undefined || value === null || value === "",
      }),
      backButton(`lumi:modopen:${moduleName}:${pageIndex}`),
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
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", loaded.manifest.displayName, field.label],
      rows,
      undefined,
      false,
    ),
  );
}

export function parseFieldInput(field: ConfigField, raw: string): FieldValue {
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Enter valid JSON.");
    }
    if (parsed === null || typeof parsed !== "object") {
      throw new Error("JSON settings must be an object or array.");
    }
    return parsed;
  }
  return value;
}

export function prefixModal(): ModalBuilder {
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

export function fieldModal(moduleName: string, field: ConfigField, pageIndex: number, value: FieldValue): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:modinput:${moduleName}:${field.key}:${pageIndex}`)
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
