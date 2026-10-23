import { ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, time, TimestampStyles } from "discord.js";
import {
  componentEmoji,
  createActionButton,
  makeCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  resolveCardColor,
  row,
  type CardReply,
  type Row,
} from "@lumi/ui";

export const VerifyButtonId = "sec:verify";
export const PanicRevertId = "sec:panic:revert";

export const EmojiPool = [
  "🍎",
  "🐶",
  "🚀",
  "⭐",
  "🎸",
  "🌊",
  "🦁",
  "🍕",
  "🎯",
  "🌈",
  "🦋",
  "🔥",
] as const;

export interface CaptchaState {
  readonly sequence: number[];
  readonly buttons: number[];
  progress: number;
  attempts: number;
  readonly expiresAt: number;
}

export interface VerifyPanelContent {
  title?: string | null | undefined;
  welcome?: string | null | undefined;
}

function sequenceDisplay(sequence: readonly number[]): string {
  return sequence.map((index) => EmojiPool[index] ?? "❔").join("  ");
}

export function buildVerifyPanel(content: VerifyPanelContent = {}): CardReply {
  return makeCard(
    resolveCardColor("success"),
    content.title || "✅ Verification Required",
    content.welcome ||
      "To keep this server safe, please verify that you are human.\n\nPress **Verify** below and follow the emoji sequence.",
    {
      footer: "If verification fails, contact a server administrator.",
      actionRows: [
        row(
          createActionButton({
            customId: VerifyButtonId,
            label: "Verify",
            style: ButtonStyle.Success,
            emoji: "✅",
          }),
        ),
      ],
      separatorAboveActionRows: true,
    },
  );
}

export function buildCaptchaRows(state: CaptchaState, userId: string): Row[] {
  const solved = new Set(state.sequence.slice(0, state.progress));
  const half = Math.ceil(state.buttons.length / 2);
  const rows: Row[] = [];

  for (let index = 0; index < 2; index++) {
    const slice = state.buttons.slice(index * half, index * half + half);
    if (slice.length === 0) continue;
    rows.push(
      row(
        ...slice.map((buttonIndex) =>
          new ButtonBuilder()
            .setCustomId(`sec:captcha:${userId}:${buttonIndex}`)
            .setEmoji(componentEmoji(EmojiPool[buttonIndex] ?? "❔"))
            .setStyle(solved.has(buttonIndex) ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(solved.has(buttonIndex)),
        ),
      ),
    );
  }

  return rows;
}

export function buildChallengeCard(state: CaptchaState, userId: string): CardReply {
  const minutes = Math.max(1, Math.round((state.expiresAt - Date.now()) / 60_000));
  return makeInfoCard(
    "🧩 Human Check",
    [
      `Click the emojis in this order: ${sequenceDisplay(state.sequence)}`,
      "",
      `**Attempts left:** ${state.attempts} · **Expires in:** ${minutes} minute(s)`,
    ],
    { actionRows: buildCaptchaRows(state, userId) },
  );
}

export function buildProgressCard(state: CaptchaState, userId: string): CardReply {
  return makeInfoCard(
    `🧩 Human Check (${state.progress}/${state.sequence.length})`,
    `Keep going: ${sequenceDisplay(state.sequence)}`,
    { actionRows: buildCaptchaRows(state, userId) },
  );
}

export function buildWrongCard(state: CaptchaState, userId: string): CardReply {
  return makeWarningCard(
    "❌ Wrong Emoji",
    `That was not the next emoji. Start again: ${sequenceDisplay(state.sequence)}\n\n**Attempts left:** ${state.attempts}`,
    { actionRows: buildCaptchaRows(state, userId) },
  );
}

export function buildVerifiedCard(): CardReply {
  return makeSuccessCard(
    "✅ Verified",
    "You passed the human check. Welcome to the server!",
  );
}

export function buildPanicActiveCard(status: {
  invitesPaused: boolean;
  lockedCount: number;
  skippedCount: number;
  startedAt?: Date | undefined;
}): CardReply {
  return makeCard(
    resolveCardColor("error"),
    "🚨 Panic Mode Active",
    [
      `Locked **${status.lockedCount}** channel(s) and disabled **Send Messages** for @everyone.${
        status.skippedCount > 0 ? ` Skipped **${status.skippedCount}**.` : ""
      }`,
      status.invitesPaused
        ? "Invites are paused."
        : "⚠️ Invites could not be paused automatically.",
      ...(status.startedAt
        ? [`-# Active since ${time(status.startedAt, TimestampStyles.RelativeTime)}`]
        : []),
    ].join("\n"),
    {
      footer: "Press Revert when the incident is over. Channels return to their previous state.",
      actionRows: [
        row(
          createActionButton({
            customId: PanicRevertId,
            label: "Revert Panic",
            style: ButtonStyle.Success,
          }),
        ),
      ],
      separatorAboveActionRows: true,
    },
  );
}

export function buildPanicAlreadyActiveCard(startedAt: Date): CardReply {
  return makeCard(
    resolveCardColor("error"),
    "🚨 Panic Mode Already Active",
    `Panic mode has been active since ${time(startedAt, TimestampStyles.RelativeTime)}.`,
    {
      actionRows: [
        row(
          createActionButton({
            customId: PanicRevertId,
            label: "Revert Panic",
            style: ButtonStyle.Success,
          }),
        ),
      ],
      separatorAboveActionRows: true,
    },
  );
}

export function buildPanicRevertedCard(restoredCount: number, invitesResumed: boolean): CardReply {
  return makeSuccessCard(
    "Panic Mode Reverted",
    `Restored **${restoredCount}** channel(s).${
      invitesResumed ? " Invites are enabled again." : " ⚠️ Invites could not be re-enabled."
    }`,
  );
}
