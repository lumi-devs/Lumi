import type { ConfigField } from "@lumi/module-runtime";
import {
  type CardReply,
  createActionButton,
  createStringSelectMenu,
  makeCard,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  backButton,
  cut,
  type HubInteraction,
  panelOptions,
} from "./common.js";

const DefaultActions = ["timeout", "kick", "ban", "quarantine"] as const;
const DefaultTimeoutSeconds = 60;
const DefaultDraftMinutes = 10;
const MaxSelectOptions = 25;
const MaxDurationMinutes = 40_320;

export interface EscalationEntry {
  count: number;
  action: string;
  duration: number | null;
}

export function escalationActions(field: ConfigField): string[] {
  return field.choices?.length ? [...field.choices] : [...DefaultActions];
}

export function escalationEntries(
  value: unknown,
  actions: readonly string[],
): EscalationEntry[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }

  const entries = new Map<number, EscalationEntry>();
  for (const [key, raw] of Object.entries(value)) {
    const count = Number(key);
    if (!Number.isInteger(count) || count < 1) continue;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    if (!("action" in raw) || typeof raw.action !== "string") continue;
    if (!actions.includes(raw.action)) continue;
    const seconds =
      raw.action === "timeout" &&
      "duration" in raw &&
      typeof raw.duration === "number" &&
      Number.isFinite(raw.duration)
        ? Math.max(DefaultTimeoutSeconds, Math.floor(raw.duration))
        : null;
    entries.set(count, {
      count,
      action: raw.action,
      duration:
        raw.action === "timeout" ? (seconds ?? DefaultTimeoutSeconds) : null,
    });
  }
  return [...entries.values()].sort((a, b) => a.count - b.count);
}

export function serializeEscalation(
  entries: readonly EscalationEntry[],
  actions: readonly string[],
): Record<string, { action: string; duration: number | null }> {
  const output: Record<string, { action: string; duration: number | null }> =
    {};
  for (const entry of [...entries].sort((a, b) => a.count - b.count)) {
    if (
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 1000 ||
      !actions.includes(entry.action)
    ) {
      continue;
    }
    output[String(entry.count)] = {
      action: entry.action,
      duration:
        entry.action === "timeout"
          ? Math.max(
              DefaultTimeoutSeconds,
              Math.floor(entry.duration ?? DefaultTimeoutSeconds),
            )
          : null,
    };
  }
  return output;
}

export function upsertEscalation(
  entries: readonly EscalationEntry[],
  next: EscalationEntry,
): EscalationEntry[] {
  return [...entries.filter((entry) => entry.count !== next.count), next].sort(
    (a, b) => a.count - b.count,
  );
}

export function escalationSummary(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "No rules";
  }
  const rules = Object.entries(value).filter(([key, raw]) => {
    const count = Number(key);
    return (
      Number.isInteger(count) &&
      count > 0 &&
      typeof raw === "object" &&
      raw !== null &&
      "action" in raw &&
      typeof raw.action === "string"
    );
  });
  return rules.length === 0
    ? "No rules"
    : `${rules.length} rule${rules.length === 1 ? "" : "s"}`;
}

function actionLabel(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatEntry(entry: EscalationEntry): string {
  const duration =
    entry.action === "timeout" && entry.duration
      ? ` · ${Math.round(entry.duration / 60)} min`
      : "";
  return `**${entry.count} warning${entry.count === 1 ? "" : "s"}** → ${actionLabel(entry.action)}${duration}`;
}

export function nextEscalationCount(
  entries: readonly EscalationEntry[],
): number {
  const used = new Set(entries.map((entry) => entry.count));
  let count = 3;
  while (used.has(count)) count++;
  return count;
}

export function parseEscalationDraft(
  rawCount: string,
  rawAction: string,
  rawDuration: string,
  actions: readonly string[],
): EscalationEntry {
  const count = Number(rawCount.trim());
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error("Warning count must be a whole number between 1 and 1000.");
  }
  const action = rawAction.trim().toLowerCase();
  if (!actions.includes(action)) {
    throw new Error(`Action must be one of: ${actions.join(", ")}.`);
  }
  if (action !== "timeout") {
    return { count, action, duration: null };
  }
  const minutes = Number(rawDuration.trim());
  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > MaxDurationMinutes
  ) {
    throw new Error(
      `Timeout duration must be a whole number of minutes between 1 and ${MaxDurationMinutes}.`,
    );
  }
  return { count, action, duration: minutes * 60 };
}

export function parseEscalationCount(raw: string): number {
  const count = Number(raw.trim());
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error("Warning count must be a whole number between 1 and 1000.");
  }
  return count;
}

export function renderEscalationEditor(
  interaction: HubInteraction,
  field: ConfigField,
  moduleName: string,
  pageIndex: number,
  value: unknown,
  notice?: string,
): CardReply {
  const actions = escalationActions(field);
  const entries = escalationEntries(value, actions);
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (entries.length > 0) {
    rows.push(
      row(
        createStringSelectMenu({
          customId: `lumi:escedit:${moduleName}:${field.key}:${pageIndex}`,
          placeholder: "Edit an escalation rule…",
          options: entries.slice(0, MaxSelectOptions).map((entry) => ({
            label: cut(formatEntry(entry).replace(/\*\*/g, ""), 100),
            value: String(entry.count),
          })),
        }),
      ),
    );
  }

  rows.push(
    row(
      createActionButton({
        customId: `lumi:escnew:${moduleName}:${field.key}:${pageIndex}`,
        label: "Add rule",
        emoji: "➕",
        style: ButtonStyle.Primary,
      }),
      createActionButton({
        customId: `lumi:escremove:${moduleName}:${field.key}:${pageIndex}`,
        label: "Remove rule",
        emoji: "🗑️",
        style: ButtonStyle.Secondary,
        disabled: entries.length === 0,
      }),
      backButton(`lumi:modopen:${moduleName}:${pageIndex}`),
    ),
  );

  return makeCard(
    undefined,
    `${field.label}`,
    [
      ...(notice ? [`**${notice}**`] : []),
      ...(field.description ? [`-# ${field.description}`] : []),
      ...(entries.length > 0
        ? entries.map(formatEntry)
        : ["No escalation rules configured. Add one below."]),
      `-# Warnings are counted from active moderation cases.`,
    ],
    panelOptions(
      interaction,
      "modules",
      ["Hub", "Modules", moduleName, field.label],
      rows,
      undefined,
      false,
    ),
  );
}

export function escalationModal(
  field: ConfigField,
  moduleName: string,
  pageIndex: number,
  entry?: EscalationEntry,
  defaultCount = 3,
): ModalBuilder {
  const actions = escalationActions(field);
  const action = entry?.action ?? actions[0] ?? "timeout";
  const minutes = entry?.duration
    ? Math.max(1, Math.round(entry.duration / 60))
    : DefaultDraftMinutes;
  const original = entry?.count ?? "new";

  return new ModalBuilder()
    .setCustomId(
      `lumi:escsave:${moduleName}:${field.key}:${pageIndex}:${original}`,
    )
    .setTitle(
      cut(entry ? "Edit warning escalation" : "Add warning escalation", 45),
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("count")
          .setLabel("Warning count")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setValue(String(entry?.count ?? defaultCount)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("action")
          .setLabel(`Action (${actions.join("/")})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setValue(action),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("duration")
          .setLabel("Timeout duration (minutes)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(5)
          .setPlaceholder("Only used for timeout")
          .setValue(action === "timeout" ? String(minutes) : ""),
      ),
    );
}

export function escalationRemoveModal(
  field: ConfigField,
  moduleName: string,
  pageIndex: number,
  entries: readonly EscalationEntry[],
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`lumi:escremove:${moduleName}:${field.key}:${pageIndex}`)
    .setTitle("Remove warning escalation")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("count")
          .setLabel("Warning count to remove")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(4)
          .setPlaceholder(
            entries.map((entry) => entry.count).join(", ") || "No rules",
          ),
      ),
    );
}
