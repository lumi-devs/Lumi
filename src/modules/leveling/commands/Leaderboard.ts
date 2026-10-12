import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from "@discordjs/builders";
import {
  AttachmentBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type APIActionRowComponent,
  type APIComponentInActionRow,
  type User,
} from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import type { Container } from "#src/lib/Services.js";
import {
  createStringSelectMenu,
} from "#src/lib/ui/Panels.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import {
  BoardKinds,
  isBoardKind,
  LevelService,
  type BoardEntry,
  type BoardKind,
} from "#src/modules/leveling/services/LevelService.js";
import { xpForLevel, type LevelFormula } from "#src/modules/leveling/services/Formulas.js";
import {
  renderLeaderboardCard,
  type BoardCardRow,
} from "#src/modules/leveling/services/LeaderboardCard.js";

export const BoardPageSize = 10;

export const BoardLabels: Record<BoardKind, string> = {
  overall: "Overall XP",
  voice: "Voice Time",
  weekly: "Weekly XP",
  monthly: "Monthly XP",
};

export const BoardDescriptions: Record<BoardKind, string> = {
  overall: "All-time XP rankings",
  voice: "Ranked by minutes in voice",
  weekly: "XP earned in the last 7 days",
  monthly: "XP earned in the last 30 days",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

interface BoardUser {
  username: string;
  avatarUrl: string | null;
}

function buildRow(
  board: BoardKind,
  entry: BoardEntry,
  formula: LevelFormula,
  user: User | null,
): BoardCardRow {
  const needed = xpForLevel(formula, entry.level);
  const progress = needed > 0 ? entry.xp / needed : 0;
  const who: BoardUser = user
    ? {
        username: user.username,
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 128 }),
      }
    : { username: "Unknown", avatarUrl: null };
  if (board === "voice") {
    return {
      rank: entry.rank,
      ...who,
      line1: `LEVEL ${entry.level}`,
      line2: `${fmt(entry.xp)} / ${fmt(needed)} XP`,
      right1: `${fmt(entry.voiceMinutes)} VOICE MIN`,
      right2: `${fmt(entry.totalXp)} XP`,
      progress,
    };
  }
  if (board === "weekly" || board === "monthly") {
    return {
      rank: entry.rank,
      ...who,
      line1: `LEVEL ${entry.level}`,
      line2: board === "weekly" ? "this week" : "this month",
      right1: `+${fmt(entry.windowTotal ?? 0)} XP`,
      right2: `${fmt(entry.totalXp)} XP total`,
      progress,
    };
  }
  return {
    rank: entry.rank,
    ...who,
    line1: `LEVEL ${entry.level}`,
    line2: `${fmt(entry.xp)} / ${fmt(needed)} XP`,
    right1: `${fmt(entry.totalXp)} XP`,
    right2: `${fmt(entry.messageCount)} MSGS · ${fmt(entry.voiceMinutes)} VOICE`,
    progress,
  };
}

export function boardSelectRow(board: BoardKind) {
  const menu = createStringSelectMenu({
    customId: "lvl:sel",
    placeholder: BoardLabels[board],
    options: BoardKinds.map((kind) => ({
      label: BoardLabels[kind],
      value: kind,
      description: BoardDescriptions[kind],
      default: kind === board,
    })),
  });
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function boardNavRow(board: BoardKind, page: number, totalPages: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lvl:lb:${board}:${page - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`lvl:lb:${board}:${page}`)
      .setLabel(`Page ${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`lvl:lb:${board}:${page + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page + 1 >= totalPages),
  );
}

export async function renderBoardMessage(
  services: Container,
  guildId: string,
  board: BoardKind,
  page: number,
  accent: string,
): Promise<{
  files: AttachmentBuilder[];
  components: APIActionRowComponent<APIComponentInActionRow>[];
  empty: boolean;
  totalPages: number;
}> {
  const config = await getLevelingConfig(services, guildId);
  const service = new LevelService();
  const { entries, total } = await service.board(
    guildId,
    board,
    config,
    BoardPageSize,
    page * BoardPageSize,
  );
  const totalPages = Math.max(1, Math.ceil(total / BoardPageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  if (safePage !== page) {
    const fixed = await service.board(
      guildId,
      board,
      config,
      BoardPageSize,
      safePage * BoardPageSize,
    );
    return renderEntries(
      services,
      board,
      config,
      fixed.entries,
      fixed.total,
      safePage,
      totalPages,
      accent,
    );
  }
  return renderEntries(
    services,
    board,
    config,
    entries,
    total,
    safePage,
    totalPages,
    accent,
  );
}

async function renderEntries(
  services: Container,
  board: BoardKind,
  config: Awaited<ReturnType<typeof getLevelingConfig>>,
  entries: BoardEntry[],
  total: number,
  safePage: number,
  totalPages: number,
  accent: string,
): Promise<{
  files: AttachmentBuilder[];
  components: APIActionRowComponent<APIComponentInActionRow>[];
  empty: boolean;
  totalPages: number;
}> {
  if (entries.length === 0) {
    return { files: [], components: [], empty: true, totalPages };
  }
  const rows: BoardCardRow[] = await Promise.all(
    entries.map(async (entry: BoardEntry) => {
      const user = await services.client.users
        .fetch(entry.userId)
        .catch(() => null);
      return buildRow(board, entry, config.formula, user);
    }),
  );
  const buffer = await renderLeaderboardCard({
    title: `🏆 ${BoardLabels[board]}`,
    subtitle: `${total} ranked · ${BoardDescriptions[board]}`,
    rows,
    accent,
    footer: `Page ${safePage + 1} of ${totalPages}`,
  });
  const files = [
    new AttachmentBuilder(buffer, {
      name: `leaderboard-${board}-${safePage}.png`,
      description: `${BoardLabels[board]} leaderboard page ${safePage + 1}`,
    }),
  ];
  const selectRow = boardSelectRow(board);
  const navRow =
    totalPages > 1 ? boardNavRow(board, safePage, totalPages) : null;
  return {
    files,
    components: [
      selectRow.toJSON(),
      ...(navRow ? [navRow.toJSON()] : []),
    ],
    empty: false,
    totalPages,
  };
}

export function parseBoardPage(customId: string): {
  board: BoardKind;
  page: number;
} | null {
  const parts = customId.split(":");
  if (parts[0] !== "lvl" || parts[1] !== "lb") return null;
  if (!isBoardKind(parts[2])) return null;
  return { board: parts[2], page: Number(parts[3] ?? "0") || 0 };
}

export const leaderboardDef: CommandDef = {
  name: "leaderboard",
  module: "leveling",
  description: "Show the server XP leaderboard.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    return new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Show the server XP leaderboard.");
  },
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    await ctx.defer({ ephemeral: false });
    try {
      const accent = `#${(await ctx.brandColor()).toString(16).padStart(6, "0")}`;
      const { files, components, empty } = await renderBoardMessage(
        ctx.services,
        guildId,
        "overall",
        0,
        accent,
      );
      if (empty) {
        await ctx.replyEmpty(
          "No Rankings Yet",
          "Nobody has earned XP on this server yet.",
          "Send messages or join voice to earn XP.",
        );
        return;
      }
      const payload = { files, components };
      if (ctx.isSlash) {
        await ctx.interaction.editReply(payload);
      } else {
        await ctx.message.reply(payload);
      }
    } catch {
      await ctx.replyError(
        "Leaderboard Failed",
        "I couldn't render that board. Try again in a moment.",
      );
    }
  },
};
