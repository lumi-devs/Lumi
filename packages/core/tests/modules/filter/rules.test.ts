import { describe, expect, it } from "vitest";
import {
  capsPercent,
  compileRules,
  evaluate,
  evaluateTerms,
  screenRegexRules,
  findBlockedInvite,
  findBlockedLink,
  MAX_REGEX_LENGTH,
  type RuleConfig,
} from "../../../src/modules/filter/lib/rules.js";

const baseConfig: RuleConfig = {
  terms: [],
  regexRules: [],
  blockInvites: false,
  inviteAllowlist: [],
  blockLinks: false,
  linkAllowlist: [],
  maxMentions: 0,
  maxCapsPercent: 0,
  capsMinLength: 12,
};

const rules = (overrides: Partial<RuleConfig>) =>
  compileRules({ ...baseConfig, ...overrides });

describe("findBlockedInvite", () => {
  it("matches discord.gg, discord.com/invite, discordapp.com/invite", () => {
    expect(findBlockedInvite("join discord.gg/abc123", [])).toBe("abc123");
    expect(findBlockedInvite("https://discord.com/invite/xYz-9", [])).toBe(
      "xYz-9",
    );
    expect(findBlockedInvite("discordapp.com/invite/old", [])).toBe("old");
  });

  it("respects the allowlist case-insensitively", () => {
    expect(findBlockedInvite("discord.gg/MyServer", ["myserver"])).toBeNull();
    expect(findBlockedInvite("discord.gg/other", ["myserver"])).toBe("other");
  });

  it("ignores plain text", () => {
    expect(findBlockedInvite("no invites here", [])).toBeNull();
  });
});

describe("findBlockedLink", () => {
  it("finds non-allowlisted hosts", () => {
    expect(findBlockedLink("see https://evil.example/x", [])).toBe(
      "evil.example",
    );
  });

  it("allows allowlisted domains and their subdomains", () => {
    expect(
      findBlockedLink("https://youtube.com/watch", ["youtube.com"]),
    ).toBeNull();
    expect(
      findBlockedLink("https://www.youtube.com/watch", ["youtube.com"]),
    ).toBeNull();
    expect(
      findBlockedLink("https://notyoutube.com/watch", ["youtube.com"]),
    ).toBe("notyoutube.com");
  });

  it("returns the first blocked host among several links", () => {
    expect(
      findBlockedLink("https://ok.com/a https://bad.com/b", ["ok.com"]),
    ).toBe("bad.com");
  });
});

describe("capsPercent", () => {
  it("counts only cased letters", () => {
    expect(capsPercent("ABCD")).toBe(100);
    expect(capsPercent("abcd")).toBe(0);
    expect(capsPercent("AbCd")).toBe(50);
    expect(capsPercent("1234 !!")).toBe(0);
  });
});

describe("screenRegexRules", () => {
  it("skips invalid and oversized patterns, reporting them", () => {
    const errors: string[] = [];
    const screened = screenRegexRules(
      ["valid\\d+", "([unclosed", "x".repeat(MAX_REGEX_LENGTH + 1)],
      (p) => errors.push(p),
    );
    expect(screened).toEqual(["valid\\d+"]);
    expect(errors).toHaveLength(2);
  });

  it("returns sources, never compiled RegExp objects", () => {
    // Guild patterns must not exist as RegExp on this thread - only the worker
    // ever compiles them.
    const compiled = compileRules({ ...baseConfig, regexRules: ["a+b"] });
    expect(compiled.regexSources).toEqual(["a+b"]);
  });
});

describe("evaluate", () => {
  it("matches terms case-insensitively via the automaton", () => {
    const r = rules({ terms: ["badword"] });
    expect(evaluate(r, "well BADWORD indeed", 0)).toEqual({
      rule: "term",
      detail: "badword",
    });
    expect(evaluate(r, "clean message", 0)).toBeNull();
  });

  it("does not run regex rules - those belong to the worker", () => {
    const r = rules({ regexRules: ["fr[e3]{2}\\s+nitro"] });
    expect(evaluate(r, "FR33  NITRO click here", 0)).toBeNull();
  });

  it("blocks invites unless allowlisted", () => {
    const r = rules({ blockInvites: true, inviteAllowlist: ["ours"] });
    expect(evaluate(r, "discord.gg/theirs", 0)?.rule).toBe("invite");
    expect(evaluate(r, "discord.gg/ours", 0)).toBeNull();
  });

  it("blocks links unless allowlisted", () => {
    const r = rules({ blockLinks: true, linkAllowlist: ["github.com"] });
    expect(evaluate(r, "https://scam.io/free", 0)?.rule).toBe("link");
    expect(evaluate(r, "https://github.com/lumi-devs", 0)).toBeNull();
  });

  it("enforces the mention limit only when enabled", () => {
    expect(evaluate(rules({ maxMentions: 3 }), "hi", 4)?.rule).toBe(
      "mentions",
    );
    expect(evaluate(rules({ maxMentions: 3 }), "hi", 3)).toBeNull();
    expect(evaluate(rules({ maxMentions: 0 }), "hi", 40)).toBeNull();
  });

  it("enforces the caps rule with the min-length floor", () => {
    const r = rules({ maxCapsPercent: 70 });
    expect(evaluate(r, "STOP SHOUTING AT ME", 0)?.rule).toBe("caps");
    expect(evaluate(r, "OK", 0)).toBeNull(); // below capsMinLength
    expect(evaluate(r, "perfectly calm message", 0)).toBeNull();
  });

  it("prefers term hits over later rules", () => {
    const r = rules({ terms: ["spam"], blockInvites: true });
    expect(evaluate(r, "spam discord.gg/x", 0)?.rule).toBe("term");
  });
});

describe("normalizeForMatch", () => {
  const withTerm = rules({ terms: ["badword"] });
  const hit = (content: string) => evaluateTerms(withTerm, content);

  it.each([
    ["plain", "you are a badword ok"],
    ["uppercase", "you are a BADWORD ok"],
    ["zero-width space", "you are a bad\u200Bword ok"],
    ["zero-width joiner", "you are a bad\u200Dword ok"],
    ["word joiner", "you are a bad\u2060word ok"],
    ["soft hyphen", "you are a bad\u00ADword ok"],
    ["fullwidth", "you are a ｂａｄｗｏｒｄ ok"],
    ["combining mark", "you are a b\u0301adword ok"],
  ])("catches %s evasion", (_label, content) => {
    expect(hit(content)).toEqual({ rule: "term", detail: "badword" });
  });

  it("does not match unrelated content", () => {
    expect(hit("you are a good person")).toBeNull();
  });

  it("drops terms that normalize away to nothing", () => {
    expect(evaluateTerms(rules({ terms: ["\u200B"] }), "anything")).toBeNull();
  });
});
