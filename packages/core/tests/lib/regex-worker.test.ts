import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  RegexTimeoutError,
  RegexWorkerHandler,
} from "#lib/regex-worker/RegexWorkerHandler.js";
import { validateRegexPattern } from "#lib/regex-worker/validate.js";

/** The canonical catastrophic-backtracking pattern. */
const EVIL = "(a+)+$";

const handlers: RegexWorkerHandler[] = [];

function makeHandler(
  evalTimeoutMs = 250,
  matchTimeoutMs = 250,
): RegexWorkerHandler {
  const handler = new RegexWorkerHandler({ evalTimeoutMs, matchTimeoutMs });
  handlers.push(handler);
  return handler;
}

beforeAll(() => {
  container.logger ??= {
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
  } as never;
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((h) => h.destroy()));
});

describe("RegexWorkerHandler", () => {
  it("returns the index of the first matching pattern", async () => {
    const handler = makeHandler();
    const patterns = ["nope\\d+", "fr[e3]{2}\\s+nitro"];
    await expect(
      handler.test("g:1", patterns, "FR33  NITRO click here"),
    ).resolves.toBe(1);
  });

  it("returns null when nothing matches", async () => {
    const handler = makeHandler();
    await expect(
      handler.test("g:1", ["\\bscam\\b"], "a perfectly nice message"),
    ).resolves.toBeNull();
  });

  it("short-circuits when there are no patterns", async () => {
    const handler = makeHandler();
    await expect(handler.test("g:1", [], "anything")).resolves.toBeNull();
  });

  it("reuses a loaded pattern set across messages", async () => {
    const handler = makeHandler();
    const patterns = ["spam"];
    await expect(handler.test("g:1", patterns, "spam")).resolves.toBe(0);
    await expect(handler.test("g:1", patterns, "clean")).resolves.toBeNull();
    await expect(handler.test("g:1", patterns, "more spam")).resolves.toBe(0);
  });

  it("times out on catastrophic backtracking and names the pattern", async () => {
    const handler = makeHandler(250);
    const patterns = ["harmless", EVIL];
    // The trailing "!" is what makes it pathological: the match can never
    // succeed, so the engine explores every partition of the run of a's.
    const hostile = `${"a".repeat(40)}!`;

    await expect(handler.test("g:1", patterns, hostile)).rejects.toBeInstanceOf(
      RegexTimeoutError,
    );

    await expect(handler.test("g:1", patterns, hostile)).rejects.toMatchObject({
      patternIndex: 1,
    });
  });

  it("recovers after a timeout - the worker is respawned", async () => {
    const handler = makeHandler(250);
    await expect(
      handler.test("evil:1", [EVIL], `${"a".repeat(40)}!`),
    ).rejects.toBeInstanceOf(RegexTimeoutError);

    await expect(handler.test("good:1", ["spam"], "spam")).resolves.toBe(0);
  });

  it("keeps the main thread responsive while a pattern hangs", async () => {
    const handler = makeHandler(250);
    // Warm the worker first - spawning one is the slow part, and it is not what
    // this test is about.
    await handler.test("warm:1", ["spam"], "spam");

    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);

    await handler
      .test("evil:1", [EVIL], `${"a".repeat(40)}!`)
      .catch(() => undefined);
    clearInterval(timer);

    // A synchronous hang would have starved the interval entirely.
    expect(ticks).toBeGreaterThan(3);
  });
});

describe("RegexWorkerHandler.matchAll", () => {
  it("returns the positions of the matching contents", async () => {
    const handler = makeHandler();
    await expect(
      handler.matchAll("sc[a4]m", ["hello", "SC4M here", "bye", "a scam"]),
    ).resolves.toEqual([1, 3]);
  });

  it("returns an empty list when nothing matches", async () => {
    const handler = makeHandler();
    await expect(
      handler.matchAll("\\bnope\\b", ["one", "two"]),
    ).resolves.toEqual([]);
  });

  it("short-circuits on empty input", async () => {
    const handler = makeHandler();
    await expect(handler.matchAll(EVIL, [])).resolves.toEqual([]);
  });

  it("treats an uncompilable pattern as matching nothing", async () => {
    const handler = makeHandler();
    await expect(handler.matchAll("(unclosed", ["anything"])).resolves.toEqual(
      [],
    );
  });

  it("times out instead of hanging on catastrophic backtracking", async () => {
    const handler = makeHandler(250, 250);
    await expect(
      handler.matchAll(EVIL, ["clean", `${"a".repeat(40)}!`]),
    ).rejects.toBeInstanceOf(RegexTimeoutError);
  });

  it("keeps the main thread responsive while a batch hangs", async () => {
    const handler = makeHandler(250, 250);
    await handler.matchAll("warm", ["warm"]);

    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    await handler
      .matchAll(EVIL, [`${"a".repeat(40)}!`])
      .catch(() => undefined);
    clearInterval(timer);

    expect(ticks).toBeGreaterThan(3);
  });

  it("recovers after a batch timeout", async () => {
    const handler = makeHandler(250, 250);
    await expect(
      handler.matchAll(EVIL, [`${"a".repeat(40)}!`]),
    ).rejects.toBeInstanceOf(RegexTimeoutError);
    await expect(handler.matchAll("spam", ["spam", "ok"])).resolves.toEqual([
      0,
    ]);
  });
});

describe("validateRegexPattern", () => {
  it("accepts an ordinary pattern", async () => {
    await expect(validateRegexPattern("fr[e3]{2}\\s+nitro")).resolves.toBeNull();
  });

  it("rejects invalid syntax", async () => {
    await expect(validateRegexPattern("([unclosed")).resolves.toEqual(
      expect.any(String),
    );
  });

  it("rejects an oversized pattern", async () => {
    await expect(validateRegexPattern("x".repeat(500))).resolves.toContain(
      "longer than",
    );
  });

  it("rejects a catastrophically backtracking pattern", async () => {
    await expect(validateRegexPattern(EVIL)).resolves.toContain(
      "backtracks catastrophically",
    );
  });
});
