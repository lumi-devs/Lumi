import { describe, it, expect } from "bun:test";
import {
  didYouMean,
  editDistance,
  suggestSimilar,
} from "#src/lib/utilities/DidYouMean.js";

describe("editDistance", () => {
  it("scores identical strings as zero", () => {
    expect(editDistance("ban", "ban")).toBe(0);
  });

  it("scores single-typo pairs as one", () => {
    expect(editDistance("kik", "kick")).toBe(1);
  });

  it("scores empty input as the candidate length", () => {
    expect(editDistance("", "ban")).toBe(3);
  });
});

describe("didYouMean", () => {
  const names = ["ban", "kick", "timeout", "help", "nick"];

  it("fixes a single-character typo", () => {
    expect(didYouMean("kik", names)).toBe("kick");
  });

  it("fixes a transposed pair on longer names", () => {
    expect(didYouMean("timout", names)).toBe("timeout");
  });

  it("matches case-insensitively", () => {
    expect(didYouMean("BAN", names)).toBe("ban");
  });

  it("matches exact input", () => {
    expect(didYouMean("help", names)).toBe("help");
  });

  it("returns null when nothing is close", () => {
    expect(didYouMean("zzzzzz", names)).toBeNull();
  });

  it("returns null for short input without a shared first letter", () => {
    expect(didYouMean("zx", ["ban", "kick"])).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(didYouMean("", names)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(didYouMean("ban", [])).toBeNull();
  });
});

describe("suggestSimilar", () => {
  it("caps results at three", () => {
    const names = ["testa", "testb", "testc", "testd", "teste"];
    const suggestions = suggestSimilar("test", names);
    expect(suggestions).toHaveLength(3);
  });

  it("prefers prefix matches first", () => {
    const suggestions = suggestSimilar("ba", ["ban", "kick", "unban"]);
    expect(suggestions[0]).toBe("ban");
  });

  it("returns an empty list when nothing is close", () => {
    expect(suggestSimilar("qqqqqq", ["ban", "kick"])).toEqual([]);
  });

  it("dedupes repeated candidate names", () => {
    expect(suggestSimilar("kik", ["kick", "kick"])).toEqual(["kick"]);
  });
});
