import type { ConfigField } from "@lumi/module-runtime";
import { describe, expect, it } from "vitest";
import {
  escalationActions,
  escalationEntries,
  nextEscalationCount,
  parseEscalationCount,
  parseEscalationDraft,
  escalationSummary,
  serializeEscalation,
  upsertEscalation,
} from "../../src/admin/panel/escalation.ts";

const field: ConfigField = {
  key: "warnThresholds",
  label: "Warn Escalation",
  type: "escalation",
  choices: ["timeout", "kick", "ban"],
};

const actions = escalationActions(field);

describe("escalation config", () => {
  it("normalizes stored rules and drops invalid entries", () => {
    const entries = escalationEntries(
      {
        "3": { action: "timeout", duration: 600 },
        "5": { action: "kick", duration: 999 },
        "7": { action: "nope" },
        bad: { action: "ban" },
      },
      actions,
    );

    expect(entries).toEqual([
      { count: 3, action: "timeout", duration: 600 },
      { count: 5, action: "kick", duration: null },
    ]);
    expect(serializeEscalation(entries, actions)).toEqual({
      "3": { action: "timeout", duration: 600 },
      "5": { action: "kick", duration: null },
    });
  });

  it("upserts and sorts rules by warning count", () => {
    const entries = escalationEntries(
      {
        "3": { action: "timeout", duration: 600 },
        "7": { action: "ban" },
      },
      actions,
    );
    const next = upsertEscalation(entries, {
      count: 5,
      action: "kick",
      duration: null,
    });

    expect(next.map((entry) => entry.count)).toEqual([3, 5, 7]);
    expect(nextEscalationCount(entries)).toBe(4);
  });

  it("parses friendly editor input and validates bounds", () => {
    expect(parseEscalationDraft("4", "Timeout", "15", actions)).toEqual({
      count: 4,
      action: "timeout",
      duration: 900,
    });
    expect(parseEscalationDraft("6", "kick", "", actions)).toEqual({
      count: 6,
      action: "kick",
      duration: null,
    });

    expect(() => parseEscalationDraft("0", "kick", "", actions)).toThrow();
    expect(() => parseEscalationDraft("3", "mute", "", actions)).toThrow();
    expect(() => parseEscalationDraft("3", "timeout", "0", actions)).toThrow();
    expect(() => parseEscalationDraft("3x", "kick", "", actions)).toThrow();
    expect(() => parseEscalationDraft("3", "timeout", "2x", actions)).toThrow();
    expect(() => parseEscalationCount("abc")).toThrow();
    expect(() => parseEscalationCount("12x")).toThrow();
    expect(parseEscalationCount("12")).toBe(12);
  });

  it("summarizes rules without rejecting future actions", () => {
    expect(
      escalationSummary({
        "3": { action: "timeout", duration: 60 },
        "5": { action: "mute", duration: null },
        bad: { action: "ban" },
      }),
    ).toBe("2 rules");
  });
});
