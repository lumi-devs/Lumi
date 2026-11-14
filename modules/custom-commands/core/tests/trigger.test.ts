import { describe, expect, it } from "vitest";
import {
  emojiMatches,
  matchesCustomId,
  matchMessageTrigger,
  safeRegexTest,
  splitArgs,
  validateCommandName,
  validateTrigger,
} from "../trigger.js";

describe("custom command triggers", () => {
  it("validates command names", () => {
    expect(validateCommandName("hello").ok).toBe(true);
    expect(validateCommandName("hello world").ok).toBe(true);
    expect(validateCommandName("").ok).toBe(false);
    expect(validateCommandName("bad/name").ok).toBe(false);
    expect(validateCommandName("-bad").ok).toBe(false);
  });

  it("matches command triggers after the prefix", () => {
    expect(
      matchMessageTrigger("command", "hello", "!hello one two", "!"),
    ).toEqual(["one", "two"]);
    expect(
      matchMessageTrigger("command", "hello", '!hello "one two" three', "!"),
    ).toEqual(["one two", "three"]);
    expect(
      matchMessageTrigger("command", "hello", "!Hello world", "!"),
    ).toEqual(["world"]);
    expect(matchMessageTrigger("command", "hello", "!goodbye", "!")).toBeNull();
    expect(matchMessageTrigger("command", "hello", "hello", "!")).toBeNull();
  });

  it("matches message text trigger families", () => {
    expect(
      matchMessageTrigger("prefix", "?hello", "?hello there", "!"),
    ).toEqual(["there"]);
    expect(matchMessageTrigger("exact", "ping", "  PING ", "!")).toEqual([
      "PING",
    ]);
    expect(
      matchMessageTrigger("startsWith", "say ", "Say hello world", "!"),
    ).toEqual(["hello", "world"]);
    expect(
      matchMessageTrigger("contains", "needle", "a needle here", "!"),
    ).toEqual(["a", "needle", "here"]);
    expect(matchMessageTrigger("regex", "^\\d+$", "12345", "!")).toEqual([
      "12345",
    ]);
    expect(matchMessageTrigger("regex", "^\\d+$", "abc", "!")).toBeNull();
  });

  it("splits quoted arguments", () => {
    expect(splitArgs("one \"two three\" 'four five'")).toEqual([
      "one",
      "two three",
      "four five",
    ]);
  });

  it("rejects dangerous regular expressions", () => {
    expect(safeRegexTest("^hello$", "hello")).toBe(true);
    expect(validateTrigger("regex", "(a+)+$").ok).toBe(false);
    expect(validateTrigger("regex", "(?<=x)y").ok).toBe(false);
    expect(validateTrigger("regex", "(a)\\1").ok).toBe(false);
    expect(validateTrigger("regex", "[abc").ok).toBe(false);
  });

  it("matches reaction emojis in unicode and custom forms", () => {
    expect(emojiMatches("👍", { id: null, name: "👍" })).toBe(true);
    expect(emojiMatches("party:123", { id: "123", name: "party" })).toBe(true);
    expect(emojiMatches("<:party:123>", { id: "123", name: "party" })).toBe(
      true,
    );
    expect(emojiMatches("👍", { id: "123", name: "party" })).toBe(false);
  });

  it("matches component ids with an optional trailing wildcard", () => {
    expect(matchesCustomId("ticket:open", "ticket:open")).toBe(true);
    expect(matchesCustomId("ticket:*", "ticket:open")).toBe(true);
    expect(matchesCustomId("ticket:*", "other:open")).toBe(false);
    expect(matchesCustomId("*", "anything")).toBe(false);
  });

  it("validates trigger types without requiring a value for schedules", () => {
    expect(validateTrigger("interval", "").ok).toBe(true);
    expect(validateTrigger("cron", "").ok).toBe(true);
    expect(validateTrigger("exact", "").ok).toBe(false);
    expect(validateTrigger("button", "foo*").ok).toBe(true);
    expect(validateTrigger("button", "foo*bar").ok).toBe(false);
  });
});
