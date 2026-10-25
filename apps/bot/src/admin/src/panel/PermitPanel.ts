import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  PermitRepository,
  type Permit,
  type PermitTargetType,
} from "@lumi/permits";
import { PrismaClient } from "@prisma/client";
import {
  BrandColors,
  buildSafeActionRows,
  confirmRow,
  createActionButton,
  createPaginationRow,
  createStringSelectMenu,
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

interface PermitPanelOptions {
  prisma: PrismaClient;
  redis: any;
  guildId: string;
  interaction: any;
}

type PermitWithAssignments = Permit & { assignments?: { id: number }[] };

interface AssignmentRecord {
  targetType: PermitTargetType;
  targetId: string;
  grantedBy: string;
  expiresAt: Date | null;
}

const PermitPageSize = 6;
const AssignmentPreviewLimit = 10;
const SelectOptionLimit = 25;
const ConditionPreviewLimit = 900;

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;

const formatTimestamp = (value: Date | string): string =>
  `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>`;

const targetMention = (
  targetType: PermitTargetType,
  targetId: string,
): string => {
  if (targetType === "USER") return `<@${targetId}>`;
  if (targetType === "ROLE") return `<@&${targetId}>`;
  return `<#${targetId}>`;
};

const verdictIcon = (verdict: string): string => {
  if (verdict === "allow") return "✅";
  if (verdict === "deny") return "❌";
  return "➡️";
};

export class PermitPanel {
  private prisma: PrismaClient;
  private redis: any;
  private guildId: string;
  private interaction: any;
  private permitRepo: PermitRepository;

  constructor(options: PermitPanelOptions) {
    this.prisma = options.prisma;
    this.redis = options.redis;
    this.guildId = options.guildId;
    this.interaction = options.interaction;
    this.permitRepo = new PermitRepository(this.prisma, this.redis);
  }

  async render(): Promise<void> {
    const card = await this.mainCard(0);
    if (
      this.interaction.isButton?.() ||
      this.interaction.isStringSelectMenu?.()
    ) {
      await this.interaction.update(card);
      return;
    }
    await this.interaction.reply(card);
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
              createActionButton({
                customId: "permit_back",
                label: "Close",
                style: ButtonStyle.Danger,
                emoji: "✖️",
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
      return `• ${permit.builtin ? "🔒" : "⚙️"} **${permit.name}** — \`${permit.node}\` · ${permit.polarity} · pos ${permit.position} · ${assigned} assigned${expiry}`;
    });

    const selectOptions = visible
      .slice(0, SelectOptionLimit)
      .map((permit) => ({
        label: clip(
          `${permit.name}${permit.builtin ? " (builtin)" : ""}`,
          100,
        ),
        value: String(permit.id),
        description: clip(
          `${permit.node} · ${permit.polarity} · pos ${permit.position}`,
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
          customId: `permit_refresh:${currentPage}`,
          label: "Refresh",
          style: ButtonStyle.Secondary,
          emoji: "🔄",
        }),
        createActionButton({
          customId: "permit_back",
          label: "Close",
          style: ButtonStyle.Danger,
          emoji: "✖️",
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
      BrandColors.primary,
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

  private async detailCard(permitId: number): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) return this.missingPermitCard();

    const assignments = (await this.prisma.permitAssignment.findMany({
      where: { permitId },
      orderBy: { grantedAt: "asc" },
    })) as AssignmentRecord[];

    const facts = [
      `**Node** \`${permit.node}\``,
      `**Polarity** ${permit.polarity === "GRANT" ? "🟢 GRANT" : "🔴 DENY"}`,
      `**Position** ${permit.position}`,
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
            return `• ${targetMention(assignment.targetType, assignment.targetId)} · ${assignment.targetType}${expiry}`;
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

    const actionRows = buildSafeActionRows([
      row(
        createActionButton({
          customId: `permit_assign:${permit.id}`,
          label: "Assign",
          style: ButtonStyle.Success,
          emoji: "➕",
        }),
        createActionButton({
          customId: `permit_unassign:${permit.id}`,
          label: "Unassign",
          style: ButtonStyle.Danger,
          emoji: "➖",
          disabled: assignments.length === 0,
        }),
        createActionButton({
          customId: `permit_edit:${permit.id}`,
          label: "Edit",
          style: ButtonStyle.Primary,
          emoji: "✏️",
          disabled: permit.builtin,
        }),
        createActionButton({
          customId: `permit_delete:${permit.id}`,
          label: "Delete",
          style: ButtonStyle.Danger,
          emoji: "🗑️",
          disabled: permit.builtin,
        }),
      ),
      row(
        createActionButton({
          customId: "permit_back_main",
          label: "Back to List",
          style: ButtonStyle.Secondary,
          emoji: "⬅️",
        }),
        createActionButton({
          customId: `permit_view:${permit.id}`,
          label: "Refresh",
          style: ButtonStyle.Secondary,
          emoji: "🔄",
        }),
      ),
    ]);

    return makeCard(
      permit.polarity === "GRANT" ? BrandColors.success : BrandColors.error,
      permit.name,
      body,
      {
        subtitle: permit.builtin ? "Built-in permit" : "Custom permit",
        breadcrumbs: ["Admin", "Permits", permit.name],
        footer: `Permit ID ${permit.id}`,
        actionRows,
      },
    );
  }

  private async unassignCard(permitId: number): Promise<CardReply> {
    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) return this.missingPermitCard();

    const assignments = (await this.prisma.permitAssignment.findMany({
      where: { permitId },
      orderBy: { grantedAt: "asc" },
    })) as AssignmentRecord[];

    if (assignments.length === 0) {
      return makeEmptyCard(
        "No Assignments",
        `**${permit.name}** has no assignments to remove.`,
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

    const options = assignments.slice(0, SelectOptionLimit).map((assignment) => ({
      label: clip(
        `${assignment.targetType}: ${assignment.targetId}`,
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
      `Remove Assignment · ${permit.name}`,
      moreNotice ? [moreNotice] : "Pick an assignment to remove from this permit.",
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
        `Are you sure you want to delete **${permit.name}**?`,
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
        footer: `Permit ID ${permit.id}`,
      },
    );
  }

  async handleInteraction(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId === "permit_create") {
      await this.showCreateModal();
      return;
    }

    if (customId === "permit_explain") {
      await this.showExplainModal();
      return;
    }

    if (customId === "permit_back") {
      await interaction.update(this.closeCard());
      return;
    }

    if (customId === "permit_back_main") {
      await interaction.update(await this.mainCard(0));
      return;
    }

    if (customId.startsWith("permit_refresh")) {
      const page = Number(customId.split(":")[1] ?? 0);
      await interaction.update(await this.mainCard(Number.isNaN(page) ? 0 : page));
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
      await interaction.update(
        await this.detailCard(Number(customId.split(":")[1])),
      );
      return;
    }

    if (customId.startsWith("permit_assign:")) {
      await this.showAssignModal(Number(customId.split(":")[1]));
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

  private async showCreateModal(): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId("permit_create_modal")
      .setTitle("Create New Permit");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Permit Name")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g., Mod Ban Permit")
          .setRequired(true)
          .setMaxLength(64),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("node")
          .setLabel("Permission Node")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g., mod.ban, admin.*, *")
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("polarity")
          .setLabel("Polarity (grant/deny)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("grant")
          .setRequired(true)
          .setMaxLength(6),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("position")
          .setLabel("Position (priority)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("10")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("schedule")
          .setLabel("Cron Schedule (optional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("0 9 * * 1-5")
          .setRequired(false),
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
          .setCustomId("node")
          .setLabel("Permission Node")
          .setStyle(TextInputStyle.Short)
          .setValue(permit.node)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("polarity")
          .setLabel("Polarity (grant/deny)")
          .setStyle(TextInputStyle.Short)
          .setValue(permit.polarity)
          .setRequired(true)
          .setMaxLength(6),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("position")
          .setLabel("Position (priority)")
          .setStyle(TextInputStyle.Short)
          .setValue(permit.position.toString())
          .setRequired(true),
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

  private async showExplainModal(): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId("permit_explain_modal")
      .setTitle("Explain Permission Check");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("userId")
          .setLabel("Target User ID")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("User ID to check")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("node")
          .setLabel("Permission Node")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g., mod.ban")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("channelId")
          .setLabel("Channel ID (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
    );

    await this.interaction.showModal(modal);
  }

  private async showAssignModal(permitId: number): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`permit_assign_modal:${permitId}`)
      .setTitle("Assign Permit");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("targetId")
          .setLabel("Target ID (User/Role/Channel ID)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("123456789012345678")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("targetType")
          .setLabel("Target Type (USER/ROLE/CHANNEL)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("USER")
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("expiresAt")
          .setLabel("Expires At (ISO date, optional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("2026-12-31T23:59:59Z")
          .setRequired(false),
      ),
    );

    await this.interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId === "permit_create_modal") {
      await this.handleCreateSubmit(interaction);
      return;
    }

    if (customId.startsWith("permit_edit_modal:")) {
      await this.handleEditSubmit(
        interaction,
        Number(customId.split(":")[1]),
      );
      return;
    }

    if (customId === "permit_explain_modal") {
      await this.handleExplainSubmit(interaction);
      return;
    }

    if (customId.startsWith("permit_assign_modal:")) {
      await this.handleAssignSubmit(
        interaction,
        Number(customId.split(":")[1]),
      );
    }
  }

  private async handleCreateSubmit(interaction: any): Promise<void> {
    const name = interaction.fields.getTextInputValue("name").trim();
    const node = interaction.fields.getTextInputValue("node").trim();
    const polarity = interaction.fields
      .getTextInputValue("polarity")
      .trim()
      .toLowerCase();
    const position = Number(
      interaction.fields.getTextInputValue("position").trim(),
    );
    const schedule =
      interaction.fields.getTextInputValue("schedule").trim() || null;

    if (!name || !node) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Fields",
            "Permit name and permission node cannot be empty.",
          ),
        ),
      );
      return;
    }

    if (!["grant", "deny"].includes(polarity)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Polarity",
            "Polarity must be either `grant` or `deny`.",
          ),
        ),
      );
      return;
    }

    if (!Number.isInteger(position)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Position",
            "Position must be a whole number.",
          ),
        ),
      );
      return;
    }

    try {
      const permit = await this.permitRepo.createPermit({
        guildId: this.guildId,
        name,
        node,
        polarity: polarity.toUpperCase() as "GRANT" | "DENY",
        position,
        schedule,
      });

      await interaction.editReply(await this.detailCard(permit.id));
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard(
            "Permit Created",
            `**${permit.name}** is ready to use.`,
            { footer: `Permit ID ${permit.id}` },
          ),
        ),
      );
    } catch (error: any) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Create Failed",
            `Could not create the permit: ${error.message}`,
          ),
        ),
      );
    }
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

    const name = interaction.fields.getTextInputValue("name").trim();
    const node = interaction.fields.getTextInputValue("node").trim();
    const polarity = interaction.fields
      .getTextInputValue("polarity")
      .trim()
      .toLowerCase();
    const position = Number(
      interaction.fields.getTextInputValue("position").trim(),
    );
    const schedule =
      interaction.fields.getTextInputValue("schedule").trim() || null;

    if (!name || !node) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Fields",
            "Permit name and permission node cannot be empty.",
          ),
        ),
      );
      return;
    }

    if (!["grant", "deny"].includes(polarity)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Polarity",
            "Polarity must be either `grant` or `deny`.",
          ),
        ),
      );
      return;
    }

    if (!Number.isInteger(position)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Position",
            "Position must be a whole number.",
          ),
        ),
      );
      return;
    }

    try {
      await this.permitRepo.updatePermit(permitId, {
        name,
        node,
        polarity: polarity.toUpperCase() as "GRANT" | "DENY",
        position,
        schedule,
      });

      await interaction.editReply(await this.detailCard(permitId));
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard("Permit Updated", `Saved changes to **${name}**.`, {
            footer: `Permit ID ${permitId}`,
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

  private async handleExplainSubmit(interaction: any): Promise<void> {
    const userId = interaction.fields.getTextInputValue("userId").trim();
    const node = interaction.fields.getTextInputValue("node").trim();
    const channelId =
      interaction.fields.getTextInputValue("channelId").trim() || undefined;

    try {
      const result = await this.permitRepo.explainPermit({
        guildId: this.guildId,
        userId,
        permitNode: node,
        channelId,
        roleIds: [],
      });

      const rows =
        result.rows.length === 0
          ? ["-# No matching permit tiers."]
          : result.rows.map(
              (tier) =>
                `${verdictIcon(tier.verdict)} **${tier.tier}** — ${tier.verdict.toUpperCase()}${
                  tier.detail ? ` · ${tier.detail}` : ""
                }`,
            );

      const card = makeCard(
        result.allowed ? BrandColors.success : BrandColors.error,
        "Permission Check",
        [
          `**Result** ${result.allowed ? "✅ ALLOWED" : "❌ DENIED"}`,
          rows.join("\n"),
        ],
        {
          breadcrumbs: ["Admin", "Permits", "Explain"],
          footer: `${node} · <@${userId}>`,
        },
      );

      await interaction.reply(ephemeralCard(card));
    } catch (error: any) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Check Failed",
            `Could not evaluate the permit: ${error.message}`,
          ),
        ),
      );
    }
  }

  private async handleAssignSubmit(
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

    const targetId = interaction.fields.getTextInputValue("targetId").trim();
    const targetType = interaction.fields
      .getTextInputValue("targetType")
      .trim()
      .toUpperCase();
    const rawExpiry = interaction.fields
      .getTextInputValue("expiresAt")
      .trim();

    if (!targetId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Target",
            "Provide a user, role, or channel ID to assign.",
          ),
        ),
      );
      return;
    }

    if (!["USER", "ROLE", "CHANNEL"].includes(targetType)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Target Type",
            "Target type must be `USER`, `ROLE`, or `CHANNEL`.",
          ),
        ),
      );
      return;
    }

    let expiresAt: Date | null = null;
    if (rawExpiry) {
      const parsed = new Date(rawExpiry);
      if (Number.isNaN(parsed.getTime())) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Invalid Expiry",
              "Expiry must be an ISO date such as `2026-12-31T23:59:59Z`.",
            ),
          ),
        );
        return;
      }
      expiresAt = parsed;
    }

    try {
      await this.prisma.permitAssignment.create({
        data: {
          permitId,
          guildId: this.guildId,
          targetType: targetType as PermitTargetType,
          targetId,
          grantedBy: interaction.user.id,
          expiresAt,
        },
      });

      await interaction.editReply(await this.detailCard(permitId));
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard(
            "Permit Assigned",
            `Assigned **${permit.name}** to ${targetType} ${targetMention(
              targetType as PermitTargetType,
              targetId,
            )}.`,
          ),
        ),
      );
    } catch (error: any) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Assign Failed",
            `Could not assign the permit: ${error.message}`,
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
      if (!value) return;
      await interaction.update(await this.detailCard(Number(value)));
      return;
    }

    if (customId.startsWith("permit_unassign_select:")) {
      const permitId = Number(customId.split(":")[1]);
      const value: string = interaction.values[0] ?? "";
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
              `Removed ${targetType} ${targetMention(targetType, targetId)}.`,
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

  private closeCard(): CardReply {
    return makeInfoCard("Permits", "Permit panel closed.", {
      statusBadge: { status: "inactive", label: "CLOSED" },
      footer: "Run `/lumi` to reopen",
    });
  }

  async handleConfirmDelete(interaction: any, permitId: number): Promise<void> {
    this.interaction = interaction;

    const permit = await this.permitRepo.getPermit(this.guildId, permitId);
    if (!permit) {
      await interaction.update(this.missingPermitCard());
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
            `Removed **${permit.name}** and its assignments.`,
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
