import type { EvaluatedPermit, PermitTierExplanation } from "@lumi/permits";
import { AccentColors, type CardReply, makeCard } from "@lumi/ui";
import type {
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
} from "discord.js";

function verdictIcon(verdict: PermitTierExplanation["verdict"]): string {
  if (verdict === "allow") return "✅";
  if (verdict === "deny") return "❌";
  return "➡️";
}

function verdictLabel(verdict: PermitTierExplanation["verdict"]): string {
  if (verdict === "allow") return "Allowed";
  if (verdict === "deny") return "Denied";
  return "Passed";
}

interface ExplanationCardOptions {
  userId: string;
  node: string;
  channelId: string | undefined;
  actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

interface AllExplanationCardOptions {
  userId: string;
  actionRows: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

const TextLimit = 3900;

const clipText = (text: string): string =>
  text.length > TextLimit ? `${text.slice(0, TextLimit - 1)}…` : text;

const formatNodeList = (nodes: string[]): string =>
  nodes.map((node) => `\`${node}\``).join(" · ");

export function explanationCard(
  result: EvaluatedPermit,
  options: ExplanationCardOptions,
): CardReply {
  const rows =
    result.rows.length === 0
      ? ["-# No matching permit tiers."]
      : result.rows
          .slice(0, 20)
          .map(
            (tier) =>
              `${verdictIcon(tier.verdict)} **${tier.tier}** — ${verdictLabel(tier.verdict)}${
                tier.detail ? ` · ${tier.detail}` : ""
              }`,
          );
  if (result.rows.length > 20) {
    rows.push(`-# ...and ${result.rows.length - 20} more tier(s).`);
  }

  const body = [
    `**Member** <@${options.userId}>`,
    `**Node** \`${options.node}\``,
    options.channelId === undefined
      ? ""
      : `**Channel** <#${options.channelId}>`,
    `**Result** ${result.allowed ? "✅ Allowed" : "❌ Denied"}`,
    "",
    rows.join("\n"),
  ].filter((line) => line.length > 0);

  return makeCard(
    result.allowed ? AccentColors.success : AccentColors.error,
    "Permission Check",
    body,
    {
      breadcrumbs: ["Admin", "Permits", "Explain"],
      footer: `${options.node} · <@${options.userId}>`,
      actionRows: options.actionRows,
    },
  );
}

export function allExplanationCard(
  results: Map<string, EvaluatedPermit>,
  options: AllExplanationCardOptions,
): CardReply {
  const allowed: string[] = [];
  const denied: string[] = [];
  const passed: string[] = [];

  for (const [node, result] of results) {
    if (result.allowed) {
      allowed.push(node);
    } else if (result.rows.some((tier) => tier.verdict === "deny")) {
      denied.push(node);
    } else {
      passed.push(node);
    }
  }

  const body = [
    clipText(
      `**Member** <@${options.userId}>\n` +
        `**Summary** ✅ ${allowed.length} allowed · ❌ ${denied.length} denied · ➡️ ${passed.length} no explicit permit`,
    ),
    allowed.length > 0
      ? clipText(`### ✅ Allowed\n${formatNodeList(allowed)}`)
      : null,
    denied.length > 0
      ? clipText(`### ❌ Denied\n${formatNodeList(denied)}`)
      : null,
    passed.length > 0
      ? clipText(`### ➡️ No explicit permit\n${formatNodeList(passed)}`)
      : null,
  ].filter((part): part is string => part !== null);

  return makeCard(undefined, "Permission Check", body, {
    breadcrumbs: ["Admin", "Permits", "Explain"],
    footer: `${results.size} node(s) evaluated · <@${options.userId}>`,
    actionRows: options.actionRows,
  });
}
