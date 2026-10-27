import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  PermitRepository,
  isBotOwner,
  type Permit,
  type PermitTargetType,
  type Polarity,
} from "@lumi/permits";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { PrismaClient } from "@lumi/db";
import {
  AccentColors,
  buildSafeActionRows,
  confirmRow,
  createActionButton,
  createChannelSelectMenu,
  createPaginationRow,
  createRoleSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  ephemeralCard,
  formatPageFooter,
  makeCard,
  makeEmptyCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  row,
  type CardReply,
} from "@lumi/ui";
import {
  collectPermitNodes,
  formatPermitNodeLines,
  formatPermitNodes,
  isValidNode,
  namespaceForNode,
  namespaceLabel,
  nodesInNamespace,
  nodeDescription,
  parseNodeList,
  permitNamespaces,
  suggestPermitName,
} from "../permits/nodes.js";
import { allExplanationCard } from "../permits/explain.js";
import { uniquePermitName } from "../permits/names.js";

interface PermitPanelOptions {
  prisma: PrismaClient;
  redis: any;
  guildId: string;
  interaction: any;
  moduleLoader: ModuleLoader;
}

type PermitWithAssignments = Permit & { assignments?: { id: number }[] };

interface AssignmentRecord {
  targetType: PermitTargetType;
  targetId: string;
  grantedBy: string;
  expiresAt: Date | null;
}

type CreateFlow = {
  kind: "create";
  namespace: string;
  nodes: string[];
  polarity: Polarity;
  name: string | undefined;
};

type ExplainFlow = {
  kind: "explain";
  userId: string | undefined;
};

type AssignFlow = {
  kind: "assign";
  permitId: number;
  targetType: PermitTargetType;
  targetId: string | undefined;
};

type PermitFlow = CreateFlow | ExplainFlow | AssignFlow;

interface StoredFlow {
  flow: PermitFlow;
  updatedAt: number;
}

const PermitPageSize = 6;
const ReorderPageSize = 3;
const AssignmentPreviewLimit = 10;
const SelectOptionLimit = 25;
const ConditionPreviewLimit = 900;
const FlowTtlMs = 30 * 60 * 1000;
const flows = new Map<string, StoredFlow>();

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;

const formatTimestamp = (value: Date | string): string =>
  `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>`;

const targetTypeLabel = (targetType: PermitTargetType): string => {
  if (targetType === "USER") return "User";
  if (targetType === "ROLE") return "Role";
  return "Channel";
};

const targetMention = (
  targetType: PermitTargetType,
  targetId: string,
): string => {
  if (targetType === "USER") return `<@${targetId}>`;
  if (targetType === "ROLE") return `<@&${targetId}>`;
  return `<#${targetId}>`;
};

const polarityIcon = (polarity: Polarity): string =>
  polarity === "Grant" ? "✅" : "⛔";

const defaultNamespace = (nodes: string[]): string => {
  const namespaces = permitNamespaces(nodes);
  if (namespaces.includes("mod")) return "mod";
  return namespaces[0]!;
};

const expiryFromValue = (value: string): Date | null | undefined => {
  const now = Date.now();
  if (value === "never") return null;
  if (value === "1h") return new Date(now + 60 * 60 * 1000);
  if (value === "1d") return new Date(now + 24 * 60 * 60 * 1000);
  if (value === "7d") return new Date(now + 7 * 24 * 60 * 60 * 1000);
  if (value === "30d") return new Date(now + 30 * 24 * 60 * 60 * 1000);
  return undefined;
};

export class PermitPanel {
  private prisma: PrismaClient;
  private redis: any;
  private guildId: string;
  private interaction: any;
  private moduleLoader: ModuleLoader;
  private permitRepo: PermitRepository;

  constructor(options: PermitPanelOptions) {
    this.prisma = options.prisma;
    this.redis = options.redis;
    this.guildId = options.guildId;
    this.interaction = options.interaction;
    this.moduleLoader = options.moduleLoader;
    this.permitRepo = new PermitRepository(this.prisma, this.redis);
  }

  async render(): Promise<void> {
    await this.interaction.update(await this.mainCard(0));
  }

  private isExtraOwnerPermit(permit: Pick<Permit, "nodes">): boolean {
    return permit.nodes.includes("*");
  }

  private canManageExtraOwnerPermit(permit: Pick<Permit, "nodes">): boolean {
    return !this.isExtraOwnerPermit(permit) || isBotOwner(this.interaction.user.id);
  }

  private extraOwnerError(): CardReply {
    return makeErrorCard(
      "Extra Owner",
      "Only bot owners can create, edit, assign, or delete a permit with `*`.",
      {
        breadcrumbs: ["Admin", "Permits"],
        actionRows: buildSafeActionRows([
          row(
            createActionButton({
              customId: "permit_back_main",
              label: "Back to List",
              style: ButtonStyle.Secondary,
              emoji: "⬅️",
            }),
          ),
        ]),
      },
    );
  }

  private flowKey(): string {
    return `${this.interaction.message.id}:${this.interaction.user.id}`;
  }

  private clearFlow(): void {
    flows.delete(this.flowKey());
  }

  private pruneFlows(): void {
    const now = Date.now();
    for (const [key, stored] of flows) {
      if (now - stored.updatedAt > FlowTtlMs) flows.delete(key);
    }
  }

  private setFlow(flow: PermitFlow, key = this.flowKey()): void {
    this.pruneFlows();
    flows.set(key, { flow, updatedAt: Date.now() });
  }

  private getFlow(key = this.flowKey()): PermitFlow | undefined {
    const stored = flows.get(key);
    if (stored === undefined) return undefined;
    if (Date.now() - stored.updatedAt > FlowTtlMs) {
      flows.delete(key);
      return undefined;
    }
    return stored.flow;
  }

  private async nodeCatalog(): Promise<string[]> {
    const permits = await this.permitRepo.listPermits(this.guildId);
    return collectPermitNodes(
      this.moduleLoader,
      permits.flatMap((permit) => permit.nodes),
    );
  }

  private async creatableNodeCatalog(): Promise<string[]> {
    const nodes = await this.nodeCatalog();
    if (isBotOwner(this.interaction.user.id)) return nodes;
    return nodes.filter((node) => node !== "*");
  }

  private async mainCard(page: number): Promise<CardReply> {
    const permits = (await this.permitRepo.listPermits(
      this.guildId,
    )) as PermitWithAssignments[];

    if (permits.length === 0) {
      return makeEmptyCard(
        "No permits yet",
        "This server has no permits configured.",
        "Create a permit with the button below.",
        {
          breadcrumbs: ["Admin", "Permits"],
          actionRows: buildSafeActionRows([
            row(
              createActionButton({
                customId: "permit_create",
                label: "Create Permit",
                style: ButtonStyle.Primary,
                emoji: "➕",
              }),
              createActionButton({
                customId: "permit_explain",
                label: "Explain Check",
                style: ButtonStyle.Secondary,
                emoji: "🔍",
              }),
            ),
          ]),
          footer: "0 permits",
        },
      );
    }

    const builtinCount = permits.filter((permit) => permit.builtin).length;
    const totalPages = Math.max(1, Math.ceil(permits.length / PermitPageSize));
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = currentPage * PermitPageSize;
    const visible = permits.slice(start, start + PermitPageSize);

    const lines = visible.map((permit) => {
      const assigned = permit.assignments?.length ?? 0;
      const expiry = permit.expiresAt
        ? ` · expires ${formatTimestamp(permit.expiresAt)}`
        : "";
      return `• ${permit.builtin ? "🔒" : "⚙️"} **#${permit.number} ${permit.name}** — ${formatPermitNodes(permit.nodes, 2)} · ${polarityIcon(permit.polarity)} ${permit.polarity} · ${assigned} assigned${expiry}`;
    });

    const selectOptions = visible
      .slice(0, SelectOptionLimit)
      .map((permit) => ({
        label: clip(
          `#${permit.number} ${permit.name}${permit.builtin ? " (builtin)" : ""}`,
          100,
        ),
        value: String(permit.id),
        description: clip(
          `${formatPermitNodes(permit.nodes, 2)} · ${permit.polarity}`,
          100,
        ),
        emoji: permit.builtin ? "🔒" : "⚙️",
      }));

    const actionRows = buildSafeActionRows([
      row(
        createStringSelectMenu({
          customId: "permit_select",
          placeholder: "Select a permit to manage",
          options: selectOptions,
        }),
      ),
      row(
        createActionButton({
          customId: "permit_create",
          label: "Create Permit",
          style: ButtonStyle.Primary,
          emoji: "➕",
        }),
        createActionButton({
          customId: "permit_explain",
          label: "Explain Check",
          style: ButtonStyle.Secondary,
          emoji: "🔍",
        }),
        createActionButton({
          customId: "permit_reorder",
          label: "Reorder",
          style: ButtonStyle.Secondary,
          emoji: "↕️",
        }),
      ),
      ...(totalPages > 1
        ? [
            createPaginationRow({
              customIdPrefix: "permit_page",
              currentPage,
              totalPages,
            }),
          ]
        : []),
    ]);

    return makeCard(
      undefined,
      "Permit Management",
      [
        ...lines,
        "-# Select a permit below to view, edit, or manage its assignments.",
      ],
      {
        subtitle: `${builtinCount} built-in · ${permits.length - builtinCount} custom · ${permits.length} total`,
        breadcrumbs: ["Admin", "Permits"],
        footer: formatPageFooter(currentPage, totalPages, permits.length),
        actionRows,
      },
    );
  }

  private async reorderCard(page: number): Promise<CardReply> {
    const permits = (await this.permitRepo.listPermits(
      this.guildId,
    )) as PermitWithAssignments[];

    if (permits.length === 0) return this.mainCard(0);

    const totalPages = Math.max(1, Math.ceil(permits.length / ReorderPageSize));
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = currentPage * ReorderPageSize;
    const visible = permits.slice(start, start + ReorderPageSize);
    const reorderable = permits.filter((permit) => !permit.builtin);

    const lines = visible.map((permit, index) => {
      return `**${start + index + 1}.** ${permit.builtin ? "🔒" : "⚙️"} **#${permit.number} ${permit.name}** — ${formatPermitNodes(permit.nodes, 2)} · ${polarityIcon(permit.polarity)} ${permit.polarity}`;
    });

    const permitRows = visible.map((permit) => {
      const reorderIndex = reorderable.findIndex(
        (candidate) => candidate.id === permit.id,
      );
      const canReorder = !permit.builtin && reorderIndex !== -1;
      return row(
        createActionButton({
          customId: `permit_move:up:${permit.id}:${currentPage}`,
          label: "Up",
          style: ButtonStyle.Secondary,
          emoji: "⬆️",
          disabled: !canReorder || reorderIndex === 0,
        }),
        createActionButton({
          customId: `permit_move:down:${permit.id}:${currentPage}`,
          label: "Down",
          style: ButtonStyle.Secondary,
          emoji: "⬇️",
          disabled:
            !canReorder || reorderIndex === reorderable.length - 1,
        }),
        createActionButton({
          customId: `permit_view:${permit.id}`,
          label: "Open",
          style: ButtonStyle.Primary,
          emoji: "📂",
        }),
      );
    });

    const actionRows = buildSafeActionRows([
      ...permitRows,
      row(
        createActionButton({
          customId: "permit_back_main",
          label: "Back to Permits",
          style: ButtonStyle.Secondary,
          emoji: "⬅️",
        }),
      ),
      ...(totalPages > 1
        ? [
            createPaginationRow({
              customIdPrefix: "permit_reorder_page",
              currentPage,
              totalPages,
            }),
          ]
        : []),
    ]);

    return makeCard(
      undefined,
      "Reorder Permits",
      [
        ...lines,
        "-# Permits are checked in this order. Use Up and Down to change it.",
        "-# 🔒 Built-in permits are fixed and cannot be reordered.",
      ],
      {
        subtitle: "Earlier permits are evaluated first",
        breadcrumbs: ["Admin", "Permits", "Reorder"],
        footer: formatPageFooter(currentPage, totalPages, permits.length),
        actionRows,
      },
    );
  }

  private missingPermitCard(): CardReply {
    return makeErrorCard(
      "Permit Not Found",
      "That permit no longer exists in this server.",
      {
        breadcrumbs: ["Admin", "Permits"],
        actionRows: buildSafeActionRows([
          row(
            createActionButton({
              customId: "permit_back_main",
              label: "Back to List",
              style: ButtonStyle.Secondary,
              emoji: "⬅️",
            }),
          ),
        ]),
      },
    );
  }

  private async createCard(flow: CreateFlow): Promise<CardReply> {
    const nodes = await this.creatableNodeCatalog();
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

  private async explainCard(flow: ExplainFlow): Promise<CardReply> {
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

  private async assignCard(flow: AssignFlow): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, flow.permitId);
    if (!permit) return this.missingPermitCard();

    let targetRow: ActionRowBuilder<any>;
    if (flow.targetType === "USER" || permit.builtin) {
      targetRow = row(
        createUserSelectMenu({
          customId: "permit_assign_target",
          placeholder: "Select a member",
          minValues: 1,
          maxValues: 1,
        }),
      );
    } else if (flow.targetType === "ROLE") {
      targetRow = row(
        createRoleSelectMenu({
          customId: "permit_assign_target",
          placeholder: "Select a role",
          minValues: 1,
          maxValues: 1,
        }),
      );
    } else {
      targetRow = row(
        createChannelSelectMenu({
          customId: "permit_assign_target",
          placeholder: "Select a channel",
          minValues: 1,
          maxValues: 1,
        }),
      );
    }

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

  private async assignExpiryCard(flow: AssignFlow): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, flow.permitId);
    if (!permit) return this.missingPermitCard();
    if (flow.targetId === undefined) return this.assignCard(flow);

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

  private async detailCard(permitId: number): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) return this.missingPermitCard();

    const assignments = (await this.prisma.permitAssignment.findMany({
      where: { permitId },
      orderBy: { grantedAt: "asc" },
    })) as AssignmentRecord[];

    const facts = [
      `**Nodes**\n${formatPermitNodeLines(permit.nodes)}`,
      `**Polarity** ${polarityIcon(permit.polarity)} ${permit.polarity}`,
      `**Built-in** ${permit.builtin ? "Yes" : "No"}`,
      `**Expires** ${permit.expiresAt ? formatTimestamp(permit.expiresAt) : "Never"}`,
      `**Schedule** ${
        permit.schedule
          ? `\`${permit.schedule}\`${permit.timezone ? ` (${permit.timezone})` : ""}`
          : "None"
      }`,
    ].join("\n");

    const assignmentLines =
      assignments.length === 0
        ? ["-# No assignments."]
        : assignments.slice(0, AssignmentPreviewLimit).map((assignment) => {
            const expiry = assignment.expiresAt
              ? ` · until ${formatTimestamp(assignment.expiresAt)}`
              : "";
            return `• ${targetMention(assignment.targetType, assignment.targetId)} · ${targetTypeLabel(assignment.targetType)}${expiry}`;
          });

    if (assignments.length > AssignmentPreviewLimit) {
      assignmentLines.push(
        `-# ...and ${assignments.length - AssignmentPreviewLimit} more assignment(s).`,
      );
    }

    const body = [facts, ["**Assignments**", ...assignmentLines].join("\n")];

    if (permit.conditions) {
      body.push(
        `**Conditions**\n\`\`\`json\n${clip(
          JSON.stringify(permit.conditions, null, 2),
          ConditionPreviewLimit,
        )}\n\`\`\``,
      );
    }

    const canManageExtraOwner = this.canManageExtraOwnerPermit(permit);
    const actionRows = buildSafeActionRows([
      row(
        createActionButton({
          customId: `permit_assign:${permit.id}`,
          label: "Assign",
          style: ButtonStyle.Success,
          emoji: "➕",
          disabled: !canManageExtraOwner,
        }),
        createActionButton({
          customId: `permit_unassign:${permit.id}`,
          label: "Unassign",
          style: ButtonStyle.Danger,
          emoji: "➖",
          disabled: assignments.length === 0 || !canManageExtraOwner,
        }),
        createActionButton({
          customId: `permit_edit:${permit.id}`,
          label: "Edit",
          style: ButtonStyle.Primary,
          emoji: "✏️",
          disabled: permit.builtin || !canManageExtraOwner,
        }),
        createActionButton({
          customId: `permit_delete:${permit.id}`,
          label: "Delete",
          style: ButtonStyle.Danger,
          emoji: "🗑️",
          disabled: permit.builtin || !canManageExtraOwner,
        }),
      ),
      row(
        createActionButton({
          customId: "permit_back_main",
          label: "Back to List",
          style: ButtonStyle.Secondary,
          emoji: "⬅️",
        }),
      ),
    ]);

    return makeCard(
      permit.polarity === "Grant" ? AccentColors.success : AccentColors.error,
      permit.name,
      body,
      {
        subtitle: permit.builtin ? "Built-in permit" : "Custom permit",
        breadcrumbs: ["Admin", "Permits", permit.name],
        footer: `Permit #${permit.number}`,
        actionRows,
      },
    );
  }

  private async unassignCard(permitId: number): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) return this.missingPermitCard();
    if (!this.canManageExtraOwnerPermit(permit)) return this.extraOwnerError();

    const assignments = (await this.prisma.permitAssignment.findMany({
      where: { permitId },
      orderBy: { grantedAt: "asc" },
    })) as AssignmentRecord[];

    if (assignments.length === 0) {
      return makeEmptyCard(
        "No Assignments",
        `**#${permit.number} ${permit.name}** has no assignments to remove.`,
        "Assign the permit first, then remove it here.",
        {
          breadcrumbs: ["Admin", "Permits", permit.name],
          actionRows: buildSafeActionRows([
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

    const options = assignments
      .slice(0, SelectOptionLimit)
      .map((assignment) => ({
        label: clip(
          `${targetTypeLabel(assignment.targetType)}: ${assignment.targetId}`,
          100,
        ),
        value: `${assignment.targetType}:${assignment.targetId}`,
        description: clip(
          assignment.expiresAt
            ? `Expires ${new Date(assignment.expiresAt).toISOString()}`
            : `Granted by ${assignment.grantedBy}`,
          100,
        ),
        emoji:
          assignment.targetType === "USER"
            ? "👤"
            : assignment.targetType === "ROLE"
              ? "🎭"
              : "#️⃣",
      }));

    const moreNotice =
      assignments.length > SelectOptionLimit
        ? `-# Only the first ${SelectOptionLimit} of ${assignments.length} assignments are listed.`
        : undefined;

    return makeInfoCard(
      `Remove Assignment · #${permit.number} ${permit.name}`,
      moreNotice
        ? [moreNotice]
        : "Pick an assignment to remove from this permit.",
      {
        breadcrumbs: ["Admin", "Permits", permit.name, "Unassign"],
        divider: true,
        actionRows: buildSafeActionRows([
          row(
            createStringSelectMenu({
              customId: `permit_unassign_select:${permit.id}`,
              placeholder: "Select an assignment to remove",
              options,
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
        footer: `${assignments.length} assignment${assignments.length === 1 ? "" : "s"}`,
      },
    );
  }

  private async deleteCard(permitId: number): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) return this.missingPermitCard();
    if (!this.canManageExtraOwnerPermit(permit)) return this.extraOwnerError();

    if (permit.builtin) {
      return makeErrorCard(
        "Built-in Permit",
        "Built-in permits cannot be deleted.",
        {
          breadcrumbs: ["Admin", "Permits", permit.name],
          actionRows: buildSafeActionRows([
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

    return makeWarningCard(
      "Delete Permit",
      [
        `Are you sure you want to delete **#${permit.number} ${permit.name}**?`,
        "This also removes every assignment attached to it and cannot be undone.",
      ],
      {
        breadcrumbs: ["Admin", "Permits", permit.name, "Delete"],
        actionRows: buildSafeActionRows([
          confirmRow({
            confirmId: `permit_confirm_delete:${permit.id}`,
            cancelId: `permit_view:${permit.id}`,
            confirmLabel: "Yes, Delete",
            cancelLabel: "Cancel",
          }),
        ]),
        footer: `Permit #${permit.number}`,
      },
    );
  }

  async handleInteraction(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId === "permit_create") {
      const nodes = await this.creatableNodeCatalog();
      const flow: CreateFlow = {
        kind: "create",
        namespace: defaultNamespace(nodes),
        nodes: [],
        polarity: "Grant",
        name: undefined,
      };
      this.setFlow(flow);
      await interaction.update(await this.createCard(flow));
      return;
    }

    if (customId === "permit_create_submit") {
      const flow = this.getFlow();
      if (flow?.kind !== "create") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      if (flow.nodes.length === 0) {
        await interaction.update(await this.createCard(flow));
        return;
      }
      if (flow.nodes.includes("*") && !isBotOwner(interaction.user.id)) {
        await interaction.reply(ephemeralCard(this.extraOwnerError()));
        return;
      }
      try {
        const permits = await this.permitRepo.listPermits(this.guildId);
        const existingNames = new Set(permits.map((permit) => permit.name));
        const requested = flow.name?.trim();
        if (requested && existingNames.has(requested)) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Name Taken",
                `A permit named **${requested}** already exists.`,
              ),
            ),
          );
          return;
        }
        const name =
          requested ??
          uniquePermitName(
            existingNames,
            suggestPermitName(flow.nodes, flow.polarity),
          );
        const position = permits.reduce(
          (next, permit) => Math.max(next, permit.position + 1),
          0,
        );
        const permit = await this.permitRepo.createPermit({
          guildId: this.guildId,
          name,
          nodes: flow.nodes,
          polarity: flow.polarity,
          position,
        });
        this.clearFlow();
        await interaction.update(await this.detailCard(permit.id));
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              "Permit Created",
              `**#${permit.number} ${permit.name}** is ready to use.`,
              { footer: `Permit #${permit.number}` },
            ),
          ),
        );
      } catch (error: any) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Create Failed",
              `Could not create the permit: ${error.message}`,
            ),
          ),
        );
      }
      return;
    }

    if (customId === "permit_create_name") {
      const flow = this.getFlow();
      if (flow?.kind !== "create" || flow.nodes.length === 0) {
        await interaction.update(await this.mainCard(0));
        return;
      }
      await this.showCreateNameModal(flow);
      return;
    }

    if (customId === "permit_create_clear") {
      const flow = this.getFlow();
      if (flow?.kind !== "create") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      flow.nodes = [];
      flow.name = undefined;
      this.setFlow(flow);
      await interaction.update(await this.createCard(flow));
      return;
    }

    if (customId === "permit_explain") {
      const flow: ExplainFlow = {
        kind: "explain",
        userId: undefined,
      };
      this.setFlow(flow);
      await interaction.update(await this.explainCard(flow));
      return;
    }

    if (customId === "permit_explain_run") {
      const flow = this.getFlow();
      if (flow?.kind !== "explain") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      if (flow.userId === undefined) {
        await interaction.update(await this.explainCard(flow));
        return;
      }
      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(flow.userId);
        const roleIds = member.roles.cache
          .filter((role: any) => role.id !== guild.id)
          .map((role: any) => role.id);
        const nodes = await this.nodeCatalog();
        const results = await this.permitRepo.explainPermitNodes(
          {
            guildId: this.guildId,
            userId: flow.userId,
            roleIds,
            guildOwnerId: guild.ownerId,
          },
          nodes,
          interaction.client,
        );
        const card = allExplanationCard(results, {
          userId: flow.userId,
          actionRows: buildSafeActionRows([
            row(
              createActionButton({
                customId: "permit_explain",
                label: "Check Another",
                style: ButtonStyle.Primary,
                emoji: "🔍",
              }),
              createActionButton({
                customId: "permit_back_main",
                label: "Back to Permits",
                style: ButtonStyle.Secondary,
                emoji: "⬅️",
              }),
            ),
          ]),
        });
        this.clearFlow();
        await interaction.update(card);
      } catch (error: any) {
        await interaction.update(
          makeErrorCard(
            "Check Failed",
            `Could not evaluate the permit: ${error.message}`,
          ),
        );
      }
      return;
    }

    if (customId === "permit_back_main") {
      this.clearFlow();
      await interaction.update(await this.mainCard(0));
      return;
    }

    if (customId === "permit_reorder") {
      await interaction.update(await this.reorderCard(0));
      return;
    }

    if (customId.startsWith("permit_reorder_page:")) {
      const [, direction, rawPage] = customId.split(":");
      if (direction === "prev" || direction === "next") {
        const page = Number(rawPage);
        await interaction.update(
          await this.reorderCard(Number.isNaN(page) ? 0 : page),
        );
      }
      return;
    }

    if (customId.startsWith("permit_move:")) {
      const [, direction, rawId, rawPage] = customId.split(":");
      if (direction !== "up" && direction !== "down") return;
      const permitId = Number(rawId);
      const page = Number(rawPage);
      if (!Number.isInteger(permitId)) return;
      await this.permitRepo.movePermit(this.guildId, permitId, direction);
      await interaction.update(
        await this.reorderCard(Number.isNaN(page) ? 0 : page),
      );
      return;
    }

    if (customId.startsWith("permit_page:")) {
      const [, direction, rawPage] = customId.split(":");
      if (direction === "prev" || direction === "next") {
        const page = Number(rawPage);
        await interaction.update(
          await this.mainCard(Number.isNaN(page) ? 0 : page),
        );
      }
      return;
    }

    if (customId.startsWith("permit_view:")) {
      this.clearFlow();
      await interaction.update(
        await this.detailCard(Number(customId.split(":")[1])),
      );
      return;
    }

    if (customId.startsWith("permit_assign:")) {
      const permitId = Number(customId.split(":")[1]);
      const permit = await this.permitRepo.getPermit(this.guildId, permitId);
      if (!permit) {
        await interaction.update(this.missingPermitCard());
        return;
      }
      if (!this.canManageExtraOwnerPermit(permit)) {
        await interaction.update(this.extraOwnerError());
        return;
      }
      const flow: AssignFlow = {
        kind: "assign",
        permitId,
        targetType: "USER",
        targetId: undefined,
      };
      this.setFlow(flow);
      await interaction.update(await this.assignCard(flow));
      return;
    }

    if (customId.startsWith("permit_unassign:")) {
      await interaction.update(
        await this.unassignCard(Number(customId.split(":")[1])),
      );
      return;
    }

    if (customId.startsWith("permit_edit:")) {
      await this.showEditModal(Number(customId.split(":")[1]));
      return;
    }

    if (customId.startsWith("permit_delete:")) {
      await interaction.update(
        await this.deleteCard(Number(customId.split(":")[1])),
      );
      return;
    }

    if (customId.startsWith("permit_confirm_delete:")) {
      await this.handleConfirmDelete(
        interaction,
        Number(customId.split(":")[1]),
      );
    }
  }

  private async showCreateNameModal(flow: CreateFlow): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`permit_create_name_modal:${this.flowKey()}`)
      .setTitle("Name Permit");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Permit Name")
          .setStyle(TextInputStyle.Short)
          .setValue(flow.name ?? suggestPermitName(flow.nodes, flow.polarity))
          .setRequired(true)
          .setMaxLength(64),
      ),
    );
    await this.interaction.showModal(modal);
  }

  private async showEditModal(permitId: number): Promise<void> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) {
      await this.interaction.followUp(
        ephemeralCard(
          makeErrorCard("Permit Not Found", "That permit no longer exists."),
        ),
      );
      return;
    }
    if (!this.canManageExtraOwnerPermit(permit)) {
      await this.interaction.followUp(ephemeralCard(this.extraOwnerError()));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`permit_edit_modal:${permitId}`)
      .setTitle(`Edit Permit: ${clip(permit.name, 30)}`);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Permit Name")
          .setStyle(TextInputStyle.Short)
          .setValue(permit.name)
          .setRequired(true)
          .setMaxLength(64),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("nodes")
          .setLabel("Permission Nodes (comma-separated)")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(permit.nodes.join(", "))
          .setRequired(true)
          .setMaxLength(1000),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("polarity")
          .setLabel("Polarity (Grant/Deny)")
          .setStyle(TextInputStyle.Short)
          .setValue(permit.polarity)
          .setRequired(true)
          .setMaxLength(5),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("schedule")
          .setLabel("Cron Schedule (optional)")
          .setStyle(TextInputStyle.Short)
          .setValue(typeof permit.schedule === "string" ? permit.schedule : "")
          .setRequired(false),
      ),
    );

    await this.interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;
    if (customId.startsWith("permit_create_name_modal:")) {
      await this.handleCreateNameSubmit(
        interaction,
        customId.slice("permit_create_name_modal:".length),
      );
      return;
    }
    if (customId.startsWith("permit_edit_modal:")) {
      await this.handleEditSubmit(
        interaction,
        Number(customId.split(":")[1]),
      );
    }
  }

  private async handleCreateNameSubmit(
    interaction: any,
    key: string,
  ): Promise<void> {
    const flow = this.getFlow(key);
    if (flow?.kind !== "create") {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Permit Not Found", "That permit draft has expired."),
        ),
      );
      return;
    }
    const name = interaction.fields.getTextInputValue("name").trim();
    if (name.length === 0) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Missing Name", "Give the permit a name."),
        ),
      );
      return;
    }
    flow.name = name.slice(0, 64);
    this.setFlow(flow, key);
    await interaction.update(await this.createCard(flow));
  }

  private async handleEditSubmit(
    interaction: any,
    permitId: number,
  ): Promise<void> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Permit Not Found", "That permit no longer exists."),
        ),
      );
      return;
    }

    if (permit.builtin) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Built-in Permit",
            "Built-in permits cannot be edited.",
          ),
        ),
      );
      return;
    }

    if (!this.canManageExtraOwnerPermit(permit)) {
      await interaction.reply(ephemeralCard(this.extraOwnerError()));
      return;
    }

    const name = interaction.fields.getTextInputValue("name").trim();
    const nodes = parseNodeList(
      interaction.fields.getTextInputValue("nodes").trim(),
    );
    const rawPolarity = interaction.fields
      .getTextInputValue("polarity")
      .trim();
    const schedule =
      interaction.fields.getTextInputValue("schedule").trim() || null;

    if (!name || nodes.length === 0) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Fields",
            "Permit name and at least one permission node are required.",
          ),
        ),
      );
      return;
    }

    if (nodes.includes("*") && !isBotOwner(interaction.user.id)) {
      await interaction.reply(ephemeralCard(this.extraOwnerError()));
      return;
    }

    const invalidNode = nodes.find((node) => !isValidNode(node));
    if (invalidNode !== undefined) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Node",
            `\`${invalidNode}\` is not a valid permission node.`,
          ),
        ),
      );
      return;
    }

    if (rawPolarity !== "Grant" && rawPolarity !== "Deny") {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Polarity",
            "Polarity must be either `Grant` or `Deny`.",
          ),
        ),
      );
      return;
    }

    try {
      await this.permitRepo.updatePermit(permitId, {
        name,
        nodes,
        polarity: rawPolarity,
        schedule,
      });

      await interaction.update(await this.detailCard(permitId));
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard("Permit Updated", `Saved changes to **${name}**.`, {
            footer: `Permit #${permit.number}`,
          }),
        ),
      );
    } catch (error: any) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Update Failed",
            `Could not update the permit: ${error.message}`,
          ),
        ),
      );
    }
  }

  async handleSelectMenu(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId === "permit_select") {
      const value = interaction.values[0];
      if (value === undefined) return;
      this.clearFlow();
      await interaction.update(await this.detailCard(Number(value)));
      return;
    }

    if (customId === "permit_create_namespace") {
      const flow = this.getFlow();
      if (flow?.kind !== "create") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const value = interaction.values[0];
      if (value === undefined) return;
      flow.namespace = value;
      this.setFlow(flow);
      await interaction.update(await this.createCard(flow));
      return;
    }

    if (customId === "permit_create_node") {
      const flow = this.getFlow();
      if (flow?.kind !== "create") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const selected = (interaction.values as string[]).filter(isValidNode);
      const otherNamespaces = flow.nodes.filter(
        (node) => namespaceForNode(node) !== flow.namespace,
      );
      const currentNamespace = selected.filter(
        (node) => namespaceForNode(node) === flow.namespace,
      );
      flow.nodes = [...otherNamespaces, ...currentNamespace].slice(
        0,
        SelectOptionLimit,
      );
      this.setFlow(flow);
      await interaction.update(await this.createCard(flow));
      return;
    }

    if (customId === "permit_create_node_remove") {
      const flow = this.getFlow();
      if (flow?.kind !== "create") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const removed = new Set(interaction.values as string[]);
      flow.nodes = flow.nodes.filter((node) => !removed.has(node));
      this.setFlow(flow);
      await interaction.update(await this.createCard(flow));
      return;
    }

    if (customId === "permit_create_polarity") {
      const flow = this.getFlow();
      if (flow?.kind !== "create") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const value = interaction.values[0];
      if (value === "Grant") {
        flow.polarity = "Grant";
      } else if (value === "Deny") {
        flow.polarity = "Deny";
      } else {
        return;
      }
      this.setFlow(flow);
      await interaction.update(await this.createCard(flow));
      return;
    }

    if (customId === "permit_explain_user") {
      const flow = this.getFlow();
      if (flow?.kind !== "explain") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const value = interaction.values[0];
      if (value === undefined) return;
      flow.userId = value;
      this.setFlow(flow);
      await interaction.update(await this.explainCard(flow));
      return;
    }

    if (customId === "permit_assign_type") {
      const flow = this.getFlow();
      if (flow?.kind !== "assign") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const permit = await this.permitRepo.getPermit(
        this.guildId,
        flow.permitId,
      );
      if (!permit) {
        await interaction.update(this.missingPermitCard());
        return;
      }
      if (!this.canManageExtraOwnerPermit(permit)) {
        await interaction.update(this.extraOwnerError());
        return;
      }
      const value = interaction.values[0];
      if (value === "USER" || (permit.builtin && value !== undefined)) {
        flow.targetType = "USER";
      } else if (value === "ROLE") {
        flow.targetType = "ROLE";
      } else if (value === "CHANNEL") {
        flow.targetType = "CHANNEL";
      } else {
        return;
      }
      flow.targetId = undefined;
      this.setFlow(flow);
      await interaction.update(await this.assignCard(flow));
      return;
    }

    if (customId === "permit_assign_target") {
      const flow = this.getFlow();
      if (flow?.kind !== "assign") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      const permit = await this.permitRepo.getPermit(
        this.guildId,
        flow.permitId,
      );
      if (!permit) {
        await interaction.update(this.missingPermitCard());
        return;
      }
      if (!this.canManageExtraOwnerPermit(permit)) {
        await interaction.update(this.extraOwnerError());
        return;
      }
      if (permit.builtin) flow.targetType = "USER";
      const value = interaction.values[0];
      if (value === undefined) return;
      flow.targetId = value;
      this.setFlow(flow);
      await interaction.update(await this.assignExpiryCard(flow));
      return;
    }

    if (customId === "permit_assign_expiry") {
      const flow = this.getFlow();
      if (flow?.kind !== "assign") {
        await interaction.update(await this.mainCard(0));
        return;
      }
      if (flow.targetId === undefined) {
        await interaction.update(await this.assignCard(flow));
        return;
      }
      const permit = await this.permitRepo.getPermit(
        this.guildId,
        flow.permitId,
      );
      if (!permit) {
        await interaction.update(this.missingPermitCard());
        return;
      }
      if (!this.canManageExtraOwnerPermit(permit)) {
        await interaction.update(this.extraOwnerError());
        return;
      }
      if (permit.builtin) flow.targetType = "USER";
      const expiryValue = interaction.values[0];
      if (expiryValue === undefined) return;
      const expiresAt = expiryFromValue(expiryValue);
      if (expiresAt === undefined) return;
      try {
        await this.permitRepo.assignPermit(
          flow.permitId,
          flow.targetType,
          flow.targetId,
          interaction.user.id,
          expiresAt,
        );
        const permit = await this.permitRepo.getPermit(
          this.guildId,
          flow.permitId,
        );
        if (permit === null) {
          this.clearFlow();
          await interaction.update(this.missingPermitCard());
          return;
        }
        this.clearFlow();
        await interaction.update(await this.detailCard(flow.permitId));
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              "Permit Assigned",
              `Assigned **#${permit.number} ${permit.name}** to ${targetMention(
                flow.targetType,
                flow.targetId,
              )}.`,
            ),
          ),
        );
      } catch (error: any) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Assign Failed",
              `Could not assign the permit: ${error.message}`,
            ),
          ),
        );
      }
      return;
    }

    if (customId.startsWith("permit_unassign_select:")) {
      const permitId = Number(customId.split(":")[1]);
      const value: string | undefined = interaction.values[0];
      if (value === undefined) return;
      const separator = value.indexOf(":");
      if (separator === -1) return;

      const targetType = value.slice(0, separator) as PermitTargetType;
      const targetId = value.slice(separator + 1);

      try {
        await this.permitRepo.unassignPermit(permitId, targetType, targetId);
        await interaction.update(await this.detailCard(permitId));
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              "Assignment Removed",
              `Removed ${targetTypeLabel(targetType)} ${targetMention(
                targetType,
                targetId,
              )}.`,
            ),
          ),
        );
      } catch (error: any) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Unassign Failed",
              `Could not remove the assignment: ${error.message}`,
            ),
          ),
        );
      }
    }
  }

  async handleConfirmDelete(interaction: any, permitId: number): Promise<void> {
    this.interaction = interaction;

    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) {
      await interaction.update(this.missingPermitCard());
      return;
    }
    if (!this.canManageExtraOwnerPermit(permit)) {
      await interaction.update(this.extraOwnerError());
      return;
    }

    if (permit.builtin) {
      await interaction.update(
        makeErrorCard("Built-in Permit", "Built-in permits cannot be deleted.", {
          actionRows: buildSafeActionRows([
            row(
              createActionButton({
                customId: `permit_view:${permit.id}`,
                label: "Back to Permit",
                style: ButtonStyle.Secondary,
                emoji: "⬅️",
              }),
            ),
          ]),
        }),
      );
      return;
    }

    try {
      await this.permitRepo.deletePermit(permitId);
      await interaction.update(await this.mainCard(0));
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard(
            "Permit Deleted",
            `Removed **#${permit.number} ${permit.name}** and its assignments.`,
          ),
        ),
      );
    } catch (error: any) {
      await interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Delete Failed",
            `Could not delete the permit: ${error.message}`,
          ),
        ),
      );
    }
  }
}
