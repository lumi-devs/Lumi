import { describe, it, expect } from "vitest";
import {
  advanceCaptcha,
  buildChallenge,
  buildCaptchaRows,
  EmojiPool,
  MaxAttempts,
  SequenceLength,
  type CaptchaState,
} from "#modules/security/lib/captcha.js";

function freshState(): CaptchaState {
  const { sequence, buttons } = buildChallenge();
  return { sequence, buttons, progress: 0, attempts: MaxAttempts, expiresAt: Date.now() + 60_000 };
}

describe("captcha challenge builder", () => {
  it("produces a sequence and a superset of shuffled buttons", () => {
    const { sequence, buttons } = buildChallenge();
    expect(sequence).toHaveLength(SequenceLength);
    expect(buttons).toHaveLength(SequenceLength * 2);
    // every sequence index is clickable
    for (const idx of sequence) expect(buttons).toContain(idx);
    // indices are valid and unique
    expect(new Set(buttons).size).toBe(buttons.length);
    for (const idx of buttons) expect(EmojiPool[idx]).toBeDefined();
  });
});

describe("advanceCaptcha", () => {
  it("solves when the full sequence is clicked in order", () => {
    const state = freshState();
    for (let i = 0; i < state.sequence.length - 1; i++) {
      const { outcome } = advanceCaptcha(state, state.sequence[i]!);
      expect(outcome).toBe("progress");
    }
    const { outcome } = advanceCaptcha(state, state.sequence.at(-1)!);
    expect(outcome).toBe("solved");
  });

  it("resets progress and burns an attempt on a wrong click", () => {
    const state = freshState();
    advanceCaptcha(state, state.sequence[0]!);
    expect(state.progress).toBe(1);
    const wrong = state.buttons.find((b) => !state.sequence.includes(b))!;
    const { outcome } = advanceCaptcha(state, wrong);
    expect(outcome).toBe("wrong");
    expect(state.progress).toBe(0);
    expect(state.attempts).toBe(MaxAttempts - 1);
  });

  it("fails once all attempts are exhausted", () => {
    const state = freshState();
    const wrong = state.buttons.find((b) => b !== state.sequence[0])!;
    let last = "";
    for (let i = 0; i < MaxAttempts; i++) {
      last = advanceCaptcha(state, wrong).outcome;
    }
    expect(last).toBe("failed");
    expect(state.attempts).toBe(0);
  });
});

describe("buildCaptchaRows", () => {
  it("splits into two rows and disables solved picks", () => {
    const { buttons, sequence } = buildChallenge();
    const rows = buildCaptchaRows(buttons, new Set([sequence[0]!]));
    expect(rows).toHaveLength(2);
    const total = rows.reduce((n, r) => n + r.components.length, 0);
    expect(total).toBe(buttons.length);
  });
});
