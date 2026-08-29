import { describe, expect, it } from "vitest";
import type { User } from "discord.js";
import { formatAuditReason } from "../../../src/lib/utilities/misc.js";

const actor = { tag: "mod#0001", id: "123456789012345678" } as User;
const PREFIX_LEN = `[${actor.tag} | ${actor.id}] `.length;

describe("formatAuditReason", () => {
  it("prefixes the actor and passes short reasons through", () => {
    expect(formatAuditReason(actor, "spam")).toBe(
      `[${actor.tag} | ${actor.id}] spam`,
    );
  });

  it("falls back when no reason is given", () => {
    expect(formatAuditReason(actor, null)).toContain("No reason provided.");
  });

  it("truncates to the limit", () => {
    const out = formatAuditReason(actor, "a".repeat(1000));
    expect(out.length).toBe(512);
  });

  // discord.js runs the reason through encodeURIComponent to build the
  // X-Audit-Log-Reason header, which throws on a lone surrogate. Cutting an
  // astral character in half used to make every moderation action fail.
  it("never cuts an astral character in half", () => {
    const reason = "a".repeat(512 - PREFIX_LEN - 1) + "\u{1F600}" + "tail";
    const out = formatAuditReason(actor, reason);

    expect(() => encodeURIComponent(out)).not.toThrow();
    expect(out.length).toBe(511);
  });

  it("keeps an astral character that fits entirely", () => {
    const reason = "a".repeat(512 - PREFIX_LEN - 2) + "\u{1F600}";
    const out = formatAuditReason(actor, reason);

    expect(() => encodeURIComponent(out)).not.toThrow();
    expect(out.endsWith("\u{1F600}")).toBe(true);
  });
});
