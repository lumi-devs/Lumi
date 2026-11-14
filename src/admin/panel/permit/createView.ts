import {
  buildSafeActionRows,
  type CardReply,
  createActionButton,
  createStringSelectMenu,
  makeCard,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";
import type { CreateFlow } from "../../permits/flows.js";
import { polarityIcon } from "../../permits/format.js";
import {
  formatPermitNodeLines,
  namespaceLabel,
  nodeDescription,
  nodesInNamespace,
  permitNamespaces,
  suggestPermitName,
} from "../../permits/nodes.js";
import { backButton } from "../common.js";
import type { PermitCardContext } from "./host.js";

const SelectOptionLimit = 25;

export async function createCard(
  context: PermitCardContext,
  flow: CreateFlow,
): Promise<CardReply> {
  const nodes = await context.creatableNodeCatalog();
  const namespaces = permitNamespaces(nodes);
  const available = nodesInNamespace(nodes, flow.namespace);
  const selectedNodes = flow.nodes.slice(0, SelectOptionLimit);
  const suggestedName = suggestPermitName(flow.nodes, flow.polarity);

  const actionRows = buildSafeActionRows([
    row(
      createStringSelectMenu({
        customId: "permit_create_namespace",
        placeholder: "Permission namespace",
        options: namespaces.map((namespace) => ({
          label: namespaceLabel(namespace),
          value: namespace,
          description: `${nodesInNamespace(nodes, namespace).length} node(s)`,
          default: namespace === flow.namespace,
        })),
      }),
    ),
    row(
      createStringSelectMenu({
        customId: "permit_create_node",
        placeholder: "Permission nodes (select one or more)",
        minValues: 1,
        maxValues: Math.max(1, available.slice(0, SelectOptionLimit).length),
        options: available.slice(0, SelectOptionLimit).map((node) => ({
          label: node,
          value: node,
          description: nodeDescription(node),
          default: flow.nodes.includes(node),
        })),
      }),
    ),
    ...(selectedNodes.length > 0
      ? [
          row(
            createStringSelectMenu({
              customId: "permit_create_node_remove",
              placeholder: "Remove nodes from this permit",
              minValues: 1,
              maxValues: Math.max(1, selectedNodes.length),
              options: selectedNodes.map((node) => ({
                label: node,
                value: node,
                description: "Remove from this permit",
                emoji: "🗑️",
              })),
            }),
          ),
        ]
      : []),
    row(
      createStringSelectMenu({
        customId: "permit_create_polarity",
        placeholder: "Polarity",
        options: [
          {
            label: "Grant",
            value: "Grant",
            description: "Allow these permission nodes",
            emoji: "✅",
            default: flow.polarity === "Grant",
          },
          {
            label: "Deny",
            value: "Deny",
            description: "Block these permission nodes",
            emoji: "⛔",
            default: flow.polarity === "Deny",
          },
        ],
      }),
    ),
    row(
      createActionButton({
        customId: "permit_create_submit",
        label: "Create Permit",
        style: ButtonStyle.Success,
        emoji: "✅",
        disabled: flow.nodes.length === 0,
      }),
      createActionButton({
        customId: "permit_create_name",
        label: "Name",
        style: ButtonStyle.Secondary,
        emoji: "✏️",
        disabled: flow.nodes.length === 0,
      }),
      createActionButton({
        customId: "permit_create_clear",
        label: "Clear",
        style: ButtonStyle.Secondary,
        emoji: "🧹",
        disabled: flow.nodes.length === 0,
      }),
      backButton("permit_back_main", "Back to List"),
    ),
  ]);

  return makeCard(
    undefined,
    "Create Permit",
    [
      `**Namespace** ${namespaceLabel(flow.namespace)}`,
      ...(flow.nodes.length === 0
        ? ["**Nodes** *not selected*"]
        : [`**Nodes**\n${formatPermitNodeLines(flow.nodes, 10)}`]),
      `**Polarity** ${polarityIcon(flow.polarity)} ${flow.polarity}`,
      `**Name** ${
        flow.name ??
        (suggestedName.length > 0
          ? `${suggestedName} *(suggested)*`
          : "*not set*")
      }`,
      "-# One permit can hold multiple nodes. Selections accumulate across namespaces.",
    ],
    {
      breadcrumbs: ["Admin", "Permits", "Create"],
      footer: "Select multiple nodes for one permit",
      actionRows,
    },
  );
}
