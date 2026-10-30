import {
  type CardReply,
  createActionButton,
  makeCard,
  row,
  settingRow,
} from "@lumi/ui";
import {
  type ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { formatPermitNodes } from "../permits/nodes.js";
import { renderAddonPanel } from "./addonViews.js";
import {
  type HubInteraction,
  type HubView,
  navigationRow,
  panelOptions,
} from "./common.js";
import { renderModules } from "./moduleList.js";
import type { HubServices } from "./services.js";

const DefaultPrefix = ",";

function currentPrefix(settings: Record<string, unknown>): string {
  return typeof settings.prefix === "string" && settings.prefix.length > 0
    ? settings.prefix
    : DefaultPrefix;
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
  const prefix = currentPrefix(settings);
  const members =
    interaction.guild?.memberCount ??
    interaction.guild?.members.cache.size ??
    0;

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
    panelOptions(
      interaction,
      "home",
      ["Hub"],
      [],
      "Select a tab below to continue.",
    ),
  );
}

export async function renderSettings(
  interaction: HubInteraction,
  services: HubServices,
): Promise<CardReply> {
  const guildId = interaction.guildId!;
  const settings = await services.configService.getAll(guildId);
  const prefix = currentPrefix(settings);
  const enforcePermits = settings.enforcePermits === true;
  const otherKeys = Object.keys(settings).filter(
    (key) => key !== "prefix" && key !== "enforcePermits",
  );

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
    settingRow(
      [
        `🛡️ **Enforce Permits** — ${enforcePermits ? "On" : "Off"}`,
        "-# When on, Administrator and Manage Server no longer bypass permits.",
      ],
      {
        customId: "lumi:toggleenforce",
        label: enforcePermits ? "On" : "Off",
        style: enforcePermits ? ButtonStyle.Success : ButtonStyle.Secondary,
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
      ...panelOptions(
        interaction,
        "settings",
        ["Hub", "Settings"],
        rows,
        "Guild configuration",
      ),
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
    panelOptions(
      interaction,
      "permits",
      ["Hub", "Permissions"],
      rows,
      `${permits.length} permit(s)`,
      false,
    ),
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
