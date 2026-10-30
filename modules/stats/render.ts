import type { ModuleServices } from "@lumi/module-kit";
import { type CardReply, createActionButton, makeCard, row } from "@lumi/ui";
import {
  AttachmentBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Guild,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from "discord.js";
import { DefaultLookback, LookbackValues, type Lookback } from "./constants.js";
import {
  loadGuildTotals,
  loadMessageStats,
  loadSnapshotStats,
  loadTopStats,
  loadUserStats,
  loadVoiceStats,
  type TopType,
} from "./queries.js";
import { parseLookback } from "./ranges.js";
import {
  buildChannelsPayload,
  buildMembersPayload,
  buildMessagesPayload,
  buildServerPayload,
  buildStatusPayload,
  buildTopPayload,
  buildUserPayload,
  buildVoicePayload,
  type ViewData,
} from "./views.js";
import { generateStatsCard, type StatsCardPayload } from "./statsCard.js";

export const StatsSubcommands = [
  "server",
  "members",
  "channels",
  "status",
  "messages",
  "voice",
  "user",
  "top",
] as const;
export type StatsSubcommand = (typeof StatsSubcommands)[number];

export const TopTypes: TopType[] = [
  "message-users",
  "voice-users",
  "message-channels",
  "voice-channels",
];

export interface StatsState {
  sub: StatsSubcommand;
  view: "overview" | "chart";
  lookback: Lookback;
  ownerId: string;
  target: string;
  page: number;
}

export type StatsAction = "refresh" | "toggle" | "range" | "page" | "topcat";

export function encodeStatsId(
  state: StatsState,
  action: StatsAction,
  patch: Partial<StatsState> = {},
): string {
  const next = { ...state, ...patch };
  return [
    "stats",
    action,
    next.sub,
    next.view,
    next.lookback,
    next.ownerId,
    next.target || "0",
    String(next.page),
  ].join(":");
}

export interface ParsedStatsId {
  action: StatsAction;
  state: StatsState;
}

export function parseStatsId(customId: string): ParsedStatsId | null {
  const parts = customId.split(":");
  if (parts.length !== 8 || parts[0] !== "stats") return null;
  const [, action, sub, view, lookback, ownerId, target, pageText] = parts;
  if (!action || !sub || !view || !lookback || !ownerId || !target) return null;
  if (!(StatsSubcommands as readonly string[]).includes(sub)) return null;
  if (!(TopTypes as readonly string[]).includes(target) && target !== "0") {
    if (!/^\d{5,25}$/.test(target)) return null;
  }
  if (view !== "overview" && view !== "chart") return null;
  if (!(LookbackValues as readonly string[]).includes(lookback)) return null;
  if (!["refresh", "toggle", "range", "page", "topcat"].includes(action)) {
    return null;
  }
  const page = Number.parseInt(pageText ?? "1", 10);
  return {
    action: action as StatsAction,
    state: {
      sub: sub as StatsSubcommand,
      view,
      lookback: lookback as Lookback,
      ownerId,
      target: target === "0" ? "" : target,
      page: Number.isFinite(page) && page > 0 ? page : 1,
    },
  };
}

function pageFor(state: StatsState): number {
  return state.sub === "top" ? state.page : 1;
}

function targetFor(state: StatsState): string {
  if (state.sub === "top") {
    return (TopTypes as readonly string[]).includes(state.target)
      ? state.target
      : TopTypes[0]!;
  }
  return state.target;
}

export function buildStatsActionRows(
  state: StatsState,
): ReturnType<typeof row>[] {
  const rows: ReturnType<typeof row>[] = [];
  rows.push(
    row(
      ...LookbackValues.map((lookback) =>
        createActionButton({
          customId: encodeStatsId(state, "range", { lookback, page: 1 }),
          label: lookback,
          style:
            lookback === state.lookback
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary,
          disabled: lookback === state.lookback,
        }),
      ),
    ),
  );

  rows.push(
    row(
      createActionButton({
        customId: encodeStatsId(state, "refresh"),
        label: "Refresh",
        emoji: "🔄",
        style: ButtonStyle.Secondary,
      }),
      createActionButton({
        customId: encodeStatsId(state, "toggle", {
          view: state.view === "overview" ? "chart" : "overview",
        }),
        label: state.view === "overview" ? "Chart" : "Overview",
        emoji: state.view === "overview" ? "📈" : "📋",
        style: ButtonStyle.Primary,
      }),
    ),
  );

  if (state.sub === "top") {
    const currentType = targetFor(state);
    rows.push(
      row(
        ...TopTypes.map((type) =>
          createActionButton({
            customId: encodeStatsId(state, "topcat", {
              target: type,
              page: 1,
            }),
            label:
              type === "message-users"
                ? "Msg Users"
                : type === "voice-users"
                  ? "Voice Users"
                  : type === "message-channels"
                    ? "Msg Channels"
                    : "Voice Channels",
            style:
              type === currentType
                ? ButtonStyle.Success
                : ButtonStyle.Secondary,
            disabled: type === currentType,
          }),
        ),
      ),
    );
    rows.push(
      row(
        createActionButton({
          customId: encodeStatsId(state, "page", {
            page: Math.max(1, state.page - 1),
          }),
          label: "Prev",
          style: ButtonStyle.Secondary,
          disabled: state.page <= 1,
        }),
        createActionButton({
          customId: encodeStatsId(state, "refresh"),
          label: `Page ${state.page}`,
          style: ButtonStyle.Secondary,
          disabled: true,
        }),
        createActionButton({
          customId: encodeStatsId(state, "page", {
            page: state.page + 1,
          }),
          label: "Next",
          style: ButtonStyle.Secondary,
        }),
      ),
    );
  }

  return rows;
}

async function loadViewData(
  services: ModuleServices,
  guild: Guild,
  lookback: Lookback,
): Promise<ViewData> {
  const [totals, message, voice, snapshot] = await Promise.all([
    loadGuildTotals(services, guild.id),
    loadMessageStats(services, guild.id, lookback),
    loadVoiceStats(services, guild.id, lookback),
    loadSnapshotStats(services, guild.id, lookback),
  ]);
  return {
    guild,
    lookback,
    view: "overview",
    totals,
    message,
    voice,
    snapshot,
  };
}

function pickPayload(
  state: StatsState,
  data: ViewData,
  user: Awaited<ReturnType<typeof loadUserStats>> | null,
  top: Awaited<ReturnType<typeof loadTopStats>> | null,
  target: {
    id: string;
    username: string;
    displayName: string;
    createdAt: Date;
    avatarUrl?: string;
    joinedAt?: Date | null;
  } | null,
): StatsCardPayload {
  const view = state.view;
  switch (state.sub) {
    case "messages":
      return buildMessagesPayload({ ...data, view });
    case "voice":
      return buildVoicePayload({ ...data, view });
    case "members":
      return buildMembersPayload({ ...data, view });
    case "channels":
      return buildChannelsPayload({ ...data, view });
    case "status":
      return buildStatusPayload({ ...data, view });
    case "user": {
      if (!user || !target) throw new Error("User stats target missing");
      return buildUserPayload({
        guild: data.guild,
        lookback: state.lookback,
        view,
        user,
        target,
      });
    }
    case "top": {
      if (!top) throw new Error("Top stats missing");
      return buildTopPayload({
        guild: data.guild,
        lookback: state.lookback,
        view,
        totals: data.totals,
        top,
        snapshot: data.snapshot,
      });
    }
    default:
      return buildServerPayload({ ...data, view });
  }
}

async function resolveUser(
  services: ModuleServices,
  guild: Guild,
  userId: string,
): Promise<{
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  avatarUrl?: string;
  joinedAt?: Date | null;
} | null> {
  const cached = guild.members.cache.get(userId);
  const member =
    cached ?? (await guild.members.fetch(userId).catch(() => null));
  const user =
    member?.user ??
    (await services.client.users.fetch(userId).catch(() => null));
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: member?.displayName ?? user.username,
    createdAt: user.createdAt,
    avatarUrl: user.displayAvatarURL({ size: 256, extension: "png" }),
    joinedAt: member?.joinedAt ?? null,
  };
}

function fallbackBody(payload: StatsCardPayload): string[] {
  const parts: string[] = [];
  for (const box of payload.boxes) {
    if (box.big) {
      parts.push(`**${box.title}**\n${box.big.value} ${box.big.label}`);
      continue;
    }
    parts.push(
      `**${box.title}**\n${box.rows
        .map((line) => `${line.label} — ${line.value}`)
        .join("\n")}`,
    );
  }
  for (const list of payload.lists) {
    parts.push(
      `**${list.title}**\n${
        list.items.length > 0
          ? list.items.map((item) => `${item.label} — ${item.value}`).join("\n")
          : "No data yet"
      }`,
    );
  }
  return parts;
}

export interface RenderedStats {
  card: CardReply;
  files: AttachmentBuilder[];
}

export function buildStatsReply(
  payload: StatsCardPayload,
  state: StatsState,
  image: Buffer | null,
): RenderedStats {
  const actionRows = buildStatsActionRows(state);
  if (image) {
    const attachment = new AttachmentBuilder(image, { name: "stats.png" });
    return {
      card: makeCard(undefined, "", "", {
        headerImages: ["attachment://stats.png"],
        footer: payload.footer,
        noAccent: true,
        hideTitle: true,
        actionRows,
      }),
      files: [attachment],
    };
  }

  return {
    card: makeCard(0x3b82f6, payload.title, fallbackBody(payload), {
      subtitle: payload.subtitle,
      footer: payload.footer,
      actionRows,
    }),
    files: [],
  };
}

export async function renderStats(
  services: ModuleServices,
  guild: Guild,
  state: StatsState,
): Promise<RenderedStats> {
  const lookback = parseLookback(state.lookback);
  const data = await loadViewData(services, guild, lookback);
  const isTop = state.sub === "top";
  const isUser = state.sub === "user";
  const topType = targetFor(state) as TopType;

  const [user, top] = await Promise.all([
    isUser ? loadUserStats(services, guild.id, state.target, lookback) : null,
    isTop
      ? loadTopStats(services, guild.id, topType, lookback, pageFor(state))
      : null,
  ]);
  const target = isUser
    ? await resolveUser(services, guild, state.target)
    : null;
  const payload = pickPayload(state, data, user, top, target);

  let image: Buffer | null = null;
  try {
    image = await generateStatsCard(payload);
  } catch (error) {
    const logger = (
      services as {
        observability?: {
          logger?: { warn?: (message: string, meta?: unknown) => void };
        };
      }
    ).observability?.logger;
    logger?.warn?.("[stats] card generation failed", { error });
  }

  return buildStatsReply(payload, state, image);
}

export async function replyStats(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  state: StatsState,
): Promise<void> {
  const rendered = await renderStats(services, guild, state);
  const options: InteractionReplyOptions = {
    ...rendered.card,
    ...(rendered.files.length > 0 ? { files: rendered.files } : {}),
  };
  await interaction.reply(options);
}

export async function editStats(
  interaction: {
    editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  },
  services: ModuleServices,
  guild: Guild,
  state: StatsState,
): Promise<void> {
  const rendered = await renderStats(services, guild, state);
  const options: InteractionEditReplyOptions = {
    ...rendered.card,
    ...(rendered.files.length > 0 ? { files: rendered.files } : {}),
  };
  await interaction.editReply(options);
}

export function defaultState(
  sub: StatsSubcommand,
  ownerId: string,
  overrides: Partial<StatsState> = {},
): StatsState {
  return {
    sub,
    view: "overview",
    lookback: DefaultLookback,
    ownerId,
    target: "",
    page: 1,
    ...overrides,
  };
}
