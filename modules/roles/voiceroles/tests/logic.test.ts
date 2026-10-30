import { describe, expect, it } from "vitest";
import {
  isGraceExpired,
  resolveGraceUntil,
  selectExpiredSessions,
  selectVoiceRoleMapping,
  shouldRemoveOnLeave,
  type VoiceRoleMapping,
} from "../logic.js";

const mappings: VoiceRoleMapping[] = [
  {
    guildId: "g",
    channelId: "voice-1",
    categoryId: null,
    roleId: "direct-role",
    graceSeconds: 30,
    enabled: true,
  },
  {
    guildId: "g",
    channelId: "voice-2",
    categoryId: "cat-1",
    roleId: "category-role",
    graceSeconds: 0,
    enabled: true,
  },
  {
    guildId: "g",
    channelId: "voice-3",
    categoryId: "cat-2",
    roleId: "disabled-role",
    graceSeconds: 10,
    enabled: false,
  },
];

describe("voiceroles mapping selection", () => {
  it("prefers a direct channel mapping", () => {
    expect(selectVoiceRoleMapping(mappings, "voice-1", "cat-1")?.roleId).toBe(
      "direct-role",
    );
  });

  it("falls back to a category mapping", () => {
    expect(selectVoiceRoleMapping(mappings, "voice-9", "cat-1")?.roleId).toBe(
      "category-role",
    );
  });

  it("ignores disabled mappings", () => {
    expect(selectVoiceRoleMapping(mappings, "voice-3", "cat-2")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(selectVoiceRoleMapping(mappings, "voice-9", "cat-9")).toBeNull();
  });
});

describe("voiceroles grace selection", () => {
  it("returns no grace deadline for zero or negative grace", () => {
    expect(resolveGraceUntil(1_000, 0)).toBeNull();
    expect(resolveGraceUntil(1_000, -5)).toBeNull();
  });

  it("computes a grace deadline in seconds", () => {
    expect(resolveGraceUntil(1_000, 30)?.getTime()).toBe(31_000);
  });

  it("detects expired sessions only when a deadline is set", () => {
    expect(isGraceExpired(null, 1_000)).toBe(false);
    expect(isGraceExpired(new Date(999), 1_000)).toBe(true);
    expect(isGraceExpired(new Date(1_001), 1_000)).toBe(false);
  });

  it("selects expired sessions", () => {
    const sessions = [
      { id: "a", graceUntil: new Date(500) },
      { id: "b", graceUntil: null },
      { id: "c", graceUntil: new Date(2_000) },
    ];
    expect(
      selectExpiredSessions(sessions, 1_000).map((session) => session.id),
    ).toEqual(["a"]);
  });

  it("removes immediately when grace is zero", () => {
    expect(shouldRemoveOnLeave(0)).toBe(true);
    expect(shouldRemoveOnLeave(5)).toBe(false);
  });
});
