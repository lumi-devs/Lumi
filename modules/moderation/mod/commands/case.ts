import type {
  CommandDefinition,
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import {
  type CardReply,
  createPaginationRow,
  ephemeralCard,
  formatPageFooter,
  makeCard,
  makeErrorCard,
  makeInfoCard,
} from "@lumi/ui";
import {
  type ButtonInteraction,
  type Client,
  SlashCommandBuilder,
} from "discord.js";
import { ModerationModuleName } from "../constants.js";
import { describeError, replyError } from "../helpers.js";

export const caseDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View a moderation case")
    .addIntegerOption((o) =>
      o.setName("id").setDescription("Case ID").setRequired(true),
    ),
  requiredPermit: "mod.case",
  async execute(interaction, services) {
    const caseId = interaction.options.getInteger("id", true);
    const guildId = interaction.guildId!;

    const modCase = await services.db.prisma.moderationCase.findFirst({
      where: { guildId, caseNumber: caseId },
    });

    if (!modCase) {
      await replyError(
        interaction,
        "Not found",
        `Case #${caseId} does not exist`,
      );
      return;
    }

    const [moderator, target] = await Promise.all([
      interaction.client.users.fetch(modCase.moderatorId).catch(() => null),
      interaction.client.users.fetch(modCase.targetId).catch(() => null),
    ]);
    const createdAt = Math.floor(new Date(modCase.createdAt).getTime() / 1000);
    const caseType = modCase.type ?? modCase.action ?? "CASE";

    await interaction.reply(
      ephemeralCard(
        makeInfoCard(
          `Case #${modCase.caseNumber} — ${caseType}`,
          [
            `**Target**\n${target?.tag ?? "Unknown"} (\`${modCase.targetId}\`)`,
            `**Moderator**\n${moderator?.tag ?? "Unknown"} (\`${modCase.moderatorId}\`)`,
            `**Reason**\n${modCase.reason ?? "No reason provided"}`,
          ],
          {
            statusBadge: {
              status: modCase.active === false ? "inactive" : "active",
              label: modCase.active === false ? "CLOSED" : "ACTIVE",
            },
            footer: `Created <t:${createdAt}:F>`,
          },
        ),
      ),
    );
  },
};

const CasesPerPage = 10;

async function buildCasesCard(
  client: Client,
  services: ModuleServices,
  guildId: string,
  targetId: string,
  targetTag: string,
  pageIndex: number,
): Promise<CardReply> {
  const total = await services.db.prisma.moderationCase.count({
    where: { guildId, targetId },
  });
  const totalPages = Math.max(1, Math.ceil(total / CasesPerPage));
  const page = Math.min(Math.max(1, pageIndex + 1), totalPages);

  const cases = await services.db.prisma.moderationCase.findMany({
    where: { guildId, targetId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * CasesPerPage,
    take: CasesPerPage,
  });

  if (cases.length === 0) {
    return makeInfoCard(
      `📋 Cases for ${targetTag}`,
      "No moderation cases found.",
      {
        footer: formatPageFooter(0, 1, total),
      },
    );
  }

  const offset = (page - 1) * CasesPerPage;
  const lines = cases.map(
    (
      c: {
        moderatorId: string;
        reason?: string | null;
        createdAt: Date | string;
        type?: string | null;
        action?: string | null;
        caseNumber?: number | null;
      },
      i: number,
    ) => {
      const moderator = client.users.cache.get(c.moderatorId);
      const reason = (c.reason ?? "No reason provided").slice(0, 80);
      const timestamp = Math.floor(new Date(c.createdAt).getTime() / 1000);
      const when = Number.isFinite(timestamp)
        ? `<t:${timestamp}:R>`
        : "unknown time";
      const caseType = c.type ?? c.action ?? "CASE";
      const caseNumber = c.caseNumber ?? offset + i + 1;
      return `\`#${caseNumber}\` **${caseType}** — ${reason} · ${moderator?.tag ?? c.moderatorId} · ${when}`;
    },
  );

  return makeCard(undefined, `📋 Cases for ${targetTag}`, lines, {
    footer: formatPageFooter(page - 1, totalPages, total),
    actionRows: [
      createPaginationRow({
        customIdPrefix: `mod:cases:${targetId}`,
        currentPage: page - 1,
        totalPages,
      }),
    ],
    separatorAboveActionRows: true,
  });
}

export const casesDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("cases")
    .setDescription("List moderation cases for a user")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("User to view cases for")
        .setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName("page")
        .setDescription("Page number")
        .setMinValue(1)
        .setRequired(false),
    ),
  requiredPermit: "mod.case",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const page = interaction.options.getInteger("page") ?? 1;
    const card = await buildCasesCard(
      interaction.client,
      services,
      interaction.guildId!,
      target.id,
      target.tag,
      page - 1,
    );
    await interaction.reply(ephemeralCard(card));
  },
};

export const casesPaginationListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: ButtonInteraction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("mod:cases:")) return;

    const [prefix, scope, targetId, action, pageValue] =
      interaction.customId.split(":");
    if (prefix !== "mod" || scope !== "cases" || !targetId) return;
    if (action !== "prev" && action !== "next") return;

    const guildId = interaction.guildId;
    if (!guildId) return;
    if (!(services.modules?.isEnabled(guildId, ModerationModuleName) ?? true)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module disabled",
            "The moderation module is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const pageIndex = Number.parseInt(pageValue ?? "0", 10);

    await interaction.deferUpdate().catch(() => {});

    try {
      const target = await interaction.client.users
        .fetch(targetId)
        .catch(() => null);
      const card = await buildCasesCard(
        interaction.client,
        services,
        guildId,
        targetId,
        target?.tag ?? targetId,
        Number.isFinite(pageIndex) ? pageIndex : 0,
      );
      await interaction.editReply(card);
    } catch (e) {
      await interaction
        .editReply(makeErrorCard("Cases failed", describeError(e)))
        .catch(() => {});
    }
  },
};
