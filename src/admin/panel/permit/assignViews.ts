import { ButtonStyle } from "discord.js";
import {
  buildSafeActionRows,
  createActionButton,
  createChannelSelectMenu,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  makeCard,
  row,
  type CardReply,
} from "@lumi/ui";
import type { AssignFlow, ExplainFlow } from "../../permits/flows.js";
import { formatPermitNodeLines } from "../../permits/nodes.js";
import {
  polarityIcon,
  targetMention,
  targetTypeLabel,
} from "../../permits/format.js";
import type { PermitCardContext } from "./host.js";

export function explainCard(flow: ExplainFlow): CardReply {
  const actionRows = buildSafeActionRows([
    row(
      createUserSelectMenu({
        customId: "permit_explain_user",
        placeholder: "Member to check",
        minValues: 1,
        maxValues: 1,
      }),
    ),
    row(
      createActionButton({
        customId: "permit_explain_run",
        label: "Run Check",
        style: ButtonStyle.Primary,
        emoji: "🔍",
        disabled: flow.userId === undefined,
      }),
      createActionButton({
        customId: "permit_back_main",
        label: "Back to List",
        style: ButtonStyle.Secondary,
        emoji: "⬅️",
      }),
    ),
  ]);

  return makeCard(
    undefined,
    "Explain Permission Check",
    [
      `**Member** ${flow.userId === undefined ? "*not selected*" : `<@${flow.userId}>`}`,
      "-# Pick a member to evaluate every permission node at once.",
    ],
    {
      breadcrumbs: ["Admin", "Permits", "Explain"],
      footer: "All nodes",
      actionRows,
    },
  );
}

export async function assignCard(
  context: PermitCardContext,
  flow: AssignFlow,
): Promise<CardReply> {
  const permit = await context.permitRepo.getPermit(context.guildId, flow.permitId);
  if (!permit) return context.missingPermitCard();

  const targetRow =
    flow.targetType === "USER" || permit.builtin
      ? row(
          createUserSelectMenu({
            customId: "permit_assign_target",
            placeholder: "Select a member",
            minValues: 1,
            maxValues: 1,
          }),
        )
      : flow.targetType === "ROLE"
        ? row(
            createRoleSelectMenu({
              customId: "permit_assign_target",
              placeholder: "Select a role",
              minValues: 1,
              maxValues: 1,
            }),
          )
        : row(
            createChannelSelectMenu({
              customId: "permit_assign_target",
              placeholder: "Select a channel",
              minValues: 1,
              maxValues: 1,
            }),
          );

  return makeCard(
    undefined,
    `Assign #${permit.number} ${permit.name}`,
    [
      `**Nodes**\n${formatPermitNodeLines(permit.nodes, 5)}`,
      `**Polarity** ${polarityIcon(permit.polarity)} ${permit.polarity}`,
      ...(permit.builtin
        ? ["-# Built-in permits can only be assigned to users."]
        : [
            `**Target type** ${targetTypeLabel(flow.targetType)}`,
            "-# Pick a target type, then select the target. Expiry is chosen next.",
          ]),
    ],
    {
      breadcrumbs: ["Admin", "Permits", permit.name, "Assign"],
      footer: "Selection-based assignment",
      actionRows: buildSafeActionRows([
        ...(permit.builtin
          ? []
          : [
              row(
                createStringSelectMenu({
                  customId: "permit_assign_type",
                  placeholder: "Target type",
                  options: [
                    {
                      label: "User",
                      value: "USER",
                      description: "Assign to one member",
                      emoji: "👤",
                      default: flow.targetType === "USER",
                    },
                    {
                      label: "Role",
                      value: "ROLE",
                      description: "Assign to everyone with a role",
                      emoji: "🎭",
                      default: flow.targetType === "ROLE",
                    },
                    {
                      label: "Channel",
                      value: "CHANNEL",
                      description: "Assign inside one channel",
                      emoji: "#️⃣",
                      default: flow.targetType === "CHANNEL",
                    },
                  ],
                }),
              ),
            ]),
        targetRow,
        row(
          createActionButton({
            customId: `permit_view:${permit.id}`,
            label: "Back to Permit",
            style: ButtonStyle.Secondary,
            emoji: "⬅️",
          }),
        ),
      ]),
    },
  );
}

export async function assignExpiryCard(
  context: PermitCardContext,
  flow: AssignFlow,
): Promise<CardReply> {
  const permit = await context.permitRepo.getPermit(context.guildId, flow.permitId);
  if (!permit) return context.missingPermitCard();
  if (flow.targetId === undefined) return assignCard(context, flow);

  return makeCard(
    undefined,
    `Assign #${permit.number} ${permit.name}`,
    [
      `**Target** ${targetMention(flow.targetType, flow.targetId)}`,
      `**Nodes**\n${formatPermitNodeLines(permit.nodes, 5)}`,
      `**Polarity** ${polarityIcon(permit.polarity)} ${permit.polarity}`,
      "-# Select when this assignment should expire.",
    ],
    {
      breadcrumbs: ["Admin", "Permits", permit.name, "Assign"],
      footer: "Final step",
      actionRows: buildSafeActionRows([
        row(
          createStringSelectMenu({
            customId: "permit_assign_expiry",
            placeholder: "Expiry",
            options: [
              {
                label: "Never",
                value: "never",
                description: "Keep this assignment until removed",
              },
              {
                label: "1 hour",
                value: "1h",
                description: "Expire after one hour",
              },
              {
                label: "1 day",
                value: "1d",
                description: "Expire after one day",
              },
              {
                label: "7 days",
                value: "7d",
                description: "Expire after one week",
              },
              {
                label: "30 days",
                value: "30d",
                description: "Expire after thirty days",
              },
            ],
          }),
        ),
        row(
          createActionButton({
            customId: `permit_view:${permit.id}`,
            label: "Back to Permit",
            style: ButtonStyle.Secondary,
            emoji: "⬅️",
          }),
        ),
      ]),
    },
  );
}
