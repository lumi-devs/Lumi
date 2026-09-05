import { ActionRowBuilder, type ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";
import { createActionButton, buildSafeActionRows } from "#lib/utilities/panels.js";

/** Visually distinct emoji; challenge indices point into this pool. */
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

export const SequenceLength = 4;
export const MaxAttempts = 3;
export const CaptchaButtonPrefix = "sec:vseq";

/** Persisted per-member challenge state (Redis JSON). */
export interface CaptchaState {
  /** Indices into EmojiPool, in the order they must be clicked. */
  sequence: number[];
  /** All button indices (sequence + distractors), shuffled. */
  buttons: number[];
  /** How many correct clicks so far. */
  progress: number;
  /** Wrong attempts remaining. */
  attempts: number;
  /** Epoch ms the challenge expires. */
  expiresAt: number;
}

function cryptoShuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Builds a fresh sequence + shuffled button set (sequence interleaved with distractors). */
export function buildChallenge(): { sequence: number[]; buttons: number[] } {
  const pool = cryptoShuffle(EmojiPool.map((_, i) => i));
  const sequence = pool.slice(0, SequenceLength);
  const distractors = pool.slice(SequenceLength, SequenceLength * 2);
  return { sequence, buttons: cryptoShuffle([...sequence, ...distractors]) };
}

/** Renders the emoji as clickable rows; already-satisfied picks show green and disabled. */
export function buildCaptchaRows(
  buttons: number[],
  solved: ReadonlySet<number>,
): ActionRowBuilder<ButtonBuilder>[] {
  const half = Math.ceil(buttons.length / 2);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 2; r++) {
    const slice = buttons.slice(r * half, r * half + half);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        slice.map((idx) =>
          createActionButton({
            customId: `${CaptchaButtonPrefix}:${idx}`,
            emoji: Emojis.parse(EmojiPool[idx]!),
            style: solved.has(idx) ? ButtonStyle.Success : ButtonStyle.Secondary,
            disabled: solved.has(idx),
          })
        ),
      ),
    );
  }
  return buildSafeActionRows(rows);
}

/** The target sequence rendered as spaced emoji for the prompt line. */
export function sequenceDisplay(sequence: number[]): string {
  return sequence.map((i) => EmojiPool[i]).join("  ");
}

export type CaptchaOutcome = "progress" | "solved" | "wrong" | "failed";

/**
 * Advances the challenge by one click. Mutates and returns `state` alongside the
 * outcome: a correct click bumps progress (`solved` once the full sequence is
 * entered); a wrong click resets progress and burns an attempt (`failed` when
 * none remain).
 */
export function advanceCaptcha(
  state: CaptchaState,
  clickedIdx: number,
): { state: CaptchaState; outcome: CaptchaOutcome } {
  if (clickedIdx === state.sequence[state.progress]) {
    state.progress++;
    return {
      state,
      outcome: state.progress >= state.sequence.length ? "solved" : "progress",
    };
  }
  state.progress = 0;
  state.attempts--;
  return { state, outcome: state.attempts <= 0 ? "failed" : "wrong" };
}
