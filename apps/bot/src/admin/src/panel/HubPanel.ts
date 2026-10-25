import {
  ButtonStyle,
  PermissionFlagsBits,
  type ActionRowBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  BrandColors,
  createActionButton,
  createStringSelectMenu,
  ephemeralCard,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  row,
  tabRow,
  type CardOptions,
  type CardReply,
  type Tab,
} from "@lumi/ui";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { ModuleManager } from "../services/ModuleManager.js";
import { PermitPanel } from "./PermitPanel.js";

export type HubView = "home" | "modules" | "settings" | "permits";

type HubInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction;

export interface HubServices {
  prisma: any;
  redis: any;
  moduleManager: ModuleManager;
  moduleLoader: ModuleLoader;
  config: { get(guildId: string, key: string): Promise<any> };
  permits: { listPermits(guildId: string): Promise<any[]> };
}

const TABS: Tab[] = [
  { id: "home", label: "Overview", emoji: "🏠" },
  { id: "modules", label: "Modules", emoji: "🧩" },
  { id: "settings", label: "Settings", emoji: "⚙️" },
  { id: "permits", label: "Permissions", emoji: "🔐" },
];

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function navigationRow(active: HubView): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return row(
    ...tabRow("lumi", TABS, active).components,
    createActionButton({
      customId: "lumi:close",
      label: "Close",
      style: ButtonStyle.Danger,
    }),
  );
}

function panelOptions(
  interaction: HubInteraction,
  active: HubView,
  title: string,
  extraRows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [],
  footer?: string,
): CardOptions {
  return {
    breadcrumbs: ["Lumi", title],
    statusBadge: { status: "online" },
    thumbnailUrl: interaction.guild?.iconURL({ size: 128 }) ?? undefined,
    footer: footer ?? `Requested by ${interaction.user.tag}`,
    actionRows: [navigationRow(active), ...extraRows],
    separatorAboveActionRows: true,
  };
}

function closeRow(): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return row(closeButton());
}

function closeButton() {
  return createActionButton({
    customId: "lumi:close",
    label: "Close",
    style: ButtonStyle.Danger,
    emoji: "✖️",
  });
}

async function readSettings(
  services: HubServices,
  guildId: string,
): Promise<Record<string, any>> {
  const raw = await services.config.get(guildId, "settings");
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, any>)
    : {};
}

function displaySetting(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return JSON.stringify(value).slice(0, 100);
  return String(value);
}

async function readSetting(
  services: HubServices,
  guildId: string,
  settings: Record<string, any>,
  key: string,
  fallback: string,
): Promise<string> {
  const value =
    settings[key] !== undefined
      ? settings[key]
      : await services.config.get(guildId, key);
  return displaySetting(value, fallback);
}

async function renderHome(interaction: HubInteraction, services: HubServices): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const client = interaction.client;
  const modules = services.moduleLoader.listGlobal();
  const enabled = modules.filter((m) => services.moduleLoader.isEnabled(guildId, m.name)).length;
  const members =
    interaction.guild?.memberCount ??
    client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0);
  const settings = await readSettings(services, guildId);
  const prefix = await readSetting(services, guildId, settings, "prefix", "!");

  const body = [
    `**Modules:** ${enabled} / ${modules.length} enabled`,
    `**Guilds:** ${client.guilds.cache.size} · **Members:** ${members}`,
    `**Latency:** ${Math.max(0, Math.round(client.ws.ping))}ms · **Uptime:** ${formatDuration(client.uptime ?? 0)}`,
    `**Prefix:** \`${prefix}\``,
  ];

  return makeCard(BrandColors.primary, client.user?.username ?? "Lumi", body, {
    ...panelOptions(interaction, "home", "Overview"),
    subtitle: "Control Panel",
  });
}

async function renderModules(
  interaction: HubInteraction,
  services: HubServices,
  notice?: string,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const modules = services.moduleLoader.listGlobal().map((m) => ({
    ...m,
    enabled: services.moduleLoader.isEnabled(guildId, m.name),
  }));
  const enabledCount = modules.filter((m) => m.enabled).length;
  const opts = {
    ...panelOptions(interaction, "modules", "Modules", [closeRow()]),
    subtitle: `${enabledCount} of ${modules.length} enabled`,
  };

  if (modules.length === 0) {
    return makeEmptyCard(
      "Modules",
      "No modules are installed on this bot.",
      "Add a module directory under `modules/` and restart the bot.",
      opts,
    );
  }

  const lines = modules.map(
    (m) =>
      `${m.enabled ? "🟢" : "⚪"} **${m.displayName || m.name}** \`${m.name}\` — ${m.description}`,
  );
  const body = [notice ? `**${notice}**` : undefined, ...lines]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const select = createStringSelectMenu({
    customId: "lumi:module",
    placeholder: "Select a module to enable or disable",
    options: modules.slice(0, 25).map((m) => ({
      label: (m.displayName || m.name).slice(0, 100),
      value: m.name,
      description: `${m.enabled ? "Enabled" : "Disabled"} · ${m.description}`.slice(0, 100),
      ...(m.emoji ? { emoji: m.emoji } : {}),
    })),
  });

  return makeCard(BrandColors.primary, "Modules", body, {
    ...opts,
    actionRows: [
      navigationRow("modules"),
      row(select),
      row(
        createActionButton({
          customId: "module_open",
          label: "Advanced",
          style: ButtonStyle.Secondary,
          emoji: "🛠️",
        }),
        closeButton(),
      ),
    ],
  });
}

async function renderSettings(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const settings = await readSettings(services, guildId);
  const prefix = await readSetting(services, guildId, settings, "prefix", "!");
  const keys = Object.keys(settings);
  const keyList = keys.length
    ? keys
        .slice(0, 15)
        .map((key) => `\`${key}\``)
        .join(", ")
    : "*none*";

  const body = [
    `**Prefix:** \`${prefix}\``,
    `**Stored keys:** ${keyList}`,
  ];

  return makeCard(BrandColors.primary, "Settings", body, {
    ...panelOptions(interaction, "settings", "Settings", [
      row(
        createActionButton({
          customId: "settings_open",
          label: "Edit Settings",
          style: ButtonStyle.Primary,
          emoji: "✏️",
        }),
        closeButton(),
      ),
    ]),
    subtitle: "Guild configuration",
  });
}

async function renderPermits(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const permits = await services.permits.listPermits(guildId);
  const opts = panelOptions(
    interaction,
    "permits",
    "Permissions",
    [
      row(
        createActionButton({
          customId: "lumi:permitpanel",
          label: "Open Permit Panel",
          style: ButtonStyle.Primary,
          emoji: "🔐",
        }),
        closeButton(),
      ),
    ],
    "Read-only view · Use the permit panel to create, edit, or assign permits",
  );

  if (permits.length === 0) {
    return makeEmptyCard(
      "Permits",
      "No permits are configured for this server.",
      "Create one with `/permit create` or open the permit panel.",
      opts,
    );
  }

  const items = permits.map(
    (permit) =>
      `${permit.polarity === "DENY" ? "⛔" : "✅"} **${permit.name}** · \`${permit.node}\` · pos ${permit.position}${permit.builtin ? " · builtin" : ""}`,
  );

  return makeListCard("Permissions", items, {
    ...opts,
    subtitle: `${permits.length} configured`,
  });
}

function closeCard(): CardReply {
  return makeInfoCard("Lumi", "Control panel closed.", {
    statusBadge: { status: "inactive", label: "CLOSED" },
    footer: "Run `/lumi` to reopen",
  });
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
        return renderModules(interaction, services, notice);
      case "settings":
        return renderSettings(interaction, services);
      case "permits":
        return renderPermits(interaction, services);
      case "home":
      default:
        return renderHome(interaction, services);
    }
  }

  static async handleInteraction(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
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

    const ownerId =
      interaction.message.interactionMetadata?.user.id ??
      interaction.message.interaction?.user.id;
    if (ownerId !== interaction.user.id) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Lumi", "This panel belongs to another user.", {
            footer: "Run `/lumi` to open your own panel",
          }),
        ),
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

    const action = interaction.customId.split(":")[1];

    if (action === "close") {
      await interaction.update(closeCard());
      return true;
    }

    if (action === "permitpanel") {
      const panel = new PermitPanel({
        prisma: services.prisma,
        redis: services.redis,
        guildId,
        interaction,
      });
      await panel.render();
      return true;
    }

    if (action === "module") {
      if (!interaction.isStringSelectMenu()) return true;
      const moduleName = interaction.values[0];
      if (!moduleName) return true;
      await interaction.deferUpdate();

      const known = services.moduleLoader
        .listGlobal()
        .some((module) => module.name === moduleName);
      if (!known) {
        await interaction.editReply(
          makeErrorCard("Modules", `Unknown module \`${moduleName}\`.`, {
            ...panelOptions(interaction, "modules", "Modules", [closeRow()]),
          }),
        );
        return true;
      }

      const enabled = services.moduleLoader.isEnabled(guildId, moduleName);
      if (enabled) {
        await services.moduleManager.disable(guildId, moduleName);
      } else {
        await services.moduleManager.enable(guildId, moduleName);
      }

      await interaction.editReply(
        await renderModules(
          interaction,
          services,
          `Module \`${moduleName}\` ${enabled ? "disabled" : "enabled"}.`,
        ),
      );
      return true;
    }

    if (action === "home" || action === "modules" || action === "settings" || action === "permits") {
      await interaction.deferUpdate();
      await interaction.editReply(await HubPanel.render(action, interaction, services));
      return true;
    }

    await interaction.reply(
      ephemeralCard(makeErrorCard("Lumi", "Unknown panel action.")),
    );
    return true;
  }
}
